"""
Physical layer — Corridors

GET    /corridors                    paginated list (filter ?room_id=)
POST   /corridors                    create
GET    /corridors/{id}               single
PUT    /corridors/{id}               update
DELETE /corridors/{id}               delete (409 if racks exist)
GET    /corridors/{id}/racks         racks in corridor (paginated)
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import inspect as sa_inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.corridor import crud_corridor
from app.crud.rack import crud_rack
from app.crud.room import crud_room
from app.models.enums import AuditAction
from app.models.rack import Rack
from app.schemas.corridor import CorridorCreate, CorridorRead, CorridorUpdate
from app.schemas.rack import RackRead

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


# ─── List ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=Page[CorridorRead])
async def list_corridors(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    room_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Page[CorridorRead]:
    from app.models.corridor import Corridor  # noqa: PLC0415
    filters = []
    if room_id:
        filters.append(Corridor.room_id == room_id)
    items, total = await crud_corridor.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=CorridorRead, status_code=201)
async def create_corridor(
    body: CorridorCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> CorridorRead:
    room = await crud_room.get(db, body.room_id)
    if not room:
        raise NotFoundError("Room", str(body.room_id))
    obj = await crud_corridor.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="corridor",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{corridor_id}", response_model=CorridorRead)
async def get_corridor(
    corridor_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> CorridorRead:
    obj = await crud_corridor.get(db, corridor_id)
    if not obj:
        raise NotFoundError("Corridor", str(corridor_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{corridor_id}", response_model=CorridorRead)
async def update_corridor(
    corridor_id: uuid.UUID,
    body: CorridorUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> CorridorRead:
    obj = await crud_corridor.get(db, corridor_id)
    if not obj:
        raise NotFoundError("Corridor", str(corridor_id))
    before = _to_dict(obj)
    obj = await crud_corridor.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="corridor",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{corridor_id}", status_code=204)
async def delete_corridor(
    corridor_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_corridor.get(db, corridor_id)
    if not obj:
        raise NotFoundError("Corridor", str(corridor_id))

    # Refuse if racks exist in this corridor
    rack_count = (
        await db.execute(
            select(Rack).where(Rack.corridor_id == corridor_id).limit(1)
        )
    ).scalar_one_or_none()
    if rack_count is not None:
        raise ConflictError("Cannot delete corridor with existing racks.")

    before = _to_dict(obj)
    await crud_corridor.delete(db, id=corridor_id)
    await crud_audit_log.create(
        db,
        entity_type="corridor",
        entity_id=str(corridor_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ─── Nested: racks ────────────────────────────────────────────────────────────

@router.get("/{corridor_id}/racks", response_model=Page[RackRead])
async def list_corridor_racks(
    corridor_id: uuid.UUID,
    _current_user: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[RackRead]:
    obj = await crud_corridor.get(db, corridor_id)
    if not obj:
        raise NotFoundError("Corridor", str(corridor_id))
    items, total = await crud_rack.get_by_corridor(
        db, corridor_id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)
