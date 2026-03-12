# Proxmox Integration Service — Phase 8
#
# Uses proxmoxer library against Proxmox VE REST API.
# Sync scope: Cluster → Nodes → VMs (QEMU) + Containers (LXC) → Storage Pools
# platform_data.vm_type = "qemu" | "lxc" to distinguish VMs from containers.
# Dedup key: virtual_machines.platform_vm_id = "{node}/{vmid}"


class ProxmoxService:
    """Sync Proxmox VE inventory (VMs and LXC containers) to local database."""
    pass
