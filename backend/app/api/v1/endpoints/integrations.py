"""
Integration endpoints — Phase 8

Wires:
  POST /integrations/{id}/sync  → BackgroundTask → dispatch_integration_sync
  POST /integrations/{id}/test  → synchronous connectivity test per integration type
  PUT /integrations/{id}        → also reschedules APScheduler job
  DELETE /integrations/{id}     → also unschedules APScheduler job
"""
from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt
from app.core.database import get_db
from app.core.pagination import Page, PageParams
from app.core.security import AdminUser, OperatorUser
from app.crud.integration import crud_integration
from app.models.enums import IntegrationType
from app.schemas.integration import IntegrationCreate, IntegrationRead, IntegrationUpdate, SyncLogRead

router = APIRouter()


# ─── List / Create / Read / Update / Delete ───────────────────────────────────


@router.get("", response_model=Page[IntegrationRead])
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    _: OperatorUser = None,
    pagination: PageParams = Depends(),
):
    """List integrations. Operator role required."""
    items, total = await crud_integration.get_multi(db, skip=pagination.offset, limit=pagination.size)
    return Page.create([IntegrationRead.model_validate(i) for i in items], total, pagination)


@router.post("", response_model=IntegrationRead, status_code=status.HTTP_201_CREATED)
async def create_integration(
    body: IntegrationCreate,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.create(db, obj_in=body)
    # Schedule the new integration job if enabled
    try:
        from app.tasks.scheduler import schedule_integration  # noqa: PLC0415
        schedule_integration(obj)
    except Exception:
        pass  # Scheduler may not be running in test environments
    return IntegrationRead.model_validate(obj)


@router.get("/{integration_id}", response_model=IntegrationRead)
async def get_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: OperatorUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationRead.model_validate(obj)


@router.put("/{integration_id}", response_model=IntegrationRead)
async def update_integration(
    integration_id: uuid.UUID,
    body: IntegrationUpdate,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    obj = await crud_integration.update(db, db_obj=obj, obj_in=body)
    # Re-schedule with new interval/enabled state
    try:
        from app.tasks.scheduler import schedule_integration  # noqa: PLC0415
        schedule_integration(obj)
    except Exception:
        pass
    return IntegrationRead.model_validate(obj)


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = None,
):
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    try:
        from app.tasks.scheduler import unschedule_integration  # noqa: PLC0415
        unschedule_integration(integration_id)
    except Exception:
        pass
    await crud_integration.delete(db, id=integration_id)


@router.get("/{integration_id}/logs", response_model=list[SyncLogRead])
async def get_integration_logs(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: OperatorUser = None,
):
    """Last 20 sync logs. Operator role required."""
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    logs = await crud_integration.get_sync_logs(db, integration_id=integration_id)
    return [SyncLogRead.model_validate(log) for log in logs]


# ─── Trigger Sync ─────────────────────────────────────────────────────────────


@router.post("/{integration_id}/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    integration_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: OperatorUser = None,
):
    """
    Trigger an immediate background sync for this integration.
    Returns 202 immediately; sync runs asynchronously.
    """
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")
    if not obj.enabled:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Integration is disabled. Enable it before triggering a sync.",
        )

    from app.tasks.sync_jobs import dispatch_integration_sync  # noqa: PLC0415

    background_tasks.add_task(dispatch_integration_sync, str(integration_id))

    return {
        "status": "accepted",
        "integration_id": str(integration_id),
        "message": f"Sync for '{obj.name}' queued in background.",
    }


# ─── Test Connectivity ────────────────────────────────────────────────────────


@router.post("/{integration_id}/test", status_code=status.HTTP_200_OK)
async def test_integration(
    integration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: OperatorUser = None,
):
    """
    Test connectivity to the integration's target host.
    Runs synchronously and returns a result object immediately.
    """
    obj = await crud_integration.get(db, id=integration_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Integration not found")

    creds: dict = {}
    if obj.credentials_enc:
        try:
            creds = json.loads(decrypt(obj.credentials_enc))
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt integration credentials")

    extra = obj.extra_config or {}
    result = await _run_connectivity_test(obj.integration_type, obj.host, obj.port, creds, extra)

    http_status = status.HTTP_200_OK if result.get("ok") else status.HTTP_502_BAD_GATEWAY
    if not result.get("ok"):
        raise HTTPException(status_code=http_status, detail=result.get("message", "Connectivity test failed"))

    return {"ok": True, "message": result.get("message", "OK")}


async def _run_connectivity_test(
    integration_type: IntegrationType,
    host: str,
    port: int | None,
    creds: dict,
    extra: dict,
) -> dict:
    """Dispatch connectivity test to the appropriate service."""

    if integration_type == IntegrationType.xclarity:
        from app.services.xclarity import XClarityService  # noqa: PLC0415
        svc = XClarityService(
            host=host,
            port=port or 443,
            username=creds.get("username", ""),
            password=creds.get("password", ""),
            verify_ssl=extra.get("verify_ssl", False),
        )
        return await svc.test_connection()

    if integration_type == IntegrationType.snmp:
        from app.services.snmp import SNMPService  # noqa: PLC0415
        from app.models.enums import SNMPVersion  # noqa: PLC0415
        try:
            version = SNMPVersion(extra.get("version", "v2c"))
        except ValueError:
            version = SNMPVersion.v2c
        svc = SNMPService(
            version=version,
            community=creds.get("community", "public"),
            username=creds.get("username"),
            auth_key=creds.get("auth_key"),
            priv_key=creds.get("priv_key"),
            port=port or 161,
        )
        return await svc.test_connection(host)

    if integration_type == IntegrationType.ssh:
        from app.services.ssh_collector import SSHCollectorService  # noqa: PLC0415
        svc = SSHCollectorService(
            default_username=creds.get("username", ""),
            default_password=creds.get("password"),
            default_os_type=extra.get("default_device_os", "cisco_ios"),
            port=port or 22,
        )
        return await svc.test_connection(
            host=host,
            os_type=extra.get("default_device_os", "cisco_ios"),
            username=creds.get("username", ""),
            password=creds.get("password"),
        )

    if integration_type == IntegrationType.vcenter:
        from app.services.vcenter import VCenterService  # noqa: PLC0415
        svc = VCenterService(
            host=host,
            port=port or 443,
            username=creds.get("username", "administrator@vsphere.local"),
            password=creds.get("password", ""),
            verify_ssl=extra.get("verify_ssl", False),
        )
        return await svc.test_connection()

    if integration_type == IntegrationType.scvmm:
        from app.services.scvmm import SCVMMService  # noqa: PLC0415
        svc = SCVMMService(
            host=host,
            port=port or 8090,
            username=creds.get("username", ""),
            password=creds.get("password", ""),
            use_winrm=bool(extra.get("use_winrm", False)),
            verify_ssl=extra.get("verify_ssl", False),
        )
        return await svc.test_connection()

    if integration_type == IntegrationType.proxmox_api:
        from app.services.proxmox import ProxmoxService  # noqa: PLC0415
        svc = ProxmoxService(
            host=host,
            port=port or 8006,
            username=creds.get("username", "root@pam"),
            token_id=creds.get("token_id", ""),
            token_secret=creds.get("token_secret", ""),
            verify_ssl=extra.get("verify_ssl", False),
        )
        return await svc.test_connection()

    if integration_type == IntegrationType.xenserver_api:
        from app.services.xenserver import XenServerService  # noqa: PLC0415
        svc = XenServerService(
            host=host,
            port=port or 443,
            username=creds.get("username", "root"),
            password=creds.get("password", ""),
            verify_ssl=extra.get("verify_ssl", False),
        )
        return await svc.test_connection()

    return {"ok": False, "message": f"No connectivity test implemented for type: {integration_type}"}
