"""
Physical layer — Rooms

GET    /rooms             paginated list (filter ?datacenter_id=)
POST   /rooms             create
GET    /rooms/{id}        single
PUT    /rooms/{id}        update
DELETE /rooms/{id}        delete
GET    /rooms/{id}/racks  racks in room (paginated)
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.datacenter import crud_datacenter
from app.crud.rack import crud_rack
from app.crud.room import crud_room
from app.models.enums import AuditAction
from app.schemas.rack import RackRead
from app.schemas.room import RoomCreate, RoomRead, RoomUpdate

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

@router.get("", response_model=Page[RoomRead])
async def list_rooms(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    datacenter_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Page[RoomRead]:
    from app.models.room import Room  # noqa: PLC0415
    filters = []
    if datacenter_id:
        filters.append(Room.datacenter_id == datacenter_id)
    items, total = await crud_room.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=RoomRead, status_code=201)
async def create_room(
    body: RoomCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> RoomRead:
    dc = await crud_datacenter.get(db, body.datacenter_id)
    if not dc:
        raise NotFoundError("DataCenter", str(body.datacenter_id))
    obj = await crud_room.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="room",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{room_id}", response_model=RoomRead)
async def get_room(
    room_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> RoomRead:
    obj = await crud_room.get(db, room_id)
    if not obj:
        raise NotFoundError("Room", str(room_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{room_id}", response_model=RoomRead)
async def update_room(
    room_id: uuid.UUID,
    body: RoomUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> RoomRead:
    obj = await crud_room.get(db, room_id)
    if not obj:
        raise NotFoundError("Room", str(room_id))
    before = _to_dict(obj)
    obj = await crud_room.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="room",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{room_id}", status_code=204)
async def delete_room(
    room_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_room.get(db, room_id)
    if not obj:
        raise NotFoundError("Room", str(room_id))
    before = _to_dict(obj)
    await crud_room.delete(db, id=room_id)
    await crud_audit_log.create(
        db,
        entity_type="room",
        entity_id=str(room_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ─── Nested: racks ────────────────────────────────────────────────────────────

@router.get("/{room_id}/racks", response_model=Page[RackRead])
async def list_room_racks(
    room_id: uuid.UUID,
    _current_user: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[RackRead]:
    obj = await crud_room.get(db, room_id)
    if not obj:
        raise NotFoundError("Room", str(room_id))
    items, total = await crud_rack.get_by_room(
        db, room_id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)
