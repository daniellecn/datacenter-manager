"""
SNMP Collector Service — Phase 8

Polls network devices via SNMP v2c / v3 using pysnmp.
Collects:
  - sysDescr, sysName, sysObjectID, sysUpTime (RFC 1213)
  - ifTable: interface count, speed (RFC 2863)

Maps results to Device + DeviceNetwork extension row.
Dedup key: management_ip (the address we polled).

Uses pysnmp 6.x (lextudio) asyncio hlapi.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import DeviceType, SNMPVersion
from app.services.sync_engine import SyncStats, upsert_network_device

logger = logging.getLogger(__name__)

# Common sysObjectID prefixes → device type heuristics
_OID_TYPE_HINTS: list[tuple[str, DeviceType]] = [
    ("1.3.6.1.4.1.9.1", DeviceType.switch),    # Cisco
    ("1.3.6.1.4.1.9.2", DeviceType.router),    # Cisco router
    ("1.3.6.1.4.1.11.2.3.7", DeviceType.switch),  # HP/HPE
    ("1.3.6.1.4.1.14525", DeviceType.switch),   # Arista
    ("1.3.6.1.4.1.2636", DeviceType.switch),    # Juniper
    ("1.3.6.1.4.1.12356", DeviceType.firewall),  # Fortinet
    ("1.3.6.1.4.1.3076", DeviceType.firewall),   # Cisco ASA
    ("1.3.6.1.4.1.2021", DeviceType.server),     # Net-SNMP (Linux)
]

# Standard SNMP OIDs
_OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
_OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
_OID_SYS_OID = "1.3.6.1.2.1.1.2.0"
_OID_IF_TABLE = "1.3.6.1.2.1.2.2"
_OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
_OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"


def _guess_device_type(sys_oid: str) -> DeviceType:
    for prefix, dtype in _OID_TYPE_HINTS:
        if sys_oid.startswith(prefix):
            return dtype
    return DeviceType.switch  # default for SNMP-managed devices


def _guess_os_type(sys_descr: str) -> str:
    descr = sys_descr.lower()
    if "ios" in descr and "cisco" in descr:
        return "cisco_ios"
    if "nx-os" in descr or "nxos" in descr:
        return "cisco_nxos"
    if "eos" in descr or "arista" in descr:
        return "arista_eos"
    if "junos" in descr or "juniper" in descr:
        return "juniper_junos"
    if "fortigate" in descr or "fortios" in descr:
        return "fortinet"
    if "linux" in descr:
        return "linux"
    if "windows" in descr:
        return "windows"
    return "other"


class SNMPService:
    """
    Walk MIBs on a list of network devices and upsert Device + DeviceNetwork rows.
    One SNMPService instance is created per integration; each device target is
    polled sequentially (parallel polling would require per-device SnmpEngine instances).
    """

    def __init__(
        self,
        version: SNMPVersion,
        community: str = "public",
        username: str | None = None,
        auth_protocol: str = "SHA",
        auth_key: str | None = None,
        priv_protocol: str = "AES128",
        priv_key: str | None = None,
        port: int = 161,
        timeout: int = 5,
        retries: int = 1,
    ) -> None:
        self.version = version
        self.community = community
        self.username = username
        self.auth_protocol = auth_protocol
        self.auth_key = auth_key
        self.priv_protocol = priv_protocol
        self.priv_key = priv_key
        self.port = port
        self.timeout = timeout
        self.retries = retries

    # ── pysnmp helpers ────────────────────────────────────────────────────────

    def _auth_data(self) -> Any:
        """Build pysnmp auth data object for v2c or v3."""
        from pysnmp.hlapi.asyncio import CommunityData, UsmUserData  # type: ignore[import]

        if self.version == SNMPVersion.v2c or self.version == SNMPVersion.v1:
            return CommunityData(self.community, mpModel=0 if self.version == SNMPVersion.v1 else 1)

        # v3
        from pysnmp.hlapi.asyncio import (  # type: ignore[import]
            usmAesCfb128Protocol,
            usmAesCfb256Protocol,
            usmDESPrivProtocol,
            usmHMACMD5AuthProtocol,
            usmHMACSHAAuthProtocol,
            usmNoAuthProtocol,
            usmNoPrivProtocol,
        )

        proto_map_auth = {
            "SHA": usmHMACSHAAuthProtocol,
            "MD5": usmHMACMD5AuthProtocol,
        }
        proto_map_priv = {
            "AES128": usmAesCfb128Protocol,
            "AES256": usmAesCfb256Protocol,
            "DES": usmDESPrivProtocol,
        }
        auth_proto = proto_map_auth.get(self.auth_protocol, usmHMACSHAAuthProtocol)
        priv_proto = proto_map_priv.get(self.priv_protocol, usmAesCfb128Protocol)

        if self.auth_key and self.priv_key:
            return UsmUserData(
                self.username,
                authKey=self.auth_key,
                privKey=self.priv_key,
                authProtocol=auth_proto,
                privProtocol=priv_proto,
            )
        if self.auth_key:
            return UsmUserData(
                self.username,
                authKey=self.auth_key,
                authProtocol=auth_proto,
                privProtocol=usmNoPrivProtocol,
            )
        return UsmUserData(self.username, authProtocol=usmNoAuthProtocol, privProtocol=usmNoPrivProtocol)

    async def _get_scalars(self, host: str, *oids: str) -> dict[str, str]:
        """GET multiple OIDs in a single request. Returns {oid: str_value}."""
        from pysnmp.hlapi.asyncio import (  # type: ignore[import]
            ContextData,
            ObjectIdentity,
            ObjectType,
            SnmpEngine,
            UdpTransportTarget,
            getCmd,
        )

        engine = SnmpEngine()
        auth_data = self._auth_data()
        transport = UdpTransportTarget((host, self.port), timeout=self.timeout, retries=self.retries)
        context = ContextData()
        objs = [ObjectType(ObjectIdentity(oid)) for oid in oids]

        error_indication, error_status, error_index, var_binds = await getCmd(
            engine, auth_data, transport, context, *objs
        )

        if error_indication:
            raise RuntimeError(f"SNMP error: {error_indication}")
        if error_status:
            raise RuntimeError(f"SNMP PDU error: {error_status.prettyPrint()}")

        return {str(vb[0]): str(vb[1]) for vb in var_binds}

    async def _count_interfaces(self, host: str) -> int:
        """Count ifTable rows (number of interfaces)."""
        from pysnmp.hlapi.asyncio import (  # type: ignore[import]
            ContextData,
            ObjectIdentity,
            ObjectType,
            SnmpEngine,
            UdpTransportTarget,
            nextCmd,
        )

        engine = SnmpEngine()
        auth_data = self._auth_data()
        transport = UdpTransportTarget((host, self.port), timeout=self.timeout, retries=self.retries)
        context = ContextData()

        count = 0
        async for error_indication, error_status, _idx, var_binds in nextCmd(
            engine,
            auth_data,
            transport,
            context,
            ObjectType(ObjectIdentity(_OID_IF_DESCR)),
            lexicographicMode=False,
        ):
            if error_indication or error_status:
                break
            count += len(var_binds)
            if count > 512:  # safety limit — avoid walking huge tables
                break
        return count

    # ── Device polling ────────────────────────────────────────────────────────

    async def poll_device(self, host: str) -> dict[str, Any]:
        """
        Poll one device. Returns normalised data dict with:
          device_data, network_data keys.
        Raises on unrecoverable error.
        """
        scalars = await self._get_scalars(host, _OID_SYS_DESCR, _OID_SYS_NAME, _OID_SYS_OID)

        sys_descr = scalars.get(_OID_SYS_DESCR, "")
        sys_name = scalars.get(_OID_SYS_NAME, host)
        sys_oid = scalars.get(_OID_SYS_OID, "")

        # Interface count (best-effort — don't fail if ifTable walk fails)
        try:
            iface_count = await self._count_interfaces(host)
        except Exception:
            iface_count = None

        device_type = _guess_device_type(sys_oid)
        os_type = _guess_os_type(sys_descr)

        device_data: dict[str, Any] = {
            "name": sys_name.split(".")[0] if sys_name else host,
            "management_ip": host,
            "device_type": device_type,
        }

        network_data: dict[str, Any] = {
            "os_version": sys_descr[:200] if sys_descr else None,
            "snmp_sysoid": sys_oid or None,
        }
        if iface_count is not None:
            network_data["port_count"] = iface_count

        return {"device_data": device_data, "network_data": network_data}

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(self, host: str) -> dict[str, Any]:
        """Poll sysDescr from host — returns ok/message dict."""
        try:
            scalars = await self._get_scalars(host, _OID_SYS_DESCR)
            sys_descr = next(iter(scalars.values()), "")
            return {"ok": True, "message": f"SNMP reachable. sysDescr: {sys_descr[:100]}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Main sync ─────────────────────────────────────────────────────────────

    async def sync_devices(
        self,
        db: AsyncSession,
        stats: SyncStats,
        targets: list[str],
    ) -> None:
        """
        Poll each IP in targets and upsert into DB.
        targets: list of IP/hostname strings from integration's managed devices.
        """
        for host in targets:
            try:
                result = await self.poll_device(host)
                device_data = result["device_data"]
                network_data = result.get("network_data")

                await upsert_network_device(
                    db,
                    device_data=device_data,
                    network_data=network_data,
                    dedup_field="management_ip",
                    dedup_value=host,
                    stats=stats,
                )
                logger.debug("SNMP polled %s successfully", host)
            except Exception as exc:
                logger.warning("SNMP poll failed for %s: %s", host, exc)
                stats.add_error("device", host, str(exc))

        logger.info(
            "SNMP sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
