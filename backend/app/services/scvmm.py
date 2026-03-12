# SCVMM Integration Service — Phase 8
#
# Supports two methods (chosen by integration.extra_config.use_winrm):
#   1. SCVMM REST API (System Center 2019+) — preferred
#   2. WinRM + PowerShell fallback — for older SCVMM versions
#
# Sync scope: Host Groups → Hyper-V Hosts → VMs → CSVs (Cluster Shared Volumes)
# Platform-specific data stored in platform_data jsonb column.
# Dedup key: virtual_machines.platform_vm_id (SCVMM VM GUID)


class SCVMMService:
    """Sync Microsoft SCVMM / Hyper-V inventory to local database."""
    pass
