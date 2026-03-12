"""
Physical layer — Devices

GET    /devices                         paginated list
POST   /devices                         create
GET    /devices/{id}                    detail (with extension tables)
PUT    /devices/{id}                    update
DELETE /devices/{id}                    soft-delete (status=inactive)

GET    /devices/{id}/server-detail      get server extension
PUT    /devices/{id}/server-detail      upsert server extension
GET    /devices/{id}/network-detail     get network extension
PUT    /devices/{id}/network-detail     upsert network extension
GET    /devices/{id}/pdu-detail         get PDU extension
PUT    /devices/{id}/pdu-detail         upsert PDU extension

POST   /devices/{id}/sync               placeholder — triggers integration sync (Phase 8)
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.device import crud_device
from app.models.enums import AuditAction, DeviceStatus, DeviceType
from app.schemas.device import (
    DeviceCreate,
    DeviceDetailRead,
    DeviceNetworkCreate,
    DeviceNetworkRead,
    DevicePDUCreate,
    DevicePDURead,
    DeviceRead,
    DeviceServerCreate,
    DeviceServerRead,
    DeviceUpdate,
)

router = APIRouter()

_SENSITIVE_SUFFIXES = ("_enc", "_password", "_key", "_secret")


def _to_dict(obj: Any) -> dict[str, Any]:
    """Serialize ORM row to JSON-safe dict, excluding sensitive fields."""
    result: dict[str, Any] = {}
    for attr in sa_inspect(type(obj)).mapper.column_attrs:
        key = attr.key
        if any(key.endswith(s) for s in _SENSITIVE_SUFFIXES):
            continue
        val = getattr(obj, key)
        if isinstance(val, (datetime, date)):
            result[key] = val.isoformat()
        elif isinstance(val, uuid.UUID):
            result[key] = str(val)
        elif isinstance(val, Decimal):
            result[key] = float(val)
        else:
            result[key] = val
    return result


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=Page[DeviceRead])
async def list_devices(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    rack_id: uuid.UUID | None = Query(None),
    device_type: DeviceType | None = Query(None),
    status: DeviceStatus | None = Query(None),
    q: str | None = Query(None, description="Search name, serial number, or asset tag"),
    db: AsyncSession = Depends(get_db),
) -> Page[DeviceRead]:
    from app.models.device import Device  # noqa: PLC0415
    from sqlalchemy import or_  # noqa: PLC0415
    filters = [Device.status != DeviceStatus.inactive]
    if rack_id:
        filters.append(Device.rack_id == rack_id)
    if device_type:
        filters.append(Device.device_type == device_type)
    if status:
        # Allow explicit status filter to override the default inactive exclusion
        filters = [Device.status == status]
        if rack_id:
            filters.append(Device.rack_id == rack_id)
        if device_type:
            filters.append(Device.device_type == device_type)
    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(
                Device.name.ilike(pattern),
                Device.serial_number.ilike(pattern),
                Device.asset_tag.ilike(pattern),
            )
        )
    items, total = await crud_device.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=DeviceRead, status_code=201)
async def create_device(
    body: DeviceCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceRead:
    if body.serial_number:
        existing = await crud_device.get_by_serial(db, body.serial_number)
        if existing:
            raise ConflictError(f"Device with serial number '{body.serial_number}' already exists.")
    obj = await crud_device.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="device",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{device_id}", response_model=DeviceDetailRead)
async def get_device(
    device_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceDetailRead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{device_id}", response_model=DeviceRead)
async def update_device(
    device_id: uuid.UUID,
    body: DeviceUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceRead:
    obj = await crud_device.get(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    if body.serial_number and body.serial_number != obj.serial_number:
        existing = await crud_device.get_by_serial(db, body.serial_number)
        if existing and existing.id != device_id:
            raise ConflictError(f"Device with serial number '{body.serial_number}' already exists.")
    before = _to_dict(obj)
    obj = await crud_device.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="device",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Soft-delete ──────────────────────────────────────────────────────────────

@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete: sets status=inactive. Never hard-deletes a device."""
    obj = await crud_device.get(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    before = _to_dict(obj)
    obj = await crud_device.soft_delete(db, id=device_id)
    await crud_audit_log.create(
        db,
        entity_type="device",
        entity_id=str(device_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )


# ─── Server extension ─────────────────────────────────────────────────────────

@router.get("/{device_id}/server-detail", response_model=DeviceServerRead)
async def get_server_detail(
    device_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceServerRead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    if not obj.server_detail:
        raise NotFoundError("ServerDetail", str(device_id))
    return obj.server_detail


@router.put("/{device_id}/server-detail", response_model=DeviceServerRead)
async def upsert_server_detail(
    device_id: uuid.UUID,
    body: DeviceServerCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceServerRead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    before = _to_dict(obj.server_detail) if obj.server_detail else None
    detail = await crud_device.upsert_server_detail(db, device_id=device_id, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="device_server",
        entity_id=str(device_id),
        action=AuditAction.update if before else AuditAction.create,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(detail)},
    )
    return detail


# ─── Network extension ────────────────────────────────────────────────────────

@router.get("/{device_id}/network-detail", response_model=DeviceNetworkRead)
async def get_network_detail(
    device_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceNetworkRead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    if not obj.network_detail:
        raise NotFoundError("NetworkDetail", str(device_id))
    return obj.network_detail


@router.put("/{device_id}/network-detail", response_model=DeviceNetworkRead)
async def upsert_network_detail(
    device_id: uuid.UUID,
    body: DeviceNetworkCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DeviceNetworkRead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    before = _to_dict(obj.network_detail) if obj.network_detail else None
    detail = await crud_device.upsert_network_detail(db, device_id=device_id, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="device_network",
        entity_id=str(device_id),
        action=AuditAction.update if before else AuditAction.create,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(detail)},
    )
    return detail


# ─── PDU extension ────────────────────────────────────────────────────────────

@router.get("/{device_id}/pdu-detail", response_model=DevicePDURead)
async def get_pdu_detail(
    device_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DevicePDURead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    if not obj.pdu_detail:
        raise NotFoundError("PDUDetail", str(device_id))
    return obj.pdu_detail


@router.put("/{device_id}/pdu-detail", response_model=DevicePDURead)
async def upsert_pdu_detail(
    device_id: uuid.UUID,
    body: DevicePDUCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DevicePDURead:
    obj = await crud_device.get_with_detail(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    before = _to_dict(obj.pdu_detail) if obj.pdu_detail else None
    detail = await crud_device.upsert_pdu_detail(db, device_id=device_id, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="device_pdu",
        entity_id=str(device_id),
        action=AuditAction.update if before else AuditAction.create,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(detail)},
    )
    return detail


# ─── Sync placeholder ─────────────────────────────────────────────────────────

@router.post("/{device_id}/sync", status_code=202)
async def trigger_device_sync(
    device_id: uuid.UUID,
    _current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Placeholder — Phase 8 will wire this to the integration sync engine."""
    obj = await crud_device.get(db, device_id)
    if not obj:
        raise NotFoundError("Device", str(device_id))
    return {"status": "accepted", "message": "Sync scheduled (Phase 8 implementation pending)."}
