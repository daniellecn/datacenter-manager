"""
Lenovo xClarity Administrator Integration Service — Phase 8

Polls xClarity REST API for managed server inventory.
Maps server data to Device + DeviceServer extension rows.
Dedup key: device_servers.xclarity_uuid (falls back to serial_number).

API Reference: https://sysmgt.lenovofiles.com/help/topic/lxca_scripting/rest_apis.html
Auth: Basic auth (username:password) or session token via POST /sessions.
All requests use verify_ssl from extra_config (default False for internal CA).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.models.enums import DeviceStatus, DeviceType, ManagementProtocol
from app.services.sync_engine import (
    SyncStats,
    mark_missing_xclarity_devices_inactive,
    upsert_device_by_xclarity_uuid,
)

logger = logging.getLogger(__name__)

# xClarity node type strings → DeviceType enum
_NODE_TYPE_MAP: dict[str, DeviceType] = {
    "Rack-Tower Server": DeviceType.server,
    "Rack server": DeviceType.server,
    "Tower Server": DeviceType.server,
    "Blade Chassis": DeviceType.blade_chassis,
    "Blade server": DeviceType.blade,
    "Storage": DeviceType.storage,
    "Switch": DeviceType.switch,
}

_XCLARITY_STATUS_MAP: dict[str, DeviceStatus] = {
    "Normal": DeviceStatus.active,
    "Warning": DeviceStatus.active,
    "Critical": DeviceStatus.active,
    "Unknown": DeviceStatus.active,
    "Pending": DeviceStatus.maintenance,
}


class XClarityService:
    """
    Fetch server inventory from Lenovo xClarity Administrator and upsert
    into local Device + DeviceServer rows via sync_engine.
    """

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        verify_ssl: bool = False,
    ) -> None:
        self.base_url = f"https://{host}:{port}"
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            auth=(self.username, self.password),
            verify=self.verify_ssl,
            timeout=httpx.Timeout(30.0),
        )

    async def _get_json(self, client: httpx.AsyncClient, path: str) -> Any:
        resp = await client.get(path)
        resp.raise_for_status()
        return resp.json()

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        """Quick auth check — GET /aicc/v1/about."""
        try:
            async with self._client() as client:
                data = await self._get_json(client, "/aicc/v1/about")
            return {
                "ok": True,
                "version": data.get("productVersion", "unknown"),
                "message": "Connection successful",
            }
        except httpx.HTTPStatusError as exc:
            return {"ok": False, "message": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Node data normalisation ───────────────────────────────────────────────

    @staticmethod
    def _extract_management_ip(node: dict[str, Any]) -> str | None:
        for iface in node.get("ipInterfaces", []):
            for addr in iface.get("IPv4Addresses", []):
                ip = addr.get("address", "")
                if ip and ip not in ("0.0.0.0",):
                    return ip
        return None

    @staticmethod
    def _extract_cpu_info(node: dict[str, Any]) -> dict[str, Any]:
        proc = node.get("processorInfo", {})
        if isinstance(proc, list) and proc:
            proc = proc[0]
        if not isinstance(proc, dict):
            return {}
        return {
            "cpu_model": proc.get("family") or proc.get("description"),
            "cpu_socket_count": proc.get("number") or proc.get("processors"),
            "cpu_cores_per_socket": proc.get("cores"),
        }

    @staticmethod
    def _extract_ram_gb(node: dict[str, Any]) -> float | None:
        mem = node.get("memoryInfo", {})
        if not isinstance(mem, dict):
            return None
        modules = mem.get("memoryModules", [])
        if modules:
            total = sum(m.get("capacity", 0) for m in modules if isinstance(m, dict))
            return float(total) if total else None
        # Some xClarity versions return totalMem in MB
        total_mb = mem.get("totalMem")
        if total_mb:
            return round(float(total_mb) / 1024, 1)
        return None

    @staticmethod
    def _extract_firmware(node: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for fw in node.get("firmware", []):
            if not isinstance(fw, dict):
                continue
            fw_type = (fw.get("type") or fw.get("role") or "").upper()
            version = fw.get("version") or fw.get("build")
            if "BIOS" in fw_type or "UEFI" in fw_type:
                result["bios_version"] = version
            elif "BMC" in fw_type or "XCC" in fw_type or "IMM" in fw_type:
                result["bmc_firmware_version"] = version
        return result

    def _node_to_device_data(self, node: dict[str, Any]) -> dict[str, Any]:
        node_type_str = node.get("type", "")
        device_type = _NODE_TYPE_MAP.get(node_type_str, DeviceType.server)
        status_str = node.get("status", "Normal")
        status = _XCLARITY_STATUS_MAP.get(status_str, DeviceStatus.active)

        return {
            "name": node.get("hostname") or node.get("name") or node.get("uuid", ""),
            "device_type": device_type,
            "manufacturer": "Lenovo",
            "model": f"{node.get('machineType', '')} {node.get('model', '')}".strip() or None,
            "serial_number": node.get("serialNumber") or None,
            "status": status,
            "management_ip": self._extract_management_ip(node),
            "management_protocol": ManagementProtocol.xcc,
        }

    def _node_to_server_data(self, node: dict[str, Any]) -> dict[str, Any]:
        cpu = self._extract_cpu_info(node)
        fw = self._extract_firmware(node)
        ram_gb = self._extract_ram_gb(node)

        data: dict[str, Any] = {
            **cpu,
            **fw,
            "form_factor": "1u",
        }
        if ram_gb is not None:
            data["ram_gb"] = ram_gb

        return {k: v for k, v in data.items() if v is not None}

    # ── Main sync ─────────────────────────────────────────────────────────────

    async def sync_all(self, db: Any, stats: SyncStats) -> None:
        """Fetch all managed nodes and upsert into the database."""
        async with self._client() as client:
            data = await self._get_json(client, "/aicc/v1/nodes")

        nodes = data.get("nodeList", data) if isinstance(data, dict) else data
        if not isinstance(nodes, list):
            raise ValueError(f"Unexpected response format: {type(nodes)}")

        seen_uuids: set[str] = set()

        for node in nodes:
            xclarity_uuid = node.get("uuid")
            if not xclarity_uuid:
                logger.warning("xClarity node without UUID skipped: %s", node.get("name"))
                continue

            try:
                device_data = self._node_to_device_data(node)
                server_data = self._node_to_server_data(node)
                await upsert_device_by_xclarity_uuid(
                    db,
                    xclarity_uuid=xclarity_uuid,
                    device_data=device_data,
                    server_data=server_data,
                    stats=stats,
                )
                seen_uuids.add(xclarity_uuid)
            except Exception as exc:
                logger.exception("Failed to upsert xClarity node %s", xclarity_uuid)
                stats.add_error("device", xclarity_uuid, str(exc))

        # Deactivate nodes no longer reported by xClarity
        await mark_missing_xclarity_devices_inactive(
            db, seen_xclarity_uuids=seen_uuids, stats=stats
        )

        logger.info(
            "xClarity sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
