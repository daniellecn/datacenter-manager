"""
SCVMM Integration Service — Phase 8

Supports two authentication methods, chosen by extra_config.use_winrm:
  1. SCVMM REST API (System Center 2019+) — httpx, NTLM/Kerberos auth
  2. WinRM + PowerShell fallback — pywinrm, for older SCVMM installations

Sync scope:
  Host Groups → Hyper-V Hosts → VMs → Cluster Shared Volumes (datastores)

Platform-specific data in platform_data JSONB:
  - SCVMM VM GUID, cloud name, host group, generation (1/2), dynamic memory
  - Host: host_group, agent_version, cluster_name

Dedup keys:
  - VirtualizationCluster: name + platform (hyper_v)
  - VirtualizationHost: platform_uuid (SCVMM host ID GUID)
  - VirtualMachine: platform_vm_id (SCVMM VM GUID)
  - Datastore: cluster_id + name
"""
from __future__ import annotations

import json
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

_VM_STATUS_MAP: dict[str, VMStatus] = {
    "Running": VMStatus.running,
    "Stopped": VMStatus.stopped,
    "Paused": VMStatus.suspended,
    "Saved": VMStatus.suspended,
    "Starting": VMStatus.running,
    "Stopping": VMStatus.stopped,
    "PowerOff": VMStatus.stopped,
    "UnderCreation": VMStatus.stopped,
    "CreationFailed": VMStatus.error,
    "CustomizationFailed": VMStatus.error,
    "UpdateFailed": VMStatus.error,
}


class SCVMMService:
    """
    Sync Microsoft SCVMM / Hyper-V inventory to local database.
    Selects REST or WinRM transport based on use_winrm flag.
    """

    def __init__(
        self,
        host: str,
        port: int = 8090,
        username: str = "",
        password: str = "",
        use_winrm: bool = False,
        verify_ssl: bool = False,
        host_group: str = "",
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_winrm = use_winrm
        self.verify_ssl = verify_ssl
        self.host_group = host_group

    # ─────────────────────────────────────────────────────────────────────────
    # REST API transport (SCVMM 2019+)
    # ─────────────────────────────────────────────────────────────────────────

    def _rest_base_url(self) -> str:
        return f"https://{self.host}:{self.port}/VMM/Microsoft.Management.Odata.svc"

    async def _rest_get(self, path: str, params: dict[str, str] | None = None) -> Any:
        import httpx

        try:
            from httpx_ntlm import HttpNtlmAuth  # type: ignore[import]
            auth: Any = HttpNtlmAuth(self.username, self.password)
        except ImportError:
            # Fallback to Basic auth if httpx-ntlm is not installed
            auth = (self.username, self.password)

        async with httpx.AsyncClient(verify=self.verify_ssl, timeout=60.0, auth=auth) as client:
            resp = await client.get(
                f"{self._rest_base_url()}/{path}",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()

    async def _fetch_vms_rest(self) -> list[dict[str, Any]]:
        data = await self._rest_get("VirtualMachines", {"$top": "1000"})
        return data.get("value", data) if isinstance(data, dict) else data

    async def _fetch_hosts_rest(self) -> list[dict[str, Any]]:
        data = await self._rest_get("VMHosts", {"$top": "1000"})
        return data.get("value", data) if isinstance(data, dict) else data

    async def _fetch_clouds_rest(self) -> list[dict[str, Any]]:
        try:
            data = await self._rest_get("Clouds", {"$top": "200"})
            return data.get("value", data) if isinstance(data, dict) else data
        except Exception:
            return []

    # ─────────────────────────────────────────────────────────────────────────
    # WinRM / PowerShell transport
    # ─────────────────────────────────────────────────────────────────────────

    def _winrm_session(self) -> Any:
        import winrm  # type: ignore[import]
        return winrm.Session(
            self.host,
            auth=(self.username, self.password),
            transport="ntlm",
        )

    def _run_ps(self, script: str) -> Any:
        session = self._winrm_session()
        r = session.run_ps(script)
        if r.status_code != 0:
            raise RuntimeError(f"PowerShell error: {r.std_err.decode()}")
        output = r.std_out.decode().strip()
        if not output:
            return []
        return json.loads(output)

    async def _fetch_vms_winrm(self) -> list[dict[str, Any]]:
        import asyncio
        script = (
            "Import-Module VirtualMachineManager; "
            "Get-SCVirtualMachine | Select-Object ID,Name,StatusString,"
            "CPUCount,MemoryAssignedMB,VMHostName,CloudName,Generation,"
            "DynamicMemoryEnabled | ConvertTo-Json -Depth 2"
        )
        return await asyncio.to_thread(self._run_ps, script)

    async def _fetch_hosts_winrm(self) -> list[dict[str, Any]]:
        import asyncio
        script = (
            "Import-Module VirtualMachineManager; "
            "Get-SCVMHost | Select-Object ID,Name,FQDN,CPUCount,TotalMemory,"
            "VMHostGroup,ClusterName,AgentVersion,OperatingSystem | ConvertTo-Json -Depth 2"
        )
        return await asyncio.to_thread(self._run_ps, script)

    # ─────────────────────────────────────────────────────────────────────────
    # Connectivity test
    # ─────────────────────────────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        try:
            if self.use_winrm:
                import asyncio
                result = await asyncio.to_thread(
                    self._run_ps, "Get-SCVMMServer | Select-Object Name | ConvertTo-Json"
                )
                return {"ok": True, "message": f"WinRM connected. Server: {result}"}
            else:
                data = await self._rest_get("Clouds", {"$top": "1"})
                return {"ok": True, "message": f"SCVMM REST API reachable. Response: {str(data)[:100]}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ─────────────────────────────────────────────────────────────────────────
    # Normalisation helpers
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _vm_status(status_str: str) -> VMStatus:
        return _VM_STATUS_MAP.get(status_str, VMStatus.stopped)

    @staticmethod
    def _ram_gb(ram_mb: Any) -> float | None:
        try:
            return round(float(ram_mb) / 1024, 1)
        except (TypeError, ValueError):
            return None

    # ─────────────────────────────────────────────────────────────────────────
    # Main sync
    # ─────────────────────────────────────────────────────────────────────────

    async def sync_all(self, db: Any, stats: SyncStats) -> None:
        if self.use_winrm:
            raw_hosts = await self._fetch_hosts_winrm()
            raw_vms = await self._fetch_vms_winrm()
            raw_clouds: list[dict[str, Any]] = []
        else:
            raw_hosts = await self._fetch_hosts_rest()
            raw_vms = await self._fetch_vms_rest()
            raw_clouds = await self._fetch_clouds_rest()

        # Determine cluster name — use host group or fallback to "SCVMM"
        cluster_name = self.host_group or "SCVMM"
        cluster_data = {
            "name": cluster_name,
            "platform": VirtPlatform.hyper_v,
            "platform_data": {
                "host_group": self.host_group,
                "clouds": [c.get("Name") or c.get("name") for c in raw_clouds],
            },
        }
        cluster = await upsert_virt_cluster(db, cluster_data=cluster_data, stats=stats)

        # Build host_name → db_id mapping
        host_name_to_db_id: dict[str, Any] = {}

        for raw_host in raw_hosts:
            # REST fields: Id/ID, Name, FullyQualifiedDomainName, etc.
            host_id = str(raw_host.get("ID") or raw_host.get("Id") or "")
            host_name = raw_host.get("Name") or raw_host.get("FQDN") or host_id
            cpu_count = raw_host.get("CPUCount") or raw_host.get("PhysicalCPUCount") or 0
            ram_bytes = raw_host.get("TotalMemory") or 0  # bytes from REST
            ram_gb = round(float(ram_bytes) / (1024**3), 1) if ram_bytes else None

            host_data = {
                "name": host_name,
                "platform_uuid": host_id,
                "status": "active",
                "cpu_count": int(cpu_count) if cpu_count else None,
                "ram_gb": ram_gb,
                "platform_data": {
                    "host_group": raw_host.get("VMHostGroup") or raw_host.get("HostGroupPath"),
                    "cluster_name": raw_host.get("ClusterName"),
                    "agent_version": raw_host.get("AgentVersion"),
                    "os": raw_host.get("OperatingSystem"),
                },
            }
            host_obj = await upsert_virt_host(
                db, cluster_id=cluster.id, host_data=host_data, stats=stats
            )
            # Index by both short name and FQDN for VM → host resolution
            host_name_to_db_id[host_name] = host_obj.id
            fqdn = raw_host.get("FQDN") or raw_host.get("FullyQualifiedDomainName")
            if fqdn:
                host_name_to_db_id[fqdn] = host_obj.id
            short_name = host_name.split(".")[0]
            host_name_to_db_id[short_name] = host_obj.id

        seen_vm_ids: dict[str, set[str]] = {str(hid): set() for hid in host_name_to_db_id.values()}

        for raw_vm in raw_vms:
            vm_id = str(raw_vm.get("ID") or raw_vm.get("Id") or "")
            if not vm_id:
                continue
            vm_name = raw_vm.get("Name", vm_id)
            status_str = raw_vm.get("StatusString") or raw_vm.get("Status") or "Stopped"
            cpu_count = raw_vm.get("CPUCount") or 0
            ram_mb = raw_vm.get("MemoryAssignedMB") or raw_vm.get("Memory") or 0
            vm_host = raw_vm.get("VMHostName") or raw_vm.get("HostName") or ""

            host_db_id = host_name_to_db_id.get(vm_host) or host_name_to_db_id.get(
                vm_host.split(".")[0]
            )
            if host_db_id is None:
                logger.debug("SCVMM VM %s on unknown host %s, skipping", vm_name, vm_host)
                stats.items_unchanged += 1
                continue

            vm_data = {
                "name": vm_name,
                "platform_vm_id": vm_id,
                "status": self._vm_status(status_str),
                "cpu_count": int(cpu_count) if cpu_count else None,
                "ram_gb": self._ram_gb(ram_mb),
                "platform_data": {
                    "scvmm_id": vm_id,
                    "cloud": raw_vm.get("CloudName"),
                    "generation": raw_vm.get("Generation"),
                    "dynamic_memory": raw_vm.get("DynamicMemoryEnabled"),
                },
            }
            await upsert_vm(db, host_id=host_db_id, vm_data=vm_data, stats=stats)
            seen_vm_ids.setdefault(str(host_db_id), set()).add(vm_id)

        for host_db_id, seen in seen_vm_ids.items():
            await mark_missing_vms_inactive(
                db, host_id=host_db_id, seen_platform_ids=seen, stats=stats
            )

        # Datastores from REST (Cluster Shared Volumes / SMB shares)
        if not self.use_winrm:
            try:
                raw_storages = await self._rest_get("StorageFileShares", {"$top": "200"})
                items = raw_storages.get("value", raw_storages) if isinstance(raw_storages, dict) else raw_storages
                if isinstance(items, list):
                    for raw_ds in items:
                        cap_bytes = raw_ds.get("Capacity") or 0
                        free_bytes = raw_ds.get("FreeSpace") or 0
                        ds_data = {
                            "name": raw_ds.get("Name") or raw_ds.get("SharePath", ""),
                            "datastore_type": DatastoreType.smb,
                            "capacity_gb": round(float(cap_bytes) / (1024**3), 1) if cap_bytes else None,
                            "free_gb": round(float(free_bytes) / (1024**3), 1) if free_bytes else None,
                            "status": "active",
                        }
                        await upsert_datastore(
                            db, cluster_id=cluster.id, datastore_data=ds_data, stats=stats
                        )
            except Exception:
                logger.debug("SCVMM storage fetch failed (optional)", exc_info=True)

        logger.info(
            "SCVMM sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
