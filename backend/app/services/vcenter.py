"""
VMware vCenter Integration Service — Phase 8

Uses vCenter REST API (vSphere 7+) via httpx async client.
Auth: POST /api/session → session token in response body.

Sync scope:
  vCenter Cluster → ESXi Hosts → VMs → Datastores

Platform-specific data stored in platform_data JSONB:
  - MOREF IDs (cluster_id, host_id, vm_id)
  - vCenter-specific attributes (ha_enabled, resource_pool, guest_os, tools_status, etc.)

Dedup keys:
  - VirtualizationCluster: name + platform
  - VirtualizationHost: platform_uuid (host MOREF)
  - VirtualMachine: platform_vm_id (VM MOREF)
  - Datastore: cluster_id + name
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.models.enums import DatastoreType, VMStatus, VirtPlatform
from app.services.sync_engine import (
    SyncStats,
    mark_missing_vms_inactive,
    upsert_datastore,
    upsert_virt_cluster,
    upsert_virt_host,
    upsert_vm,
)

logger = logging.getLogger(__name__)

_POWER_STATE_MAP: dict[str, VMStatus] = {
    "POWERED_ON": VMStatus.running,
    "POWERED_OFF": VMStatus.stopped,
    "SUSPENDED": VMStatus.suspended,
}

_DATASTORE_TYPE_MAP: dict[str, DatastoreType] = {
    "VMFS": DatastoreType.vmfs,
    "NFS": DatastoreType.nfs,
    "NFS41": DatastoreType.nfs,
    "VSAN": DatastoreType.vsan,
    "VVOL": DatastoreType.vmfs,  # closest approximation
}


class VCenterService:
    """
    Sync VMware vCenter inventory (clusters, hosts, VMs, datastores) to DB.
    """

    def __init__(
        self,
        host: str,
        port: int = 443,
        username: str = "administrator@vsphere.local",
        password: str = "",
        verify_ssl: bool = False,
        datacenter_id: str | None = None,
    ) -> None:
        self.base_url = f"https://{host}:{port}"
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl
        self.datacenter_id = datacenter_id  # filter to specific vCenter datacenter

    # ── Auth ──────────────────────────────────────────────────────────────────

    async def _get_session_token(self, client: httpx.AsyncClient) -> str:
        """POST /api/session with Basic auth → returns session token string."""
        resp = await client.post(
            "/api/session",
            auth=(self.username, self.password),
        )
        resp.raise_for_status()
        token = resp.json()
        if not isinstance(token, str):
            raise ValueError(f"Unexpected session token type: {type(token)}")
        return token

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            verify=self.verify_ssl,
            timeout=httpx.Timeout(60.0),
        )

    async def _api_get(
        self, client: httpx.AsyncClient, token: str, path: str, **params: Any
    ) -> Any:
        resp = await client.get(
            path,
            headers={"vmware-api-session-id": token},
            params={k: v for k, v in params.items() if v is not None},
        )
        resp.raise_for_status()
        return resp.json()

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        """Obtain session token and fetch API version."""
        try:
            async with self._client() as client:
                token = await self._get_session_token(client)
                # Verify by listing datacenters (lightweight call)
                dcs = await self._api_get(client, token, "/api/vcenter/datacenter")
                await client.delete("/api/session", headers={"vmware-api-session-id": token})
            return {
                "ok": True,
                "message": f"Connected to vCenter. Found {len(dcs)} datacenter(s).",
            }
        except httpx.HTTPStatusError as exc:
            return {"ok": False, "message": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Data normalisation ────────────────────────────────────────────────────

    @staticmethod
    def _host_status(conn_state: str, power_state: str) -> str:
        if conn_state == "CONNECTED" and power_state == "POWERED_ON":
            return "active"
        if power_state == "POWERED_OFF":
            return "maintenance"
        return "active"

    @staticmethod
    def _datastore_type(ds_type_str: str) -> DatastoreType:
        return _DATASTORE_TYPE_MAP.get(ds_type_str.upper(), DatastoreType.vmfs)

    # ── Main sync ─────────────────────────────────────────────────────────────

    async def sync_all(self, db: Any, stats: SyncStats) -> None:
        async with self._client() as client:
            token = await self._get_session_token(client)
            try:
                await self._sync_with_token(db, client, token, stats)
            finally:
                try:
                    await client.delete(
                        "/api/session",
                        headers={"vmware-api-session-id": token},
                    )
                except Exception:
                    pass  # best-effort session cleanup

    async def _sync_with_token(
        self, db: Any, client: httpx.AsyncClient, token: str, stats: SyncStats
    ) -> None:
        # ── Clusters ──────────────────────────────────────────────────────────
        cluster_params: dict[str, Any] = {}
        if self.datacenter_id:
            cluster_params["datacenters"] = self.datacenter_id

        vc_clusters = await self._api_get(client, token, "/api/vcenter/cluster", **cluster_params)
        if not isinstance(vc_clusters, list):
            raise ValueError(f"Unexpected cluster list format: {type(vc_clusters)}")

        for vc_cluster in vc_clusters:
            cluster_moref = vc_cluster.get("cluster", "")
            cluster_name = vc_cluster.get("name", cluster_moref)

            cluster_data = {
                "name": cluster_name,
                "platform": VirtPlatform.vmware_vsphere,
                "platform_data": {
                    "moref": cluster_moref,
                    "ha_enabled": vc_cluster.get("ha_enabled"),
                    "drs_enabled": vc_cluster.get("drs_enabled"),
                },
            }
            cluster = await upsert_virt_cluster(db, cluster_data=cluster_data, stats=stats)

            # ── Hosts in this cluster ─────────────────────────────────────────
            vc_hosts = await self._api_get(
                client, token, "/api/vcenter/host", clusters=cluster_moref
            )
            if not isinstance(vc_hosts, list):
                vc_hosts = []

            host_moref_to_db_id: dict[str, Any] = {}

            for vc_host in vc_hosts:
                host_moref = vc_host.get("host", "")
                host_name = vc_host.get("name", host_moref)
                conn_state = vc_host.get("connection_state", "CONNECTED")
                power_state = vc_host.get("power_state", "POWERED_ON")
                cpu_count = vc_host.get("cpu_count") or 0
                ram_mib = vc_host.get("memory_size_MiB") or vc_host.get("memory_size_mib") or 0

                host_data = {
                    "name": host_name,
                    "platform_uuid": host_moref,
                    "status": self._host_status(conn_state, power_state),
                    "cpu_count": cpu_count,
                    "ram_gb": round(ram_mib / 1024, 1) if ram_mib else None,
                    "platform_data": {
                        "moref": host_moref,
                        "connection_state": conn_state,
                        "power_state": power_state,
                    },
                }
                host_obj = await upsert_virt_host(
                    db, cluster_id=cluster.id, host_data=host_data, stats=stats
                )
                host_moref_to_db_id[host_moref] = host_obj.id

            # ── VMs in this cluster ───────────────────────────────────────────
            vc_vms = await self._api_get(
                client, token, "/api/vcenter/vm", clusters=cluster_moref
            )
            if not isinstance(vc_vms, list):
                vc_vms = []

            seen_vm_ids: dict[str, set[str]] = {str(hid): set() for hid in host_moref_to_db_id.values()}

            for vc_vm in vc_vms:
                vm_moref = vc_vm.get("vm", "")
                vm_name = vc_vm.get("name", vm_moref)
                power_state = vc_vm.get("power_state", "POWERED_OFF")
                cpu_count = vc_vm.get("cpu_count") or 0
                ram_mib = vc_vm.get("memory_size_MiB") or vc_vm.get("memory_size_mib") or 0
                host_moref = vc_vm.get("host", "")

                # Map vCenter host MOREF → DB host ID
                host_db_id = host_moref_to_db_id.get(host_moref)
                if host_db_id is None:
                    # VM on unknown host — skip
                    logger.debug("VM %s on unknown host MOREF %s, skipping", vm_name, host_moref)
                    stats.items_unchanged += 1
                    continue

                vm_data = {
                    "name": vm_name,
                    "platform_vm_id": vm_moref,
                    "status": _POWER_STATE_MAP.get(power_state, VMStatus.stopped),
                    "cpu_count": cpu_count,
                    "ram_gb": round(ram_mib / 1024, 1) if ram_mib else None,
                    "platform_data": {
                        "moref": vm_moref,
                        "power_state": power_state,
                        "guest_os": vc_vm.get("guest_OS"),
                    },
                }
                await upsert_vm(db, host_id=host_db_id, vm_data=vm_data, stats=stats)
                seen_vm_ids.setdefault(str(host_db_id), set()).add(vm_moref)

            # Mark VMs no longer on each host as stopped
            for host_db_id, seen in seen_vm_ids.items():
                await mark_missing_vms_inactive(
                    db,
                    host_id=host_db_id,
                    seen_platform_ids=seen,
                    stats=stats,
                )

            # ── Datastores in this cluster ────────────────────────────────────
            vc_datastores = await self._api_get(
                client, token, "/api/vcenter/datastore", clusters=cluster_moref
            )
            if not isinstance(vc_datastores, list):
                vc_datastores = []

            for vc_ds in vc_datastores:
                ds_type_str = vc_ds.get("type", "VMFS")
                cap_bytes = vc_ds.get("capacity") or 0
                free_bytes = vc_ds.get("free_space") or 0

                ds_data = {
                    "name": vc_ds.get("name", vc_ds.get("datastore", "")),
                    "datastore_type": self._datastore_type(ds_type_str),
                    "capacity_gb": round(cap_bytes / (1024**3), 1) if cap_bytes else None,
                    "free_gb": round(free_bytes / (1024**3), 1) if free_bytes else None,
                    "status": "active",
                }
                await upsert_datastore(
                    db, cluster_id=cluster.id, datastore_data=ds_data, stats=stats
                )

        logger.info(
            "vCenter sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
