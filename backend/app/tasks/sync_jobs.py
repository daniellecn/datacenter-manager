# Sync job functions — Phase 8
#
# One async function per integration type.
# Called by APScheduler on interval OR directly by POST /integrations/{id}/sync.
# Each function: loads integration config from DB → runs service → writes sync_log.


async def sync_xclarity(integration_id: str) -> None:
    raise NotImplementedError


async def sync_snmp(integration_id: str) -> None:
    raise NotImplementedError


async def sync_ssh(integration_id: str) -> None:
    raise NotImplementedError


async def sync_vcenter(integration_id: str) -> None:
    raise NotImplementedError


async def sync_scvmm(integration_id: str) -> None:
    raise NotImplementedError


async def sync_proxmox(integration_id: str) -> None:
    raise NotImplementedError


async def sync_xenserver(integration_id: str) -> None:
    raise NotImplementedError
