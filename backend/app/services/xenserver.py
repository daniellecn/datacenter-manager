# XenServer / XCP-ng Integration Service — Phase 8
#
# Uses XenAPI Python SDK (XAPI RPC over HTTP).
# Sync scope: Pool → Hosts → VMs → Storage Repositories (SRs)
# Platform-specific data stored in platform_data jsonb column.
# Dedup key: virtual_machines.platform_vm_id (Xen VM UUID)
#
# XenAPI SDK: obtain from XenServer SDK or XCP-ng project.


class XenServerService:
    """Sync XenServer / XCP-ng inventory to local database."""
    pass
