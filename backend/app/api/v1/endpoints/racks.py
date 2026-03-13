"""
Physical layer — Racks

GET    /racks                   paginated list (filter ?corridor_id=, ?room_id=, ?status=)
POST   /racks                   create
GET    /racks/{id}              single
PUT    /racks/{id}              update
DELETE /racks/{id}              delete
GET    /racks/{id}/devices      devices in rack ordered by rack_unit_start ASC NULLS LAST
GET    /racks/{id}/power-summary power utilisation summary for rack
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import func, inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.corridor import crud_corridor
from app.crud.rack import crud_rack
from app.models.device import Device
from app.models.enums import AuditAction, DeviceStatus, RackStatus
from app.schemas.device import DeviceRead
from app.schemas.rack import RackCreate, RackRead, RackUpdate

router = APIRouter()

_SENSITIVE_SUFFIXES = ("_enc", "_password", "_key", "_secret")


def _to_dict(obj: Any) -> dict[str, Any]:
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


class RackPowerSummary(BaseModel):
    rack_id: uuid.UUID
    max_power_w: int | None
    rated_w: int | None
    actual_w: int | None
    utilization_pct: float | None


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=Page[RackRead])
async def list_racks(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    corridor_id: uuid.UUID | None = Query(None),
    room_id: uuid.UUID | None = Query(None),
    status: RackStatus | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Page[RackRead]:
    from app.models.corridor import Corridor  # noqa: PLC0415
    from app.models.rack import Rack  # noqa: PLC0415
    filters = []
    if corridor_id:
        filters.append(Rack.corridor_id == corridor_id)
    elif room_id:
        # Convenience: filter by room via join through corridors
        corridor_subq = select(Corridor.id).where(Corridor.room_id == room_id)
        filters.append(Rack.corridor_id.in_(corridor_subq))
    if status:
        filters.append(Rack.status == status)
    items, total = await crud_rack.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=RackRead, status_code=201)
async def create_rack(
    body: RackCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> RackRead:
    corridor = await crud_corridor.get(db, body.corridor_id)
    if not corridor:
        raise NotFoundError("Corridor", str(body.corridor_id))
    obj = await crud_rack.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="rack",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{rack_id}", response_model=RackRead)
async def get_rack(
    rack_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> RackRead:
    obj = await crud_rack.get(db, rack_id)
    if not obj:
        raise NotFoundError("Rack", str(rack_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{rack_id}", response_model=RackRead)
async def update_rack(
    rack_id: uuid.UUID,
    body: RackUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> RackRead:
    obj = await crud_rack.get(db, rack_id)
    if not obj:
        raise NotFoundError("Rack", str(rack_id))
    before = _to_dict(obj)
    obj = await crud_rack.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="rack",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{rack_id}", status_code=204)
async def delete_rack(
    rack_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_rack.get(db, rack_id)
    if not obj:
        raise NotFoundError("Rack", str(rack_id))
    before = _to_dict(obj)
    await crud_rack.delete(db, id=rack_id)
    await crud_audit_log.create(
        db,
        entity_type="rack",
        entity_id=str(rack_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ─── Devices in rack ──────────────────────────────────────────────────────────

@router.get("/{rack_id}/devices", response_model=list[DeviceRead])
async def list_rack_devices(
    rack_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> list[DeviceRead]:
    """Return all non-inactive devices in the rack ordered by rack_unit_start ASC NULLS LAST."""
    rack = await crud_rack.get(db, rack_id)
    if not rack:
        raise NotFoundError("Rack", str(rack_id))
    result = await db.execute(
        select(Device)
        .where(
            Device.rack_id == rack_id,
            Device.status != DeviceStatus.inactive,
        )
        .order_by(Device.rack_unit_start.asc().nulls_last())
    )
    return list(result.scalars().all())


# ─── Power summary ────────────────────────────────────────────────────────────

@router.get("/{rack_id}/power-summary", response_model=RackPowerSummary)
async def rack_power_summary(
    rack_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> RackPowerSummary:
    rack = await crud_rack.get(db, rack_id)
    if not rack:
        raise NotFoundError("Rack", str(rack_id))

    row = (
        await db.execute(
            select(
                func.sum(Device.power_rated_w).label("rated_w"),
                func.sum(Device.power_actual_w).label("actual_w"),
            ).where(
                Device.rack_id == rack_id,
                Device.status != DeviceStatus.inactive,
            )
        )
    ).one()

    rated_w: int | None = row.rated_w
    actual_w: int | None = row.actual_w
    max_power_w: int | None = rack.max_power_w

    utilization_pct: float | None = None
    if max_power_w and actual_w is not None:
        utilization_pct = round(actual_w / max_power_w * 100, 1)
    elif max_power_w and rated_w is not None:
        utilization_pct = round(rated_w / max_power_w * 100, 1)

    return RackPowerSummary(
        rack_id=rack_id,
        max_power_w=max_power_w,
        rated_w=rated_w,
        actual_w=actual_w,
        utilization_pct=utilization_pct,
    )


# ─── Rack elevation ────────────────────────────────────────────────────────────

class _ElevationDevice(BaseModel):
    id: str
    name: str
    device_type: str
    status: str
    rack_unit_start: int | None
    rack_unit_height: int
    power_rated_w: int | None
    power_actual_w: int | None
    model: str | None
    vendor: str | None


class _ElevationResponse(BaseModel):
    id: str
    name: str
    total_units: int
    devices: list[_ElevationDevice]


@router.get("/{rack_id}/elevation", response_model=_ElevationResponse)
async def rack_elevation(
    rack_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> _ElevationResponse:
    """Rack elevation — U-slot device layout for the topology canvas."""
    rack = await crud_rack.get(db, rack_id)
    if not rack:
        raise NotFoundError("Rack", str(rack_id))

    result = await db.execute(
        select(Device)
        .where(Device.rack_id == rack_id, Device.status != DeviceStatus.inactive)
        .order_by(Device.rack_unit_start.asc().nulls_last())
    )
    devices = list(result.scalars().all())

    return _ElevationResponse(
        id=str(rack.id),
        name=rack.name,
        total_units=rack.total_u,
        devices=[
            _ElevationDevice(
                id=str(d.id),
                name=d.name,
                device_type=d.device_type,
                status=d.status,
                rack_unit_start=d.rack_unit_start,
                rack_unit_height=d.rack_unit_size or 1,
                power_rated_w=d.power_rated_w,
                power_actual_w=d.power_actual_w,
                model=d.model,
                vendor=d.manufacturer,
            )
            for d in devices
        ],
    )
