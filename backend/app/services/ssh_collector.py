"""
SSH Collector Service — Phase 8

Connects to network devices via SSH using Netmiko (multi-vendor).
Supported OS types: cisco_ios, cisco_nxos, arista_eos, juniper_junos, fortinet.

Collects from each device:
  - OS type and version (from show version / get system status)
  - Interface count (from show interfaces terse / brief)

All Netmiko I/O runs in a thread-pool executor via asyncio.to_thread()
because Netmiko is synchronous.

Credential resolution order:
  1. Device-level SSH creds (device.ssh_username + device.ssh_password_enc / ssh_key_enc)
  2. Integration-level default credentials
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt
from app.models.device import Device
from app.models.enums import DeviceStatus, DeviceType
from app.services.sync_engine import SyncStats, upsert_network_device

logger = logging.getLogger(__name__)

# Netmiko device_type string per OS
_OS_TO_NETMIKO: dict[str, str] = {
    "cisco_ios": "cisco_ios",
    "cisco_nxos": "cisco_nxos",
    "arista_eos": "arista_eos",
    "juniper_junos": "juniper_junos",
    "fortinet": "fortinet",
    "linux": "linux",
}

# Show version commands per OS type
_SHOW_VERSION_CMD: dict[str, str] = {
    "cisco_ios": "show version",
    "cisco_nxos": "show version",
    "arista_eos": "show version",
    "juniper_junos": "show version",
    "fortinet": "get system status",
}

# Show interfaces (brief/count) command per OS
_SHOW_IFACE_CMD: dict[str, str] = {
    "cisco_ios": "show interfaces | include line protocol",
    "cisco_nxos": "show interface status",
    "arista_eos": "show interfaces status",
    "juniper_junos": "show interfaces terse",
    "fortinet": "get system interface",
}


def _parse_version(os_type: str, output: str) -> str | None:
    """Extract version string from show version output."""
    patterns = {
        "cisco_ios": r"Cisco IOS.*Version\s+([\w\.\(\)]+)",
        "cisco_nxos": r"NXOS:\s+version\s+([\w\.\(\)]+)",
        "arista_eos": r"EOS\s+version:\s+([\w\.\-]+)",
        "juniper_junos": r"Junos:\s+([\w\.\-]+)",
        "fortinet": r"Version:\s+(FortiGate[- ]v[\w\.\-]+)",
    }
    pattern = patterns.get(os_type)
    if pattern:
        m = re.search(pattern, output, re.IGNORECASE)
        if m:
            return m.group(1)
    # Fallback: first line of output, trimmed
    first_line = output.strip().splitlines()[0] if output.strip() else None
    return first_line[:200] if first_line else None


def _count_interfaces(os_type: str, output: str) -> int | None:
    """Count interfaces from show interfaces output."""
    lines = [ln for ln in output.splitlines() if ln.strip()]
    if os_type in ("cisco_ios",):
        # lines contain "interface line protocol is ..."
        return len([ln for ln in lines if "line protocol" in ln.lower()])
    if os_type in ("cisco_nxos", "arista_eos"):
        # table output — count data rows (skip header)
        return max(0, len(lines) - 1)
    if os_type == "juniper_junos":
        # "em0        up    up   ... " style rows
        return len([ln for ln in lines if not ln.startswith(" ")])
    if os_type == "fortinet":
        return len([ln for ln in lines if "==" in ln])
    return None


def _connect_and_collect(
    host: str,
    port: int,
    os_type: str,
    username: str,
    password: str | None,
    key_file: str | None,
    timeout: int,
) -> dict[str, Any]:
    """
    Synchronous Netmiko collection — runs in thread pool.
    Returns raw output dict: {"version_out": str, "iface_out": str}
    """
    from netmiko import ConnectHandler  # type: ignore[import]

    device_type = _OS_TO_NETMIKO.get(os_type, "autodetect")
    params: dict[str, Any] = {
        "device_type": device_type,
        "host": host,
        "port": port,
        "username": username,
        "timeout": timeout,
        "session_timeout": timeout,
        "banner_timeout": 20,
        "fast_cli": False,
    }
    if password:
        params["password"] = password
    if key_file:
        params["key_file"] = key_file

    with ConnectHandler(**params) as conn:
        version_cmd = _SHOW_VERSION_CMD.get(os_type, "show version")
        version_out = conn.send_command(version_cmd, read_timeout=30)

        iface_cmd = _SHOW_IFACE_CMD.get(os_type)
        iface_out = conn.send_command(iface_cmd, read_timeout=30) if iface_cmd else ""

    return {"version_out": version_out, "iface_out": iface_out}


class SSHCollectorService:
    """
    Execute show commands via Netmiko on network devices and upsert
    Device + DeviceNetwork rows via sync_engine.
    """

    def __init__(
        self,
        default_username: str,
        default_password: str | None = None,
        default_key_file: str | None = None,
        default_os_type: str = "cisco_ios",
        port: int = 22,
        timeout: int = 30,
    ) -> None:
        self.default_username = default_username
        self.default_password = default_password
        self.default_key_file = default_key_file
        self.default_os_type = default_os_type
        self.port = port
        self.timeout = timeout

    # ── Credential resolution ─────────────────────────────────────────────────

    @staticmethod
    def _resolve_creds(
        device: Device,
        default_username: str,
        default_password: str | None,
        default_key_file: str | None,
    ) -> tuple[str, str | None, str | None]:
        """Return (username, password, key_file) preferring device-level creds."""
        username = device.ssh_username or default_username
        password: str | None = None
        key_file: str | None = None

        if device.ssh_password_enc:
            try:
                password = decrypt(device.ssh_password_enc)
            except Exception:
                password = default_password
        else:
            password = default_password

        if device.ssh_key_enc:
            try:
                key_file = decrypt(device.ssh_key_enc)
            except Exception:
                key_file = default_key_file
        else:
            key_file = default_key_file

        return username, password, key_file

    # ── Single device collection ──────────────────────────────────────────────

    async def collect_device(
        self,
        host: str,
        os_type: str,
        username: str,
        password: str | None,
        key_file: str | None,
    ) -> dict[str, Any]:
        """
        Async wrapper — runs Netmiko in thread pool.
        Returns normalised device_data + network_data dicts.
        """
        raw = await asyncio.to_thread(
            _connect_and_collect,
            host, self.port, os_type, username, password, key_file, self.timeout,
        )

        version = _parse_version(os_type, raw.get("version_out", ""))
        iface_count = _count_interfaces(os_type, raw.get("iface_out", ""))

        device_data: dict[str, Any] = {
            "management_ip": host,
            "device_type": DeviceType.switch,
            "status": DeviceStatus.active,
        }
        network_data: dict[str, Any] = {
            "os_type": os_type,
        }
        if version:
            network_data["os_version"] = version
        if iface_count is not None:
            network_data["port_count"] = iface_count

        return {"device_data": device_data, "network_data": network_data}

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(
        self,
        host: str,
        os_type: str,
        username: str,
        password: str | None = None,
    ) -> dict[str, Any]:
        """Quick connect test — connect and disconnect."""
        def _test_sync() -> str:
            from netmiko import ConnectHandler  # type: ignore[import]
            device_type = _OS_TO_NETMIKO.get(os_type, "autodetect")
            with ConnectHandler(
                device_type=device_type,
                host=host,
                port=self.port,
                username=username,
                password=password or "",
                timeout=self.timeout,
            ) as conn:
                prompt = conn.find_prompt()
            return prompt

        try:
            prompt = await asyncio.to_thread(_test_sync)
            return {"ok": True, "message": f"SSH connected. Prompt: {prompt}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── DB-driven sync ────────────────────────────────────────────────────────

    async def sync_managed_devices(
        self,
        db: AsyncSession,
        stats: SyncStats,
        targets: list[dict[str, Any]],
    ) -> None:
        """
        targets: list of {"ip": "...", "os_type": "...", "device_name": "..."} dicts.
        Polls each via SSH and upserts Device + DeviceNetwork.
        """
        for target in targets:
            host = target.get("ip", "")
            os_type = target.get("os_type", self.default_os_type)
            if not host:
                continue

            try:
                result = await self.collect_device(
                    host=host,
                    os_type=os_type,
                    username=self.default_username,
                    password=self.default_password,
                    key_file=self.default_key_file,
                )
                device_data = result["device_data"]
                if target.get("device_name"):
                    device_data["name"] = target["device_name"]

                await upsert_network_device(
                    db,
                    device_data=device_data,
                    network_data=result.get("network_data"),
                    dedup_field="management_ip",
                    dedup_value=host,
                    stats=stats,
                )
                logger.debug("SSH collected %s (%s) successfully", host, os_type)
            except Exception as exc:
                logger.warning("SSH collection failed for %s: %s", host, exc)
                stats.add_error("device", host, str(exc))

        logger.info(
            "SSH sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
