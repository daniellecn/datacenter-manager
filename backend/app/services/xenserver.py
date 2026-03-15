"""
XenServer / XCP-ng Integration Service — Phase 8

Uses XenAPI Python SDK (XAPI RPC over HTTPS).
XenAPI must be installed manually from the XenServer/XCP-ng SDK:
  pip install xapi-client  OR  copy XenAPI.py from the SDK.

Sync scope:
  Pool → Hosts → VMs → Storage Repositories (SRs)

Platform-specific data in platform_data JSONB:
  - Xen VM UUID (opaque_ref), power_state, is_a_template, PV vs HVM
  - Host: uuid, API version, software_version

Dedup keys:
  - VirtualizationCluster: pool name + platform
  - VirtualizationHost: platform_uuid (host UUID from Xen)
  - VirtualMachine: platform_vm_id (Xen VM UUID)
  - Datastore: cluster_id + SR name

XenAPI is synchronous — all calls wrapped in asyncio.to_thread().
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

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

# XenAPI power_state → VMStatus
_POWER_STATE_MAP: dict[str, VMStatus] = {
    "Running": VMStatus.running,
    "Halted": VMStatus.stopped,
    "Suspended": VMStatus.suspended,
    "Paused": VMStatus.suspended,
    "Migrating": VMStatus.migrating,
    "Unknown": VMStatus.stopped,
}

# SR type → DatastoreType
_SR_TYPE_MAP: dict[str, DatastoreType] = {
    "lvm": DatastoreType.iscsi,
    "lvmoiscsi": DatastoreType.iscsi,
    "lvmohba": DatastoreType.fc,
    "nfs": DatastoreType.nfs,
    "iso": DatastoreType.nfs,
    "smb": DatastoreType.smb,
    "ext": DatastoreType.nfs,
    "udev": DatastoreType.iscsi,
    "vhd": DatastoreType.vmfs,
    "shm": DatastoreType.nfs,
}


def _import_xenapi() -> Any:
    """Import XenAPI module; raises ImportError with helpful message if missing."""
    try:
        import XenAPI  # type: ignore[import]
        return XenAPI
    except ImportError:
        raise ImportError(
            "XenAPI module not found. Install it from the XenServer/XCP-ng SDK: "
            "https://docs.citrix.com/en-us/xencenter/7-1/sdk-xenapi-overview.html"
        )


def _xen_connect(host: str, username: str, password: str, verify_ssl: bool) -> tuple[Any, Any]:
    """Create and login a XenAPI session (sync)."""
    XenAPI = _import_xenapi()

    url = f"https://{host}"
    session = XenAPI.Session(url, ignore_ssl=not verify_ssl)
    session.login_with_password(username, password, "2.0", "datacenter-manager")
    return XenAPI, session


def _xen_get_all(session: Any) -> dict[str, Any]:
    """Fetch all relevant records in a single sync call."""
    pools = session.xenapi.pool.get_all_records()
    hosts = session.xenapi.host.get_all_records()
    vms = session.xenapi.VM.get_all_records()
    vbds = session.xenapi.VBD.get_all_records()
    srs = session.xenapi.SR.get_all_records()
    return {
        "pools": pools,
        "hosts": hosts,
        "vms": vms,
        "vbds": vbds,
        "srs": srs,
    }


class XenServerService:
    """
    Sync XenServer / XCP-ng inventory (VMs, hosts, storage) to local database.
    """

    def __init__(
        self,
        host: str,
        port: int = 443,
        username: str = "root",
        password: str = "",
        verify_ssl: bool = False,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        def _test_sync() -> str:
            XenAPI, session = _xen_connect(
                self.host, self.username, self.password, self.verify_ssl
            )
            try:
                pools = session.xenapi.pool.get_all_records()
                pool_names = [p.get("name_label") for p in pools.values()]
                return str(pool_names)
            finally:
                try:
                    session.logout()
                except Exception:
                    pass

        try:
            pools_str = await asyncio.to_thread(_test_sync)
            return {"ok": True, "message": f"Connected to XenServer. Pools: {pools_str}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _vm_status(power_state: str) -> VMStatus:
        return _POWER_STATE_MAP.get(power_state, VMStatus.stopped)

    @staticmethod
    def _sr_type(sr_type_str: str) -> DatastoreType:
        return _SR_TYPE_MAP.get(sr_type_str.lower(), DatastoreType.nfs)

    @staticmethod
    def _ram_gb(bytes_val: Any) -> float | None:
        try:
            gb = float(bytes_val) / (1024 ** 3)
            return round(gb, 1)
        except (TypeError, ValueError):
            return None

    # ── Main sync ─────────────────────────────────────────────────────────────

    async def sync_all(self, db: Any, stats: SyncStats) -> None:
        # Fetch all data from XenAPI in a single thread call to avoid
        # thread-pool overhead per-call
        def _fetch_all() -> dict[str, Any]:
            _, session = _xen_connect(
                self.host, self.username, self.password, self.verify_ssl
            )
            try:
                return _xen_get_all(session)
            finally:
                try:
                    session.logout()
                except Exception:
                    pass

        data = await asyncio.to_thread(_fetch_all)
        await self._process(db, data, stats)

    async def _process(self, db: Any, data: dict[str, Any], stats: SyncStats) -> None:
        pools = data["pools"]
        hosts = data["hosts"]
        vms = data["vms"]
        srs = data["srs"]

        # ── Cluster (one pool = one cluster) ─────────────────────────────────
        for pool_ref, pool in pools.items():
            pool_name = pool.get("name_label") or self.host
            cluster_data = {
                "name": pool_name,
                "platform": VirtPlatform.citrix_xenserver,
                "platform_data": {
                    "pool_ref": str(pool_ref),
                    "description": pool.get("name_description"),
                    "master": str(pool.get("master", "")),
                },
            }
            cluster = await upsert_virt_cluster(db, cluster_data=cluster_data, stats=stats)

            # ── Hosts ─────────────────────────────────────────────────────────
            host_ref_to_db_id: dict[str, Any] = {}

            for host_ref, xen_host in hosts.items():
                host_uuid = xen_host.get("uuid", str(host_ref))
                host_name = xen_host.get("hostname") or xen_host.get("name_label") or host_uuid
                sw = xen_host.get("software_version", {})

                # CPU/RAM from host metrics (may be empty ref)
                cpu_info = xen_host.get("cpu_info", {})
                cpu_count = int(cpu_info.get("cpu_count", 0)) if cpu_info else None
                ram_bytes = xen_host.get("memory_total")  # may not be in static record

                host_data = {
                    "name": host_name,
                    "platform_uuid": host_uuid,
                    "status": "active",
                    "cpu_count": cpu_count,
                    "ram_gb": self._ram_gb(ram_bytes),
                    "platform_data": {
                        "host_ref": str(host_ref),
                        "uuid": host_uuid,
                        "xen_version": sw.get("xen"),
                        "product_version": sw.get("product_version"),
                        "build_number": sw.get("build_number"),
                    },
                }
                host_obj = await upsert_virt_host(
                    db, cluster_id=cluster.id, host_data=host_data, stats=stats
                )
                host_ref_to_db_id[str(host_ref)] = host_obj.id

            # ── VMs ───────────────────────────────────────────────────────────
            seen_by_host: dict[str, set[str]] = {
                str(hid): set() for hid in host_ref_to_db_id.values()
            }

            for vm_ref, xen_vm in vms.items():
                # Skip templates and control domains
                if xen_vm.get("is_a_template") or xen_vm.get("is_control_domain"):
                    continue

                vm_uuid = xen_vm.get("uuid", str(vm_ref))
                vm_name = xen_vm.get("name_label") or vm_uuid
                power_state = xen_vm.get("power_state", "Halted")
                host_ref = str(xen_vm.get("resident_on", ""))
                cpu_count = int(xen_vm.get("VCPUs_max", 0)) or None
                ram_bytes = xen_vm.get("memory_target") or xen_vm.get("memory_static_max")

                host_db_id = host_ref_to_db_id.get(host_ref)
                if host_db_id is None:
                    # VM not currently running on any tracked host — assign to pool master
                    master_ref = pools[pool_ref].get("master", "")
                    host_db_id = host_ref_to_db_id.get(str(master_ref))
                if host_db_id is None:
                    logger.debug("XenServer VM %s has no resolvable host, skipping", vm_name)
                    stats.items_unchanged += 1
                    continue

                vm_data = {
                    "name": vm_name,
                    "platform_vm_id": vm_uuid,
                    "status": self._vm_status(power_state),
                    "cpu_count": cpu_count,
                    "ram_gb": self._ram_gb(ram_bytes),
                    "platform_data": {
                        "vm_ref": str(vm_ref),
                        "uuid": vm_uuid,
                        "power_state": power_state,
                        "hvm": bool(xen_vm.get("HVM_boot_policy")),
                        "description": xen_vm.get("name_description"),
                    },
                }
                await upsert_vm(db, host_id=host_db_id, vm_data=vm_data, stats=stats)
                seen_by_host.setdefault(str(host_db_id), set()).add(vm_uuid)

            for host_db_id, seen in seen_by_host.items():
                await mark_missing_vms_inactive(
                    db, host_id=host_db_id, seen_platform_ids=seen, stats=stats
                )

            # ── Storage Repositories ──────────────────────────────────────────
            for sr_ref, xen_sr in srs.items():
                sr_name = xen_sr.get("name_label", str(sr_ref))
                sr_type = xen_sr.get("type", "nfs")
                # Skip ISO/special SRs
                if sr_type in ("udev", "xenapi"):
                    continue
                physical_size = xen_sr.get("physical_size")
                physical_utilisation = xen_sr.get("physical_utilisation")

                cap_gb = self._ram_gb(physical_size)  # same byte→GB conversion
                free_gb: float | None = None
                if cap_gb is not None and physical_utilisation is not None:
                    used_gb = self._ram_gb(physical_utilisation)
                    if used_gb is not None:
                        free_gb = round(cap_gb - used_gb, 1)

                ds_data = {
                    "name": sr_name,
                    "datastore_type": self._sr_type(sr_type),
                    "capacity_gb": cap_gb,
                    "free_gb": free_gb,
                    "status": "active",
                }
                await upsert_datastore(
                    db, cluster_id=cluster.id, datastore_data=ds_data, stats=stats
                )

            # Only process first pool (XenServer pools have a single pool record)
            break

        logger.info(
            "XenServer sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
