"""
Sync Job Functions — Phase 8

One async function per integration type.
Called by APScheduler on interval OR directly by POST /integrations/{id}/sync.

Pattern:
  1. Open a new AsyncSession (not FastAPI's request-scoped one)
  2. Load integration config from DB + decrypt credentials
  3. Instantiate the relevant service class
  4. Call service.sync_all(db, stats)
  5. Finalize sync_log + update integration status

dispatch_integration_sync() is the single entry point used by the scheduler.
Individual per-type functions are also exported for direct testing.
"""
from __future__ import annotations

import json
import logging
import uuid

from app.core.crypto import decrypt
from app.core.database import AsyncSessionLocal
from app.crud.integration import crud_integration
from app.models.enums import IntegrationType
from app.services import sync_engine

logger = logging.getLogger(__name__)


# ─── Central Dispatcher ───────────────────────────────────────────────────────


async def dispatch_integration_sync(integration_id: str) -> None:
    """
    APScheduler job entry point.
    Loads the integration type from DB and routes to the correct sync function.
    """
    _handlers = {
        IntegrationType.xclarity: sync_xclarity,
        IntegrationType.snmp: sync_snmp,
        IntegrationType.ssh: sync_ssh,
        IntegrationType.vcenter: sync_vcenter,
        IntegrationType.scvmm: sync_scvmm,
        IntegrationType.proxmox_api: sync_proxmox,
        IntegrationType.xenserver_api: sync_xenserver,
    }

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if integration is None:
            logger.warning("dispatch_integration_sync: integration %s not found", integration_id)
            return
        if not integration.enabled:
            logger.debug("dispatch_integration_sync: integration %s is disabled, skipping", integration_id)
            return

        handler = _handlers.get(integration.integration_type)
        if handler is None:
            logger.error(
                "dispatch_integration_sync: no handler for type %s",
                integration.integration_type,
            )
            return

    # Each handler opens its own session
    await handler(integration_id)


# ─── Credential helper ────────────────────────────────────────────────────────


def _decrypt_creds(credentials_enc: str | None) -> dict:
    """Decrypt and JSON-parse stored credentials. Returns empty dict on failure."""
    if not credentials_enc:
        return {}
    try:
        return json.loads(decrypt(credentials_enc))
    except Exception as exc:
        logger.error("Failed to decrypt credentials: %s", exc)
        return {}


# ─── xClarity ────────────────────────────────────────────────────────────────


async def sync_xclarity(integration_id: str) -> None:
    """Sync one Lenovo xClarity integration."""
    from app.services.xclarity import XClarityService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}
            service = XClarityService(
                host=integration.host,
                port=integration.port or 443,
                username=creds.get("username", ""),
                password=creds.get("password", ""),
                verify_ssl=extra.get("verify_ssl", False),
            )
            await service.sync_all(db, stats)
        except Exception as exc:
            logger.exception("xClarity sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── SNMP ─────────────────────────────────────────────────────────────────────


async def sync_snmp(integration_id: str) -> None:
    """Sync one SNMP integration — polls all devices in extra_config.targets."""
    from app.services.snmp import SNMPService  # noqa: PLC0415
    from app.models.enums import SNMPVersion  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            version_str = extra.get("version", "v2c")
            try:
                version = SNMPVersion(version_str)
            except ValueError:
                version = SNMPVersion.v2c

            service = SNMPService(
                version=version,
                community=creds.get("community", "public"),
                username=creds.get("username"),
                auth_protocol=extra.get("auth_protocol", "SHA"),
                auth_key=creds.get("auth_key"),
                priv_protocol=extra.get("priv_protocol", "AES128"),
                priv_key=creds.get("priv_key"),
                port=integration.port or 161,
            )

            # targets: list of IP/hostname strings in extra_config
            targets: list[str] = extra.get("targets", [])
            if integration.host and integration.host not in targets:
                targets = [integration.host] + targets

            await service.sync_devices(db, stats, targets)
        except Exception as exc:
            logger.exception("SNMP sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── SSH ──────────────────────────────────────────────────────────────────────


async def sync_ssh(integration_id: str) -> None:
    """Sync one SSH integration — polls all devices in extra_config.targets."""
    from app.services.ssh_collector import SSHCollectorService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            service = SSHCollectorService(
                default_username=creds.get("username", ""),
                default_password=creds.get("password"),
                default_key_file=creds.get("private_key"),
                default_os_type=extra.get("default_device_os", "cisco_ios"),
                port=integration.port or 22,
                timeout=extra.get("timeout", 30),
            )

            # targets: list of {"ip": ..., "os_type": ..., "device_name": ...}
            targets: list[dict] = extra.get("targets", [])
            if integration.host and not any(t.get("ip") == integration.host for t in targets):
                targets = [{"ip": integration.host, "os_type": extra.get("default_device_os", "cisco_ios")}] + targets

            await service.sync_managed_devices(db, stats, targets)
        except Exception as exc:
            logger.exception("SSH sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── vCenter ──────────────────────────────────────────────────────────────────


async def sync_vcenter(integration_id: str) -> None:
    """Sync one VMware vCenter integration."""
    from app.services.vcenter import VCenterService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            service = VCenterService(
                host=integration.host,
                port=integration.port or 443,
                username=creds.get("username", "administrator@vsphere.local"),
                password=creds.get("password", ""),
                verify_ssl=extra.get("verify_ssl", False),
                datacenter_id=extra.get("vcenter_datacenter_id"),
            )
            await service.sync_all(db, stats)
        except Exception as exc:
            logger.exception("vCenter sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── SCVMM ────────────────────────────────────────────────────────────────────


async def sync_scvmm(integration_id: str) -> None:
    """Sync one SCVMM integration (REST or WinRM)."""
    from app.services.scvmm import SCVMMService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            service = SCVMMService(
                host=integration.host,
                port=integration.port or 8090,
                username=creds.get("username", ""),
                password=creds.get("password", ""),
                use_winrm=bool(extra.get("use_winrm", False)),
                verify_ssl=extra.get("verify_ssl", False),
                host_group=extra.get("host_group", ""),
            )
            await service.sync_all(db, stats)
        except Exception as exc:
            logger.exception("SCVMM sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── Proxmox ──────────────────────────────────────────────────────────────────


async def sync_proxmox(integration_id: str) -> None:
    """Sync one Proxmox VE integration."""
    from app.services.proxmox import ProxmoxService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            service = ProxmoxService(
                host=integration.host,
                port=integration.port or 8006,
                username=creds.get("username", "root@pam"),
                token_id=creds.get("token_id", ""),
                token_secret=creds.get("token_secret", ""),
                verify_ssl=extra.get("verify_ssl", False),
                node_names=extra.get("node_names"),
            )
            await service.sync_all(db, stats)
        except Exception as exc:
            logger.exception("Proxmox sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)


# ─── XenServer ────────────────────────────────────────────────────────────────


async def sync_xenserver(integration_id: str) -> None:
    """Sync one XenServer / XCP-ng integration."""
    from app.services.xenserver import XenServerService  # noqa: PLC0415

    async with AsyncSessionLocal() as db:
        integration = await crud_integration.get(db, id=uuid.UUID(integration_id))
        if not integration or not integration.enabled:
            return

        log, _ = await sync_engine.begin_sync_log(db, integration_id=integration.id)
        stats = sync_engine.SyncStats()

        try:
            creds = _decrypt_creds(integration.credentials_enc)
            extra = integration.extra_config or {}

            service = XenServerService(
                host=integration.host,
                port=integration.port or 443,
                username=creds.get("username", "root"),
                password=creds.get("password", ""),
                verify_ssl=extra.get("verify_ssl", False),
            )
            await service.sync_all(db, stats)
        except Exception as exc:
            logger.exception("XenServer sync failed for integration %s", integration_id)
            stats.add_error("integration", integration_id, str(exc))

        await sync_engine.finalize_sync_log(db, log=log, stats=stats)
        await sync_engine.update_integration_status(db, integration_id=integration.id, stats=stats)
