"""
Proxmox VE Integration Service — Phase 8

Uses proxmoxer library against Proxmox VE REST API.
Auth: API token (token_id + token_secret) — preferred over password.

Sync scope:
  Cluster → Nodes → VMs (QEMU) + Containers (LXC) → Storage Pools

platform_data distinctions:
  - vm_type: "qemu" | "lxc"
  - node: Proxmox node name
  - vmid: numeric VM/CT ID

Dedup key:
  - VirtualMachine.platform_vm_id = "{node}/{vmid}" (e.g., "pve-node1/101")
  - VirtualizationHost.platform_uuid = node name
  - Datastore: cluster_id + storage pool name

Proxmoxer is synchronous — all calls wrapped in asyncio.to_thread().
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

_STATUS_MAP: dict[str, VMStatus] = {
    "running": VMStatus.running,
    "stopped": VMStatus.stopped,
    "paused": VMStatus.suspended,
    "prelaunch": VMStatus.stopped,
    "migrating": VMStatus.migrating,
}

_STORAGE_TYPE_MAP: dict[str, DatastoreType] = {
    "dir": DatastoreType.nfs,       # local dir — closest analogue
    "lvm": DatastoreType.iscsi,     # block storage
    "lvmthin": DatastoreType.iscsi,
    "nfs": DatastoreType.nfs,
    "cifs": DatastoreType.smb,
    "rbd": DatastoreType.iscsi,     # Ceph RBD
    "cephfs": DatastoreType.nfs,
    "zfspool": DatastoreType.iscsi,
    "zfs": DatastoreType.iscsi,
    "iscsi": DatastoreType.iscsi,
    "iscsidirect": DatastoreType.iscsi,
    "glusterfs": DatastoreType.nfs,
    "pvesm": DatastoreType.nfs,
}


def _build_proxmox_client(
    host: str,
    username: str,
    token_id: str,
    token_secret: str,
    verify_ssl: bool,
) -> Any:
    """Build a ProxmoxAPI client (sync, runs in thread pool)."""
    from proxmoxer import ProxmoxAPI  # type: ignore[import]

    return ProxmoxAPI(
        host,
        user=username,
        token_name=token_id,
        token_value=token_secret,
        verify_ssl=verify_ssl,
    )


def _get_cluster_info(proxmox: Any) -> dict[str, Any]:
    """Fetch cluster status (sync)."""
    try:
        items = proxmox.cluster.status.get()
        for item in items:
            if item.get("type") == "cluster":
                return item
    except Exception:
        pass
    return {}


def _get_nodes(proxmox: Any) -> list[dict[str, Any]]:
    return proxmox.nodes.get()


def _get_node_qemu(proxmox: Any, node: str) -> list[dict[str, Any]]:
    try:
        return proxmox.nodes(node).qemu.get()
    except Exception:
        return []


def _get_node_lxc(proxmox: Any, node: str) -> list[dict[str, Any]]:
    try:
        return proxmox.nodes(node).lxc.get()
    except Exception:
        return []


def _get_node_storage(proxmox: Any, node: str) -> list[dict[str, Any]]:
    try:
        return proxmox.nodes(node).storage.get()
    except Exception:
        return []


def _get_node_status(proxmox: Any, node: str) -> dict[str, Any]:
    try:
        return proxmox.nodes(node).status.get()
    except Exception:
        return {}


class ProxmoxService:
    """
    Sync Proxmox VE inventory (VMs, containers, storage) to the local database.
    """

    def __init__(
        self,
        host: str,
        port: int = 8006,
        username: str = "root@pam",
        token_id: str = "",
        token_secret: str = "",
        verify_ssl: bool = False,
        node_names: list[str] | None = None,
    ) -> None:
        # proxmoxer includes the port in the host string
        self.host = f"{host}:{port}" if ":" not in host else host
        self.username = username
        self.token_id = token_id
        self.token_secret = token_secret
        self.verify_ssl = verify_ssl
        self.node_filter = set(node_names) if node_names else None

    # ── Client factory ────────────────────────────────────────────────────────

    async def _get_client(self) -> Any:
        return await asyncio.to_thread(
            _build_proxmox_client,
            self.host, self.username, self.token_id, self.token_secret, self.verify_ssl,
        )

    # ── Connectivity test ─────────────────────────────────────────────────────

    async def test_connection(self) -> dict[str, Any]:
        try:
            proxmox = await self._get_client()
            nodes = await asyncio.to_thread(_get_nodes, proxmox)
            node_names = [n.get("node") for n in nodes]
            return {"ok": True, "message": f"Connected. Nodes: {node_names}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _vm_status(status_str: str) -> VMStatus:
        return _STATUS_MAP.get(status_str, VMStatus.stopped)

    @staticmethod
    def _ram_gb(maxmem_bytes: Any) -> float | None:
        try:
            mb = float(maxmem_bytes) / (1024 ** 2)
            return round(mb / 1024, 1)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _cpu_count(cpus: Any) -> int | None:
        try:
            return int(cpus)
        except (TypeError, ValueError):
            return None

    # ── Main sync ─────────────────────────────────────────────────────────────

    async def sync_all(self, db: Any, stats: SyncStats) -> None:
        proxmox = await self._get_client()

        # Cluster info
        cluster_info = await asyncio.to_thread(_get_cluster_info, proxmox)
        cluster_name = cluster_info.get("name") or self.host.split(":")[0]

        cluster_data = {
            "name": cluster_name,
            "platform": VirtPlatform.proxmox,
            "platform_data": {
                "nodes": cluster_info.get("nodes"),
                "quorum": cluster_info.get("quorum"),
            },
        }
        cluster = await upsert_virt_cluster(db, cluster_data=cluster_data, stats=stats)

        # Nodes
        raw_nodes = await asyncio.to_thread(_get_nodes, proxmox)

        for raw_node in raw_nodes:
            node_name = raw_node.get("node", "")
            if self.node_filter and node_name not in self.node_filter:
                continue
            if raw_node.get("status") == "offline":
                logger.info("Proxmox node %s is offline, skipping", node_name)
                continue

            # Node hardware details
            node_status = await asyncio.to_thread(_get_node_status, proxmox, node_name)
            cpu_count = node_status.get("cpuinfo", {}).get("cpus")
            ram_bytes = node_status.get("memory", {}).get("total")
            ram_gb = round(float(ram_bytes) / (1024 ** 3), 1) if ram_bytes else None

            host_data = {
                "name": node_name,
                "platform_uuid": node_name,  # node name is unique within the cluster
                "status": "active" if raw_node.get("status") == "online" else "maintenance",
                "cpu_count": int(cpu_count) if cpu_count else None,
                "ram_gb": ram_gb,
                "platform_data": {
                    "node": node_name,
                    "pve_version": node_status.get("pveversion"),
                    "kernel": node_status.get("uname", {}).get("sysname"),
                },
            }
            host_obj = await upsert_virt_host(
                db, cluster_id=cluster.id, host_data=host_data, stats=stats
            )

            # VMs (QEMU)
            raw_vms = await asyncio.to_thread(_get_node_qemu, proxmox, node_name)
            # Containers (LXC)
            raw_ctrs = await asyncio.to_thread(_get_node_lxc, proxmox, node_name)

            seen_platform_ids: set[str] = set()

            for raw_vm in raw_vms:
                vmid = raw_vm.get("vmid")
                if vmid is None:
                    continue
                platform_vm_id = f"{node_name}/{vmid}"
                vm_data = {
                    "name": raw_vm.get("name") or f"vm-{vmid}",
                    "platform_vm_id": platform_vm_id,
                    "status": self._vm_status(raw_vm.get("status", "stopped")),
                    "cpu_count": self._cpu_count(raw_vm.get("cpus")),
                    "ram_gb": self._ram_gb(raw_vm.get("maxmem")),
                    "platform_data": {
                        "vm_type": "qemu",
                        "node": node_name,
                        "vmid": vmid,
                        "template": bool(raw_vm.get("template")),
                        "pid": raw_vm.get("pid"),
                    },
                }
                await upsert_vm(db, host_id=host_obj.id, vm_data=vm_data, stats=stats)
                seen_platform_ids.add(platform_vm_id)

            for raw_ctr in raw_ctrs:
                vmid = raw_ctr.get("vmid")
                if vmid is None:
                    continue
                platform_vm_id = f"{node_name}/{vmid}"
                vm_data = {
                    "name": raw_ctr.get("name") or f"ct-{vmid}",
                    "platform_vm_id": platform_vm_id,
                    "status": self._vm_status(raw_ctr.get("status", "stopped")),
                    "cpu_count": self._cpu_count(raw_ctr.get("cpus")),
                    "ram_gb": self._ram_gb(raw_ctr.get("maxmem")),
                    "platform_data": {
                        "vm_type": "lxc",
                        "node": node_name,
                        "vmid": vmid,
                        "template": bool(raw_ctr.get("template")),
                    },
                }
                await upsert_vm(db, host_id=host_obj.id, vm_data=vm_data, stats=stats)
                seen_platform_ids.add(platform_vm_id)

            await mark_missing_vms_inactive(
                db, host_id=host_obj.id, seen_platform_ids=seen_platform_ids, stats=stats
            )

            # Storage pools for this node
            raw_storages = await asyncio.to_thread(_get_node_storage, proxmox, node_name)
            seen_storage_names: set[str] = set()

            for raw_stor in raw_storages:
                stor_name = raw_stor.get("storage", "")
                if stor_name in seen_storage_names:
                    continue  # de-dup across nodes for shared storage
                seen_storage_names.add(stor_name)

                stor_type = raw_stor.get("type", "dir")
                total_bytes = raw_stor.get("total") or 0
                avail_bytes = raw_stor.get("avail") or 0

                ds_data = {
                    "name": stor_name,
                    "datastore_type": _STORAGE_TYPE_MAP.get(stor_type, DatastoreType.nfs),
                    "capacity_gb": round(total_bytes / (1024 ** 3), 1) if total_bytes else None,
                    "free_gb": round(avail_bytes / (1024 ** 3), 1) if avail_bytes else None,
                    "status": "active" if raw_stor.get("active") else "maintenance",
                }
                await upsert_datastore(
                    db, cluster_id=cluster.id, datastore_data=ds_data, stats=stats
                )

        logger.info(
            "Proxmox sync complete: %d created, %d updated, %d unchanged, %d errors",
            stats.items_created, stats.items_updated, stats.items_unchanged, len(stats.errors),
        )
