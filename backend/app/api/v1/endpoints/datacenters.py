"""
Physical layer — Datacenters

GET    /datacenters             paginated list
POST   /datacenters             create
GET    /datacenters/{id}        single
PUT    /datacenters/{id}        update
DELETE /datacenters/{id}        delete
GET    /datacenters/{id}/rooms  rooms in datacenter (paginated)
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import inspect as sa_inspect

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.datacenter import crud_datacenter
from app.crud.room import crud_room
from app.models.enums import AuditAction
from app.schemas.datacenter import DataCenterCreate, DataCenterRead, DataCenterUpdate
from app.schemas.room import RoomRead

router = APIRouter()

_SENSITIVE_SUFFIXES = ("_enc", "_password", "_key", "_secret")


def _to_dict(obj: Any) -> dict[str, Any]:
    """Serialize an ORM row to a JSON-safe dict, excluding encrypted/sensitive fields."""
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

@router.get("", response_model=Page[DataCenterRead])
async def list_datacenters(
    _current_user: ActiveUser,
    pagination: PaginationDep,
    city: str | None = Query(None),
    country: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Page[DataCenterRead]:
    from app.models.datacenter import DataCenter  # noqa: PLC0415
    filters = []
    if city:
        filters.append(DataCenter.city.ilike(f"%{city}%"))
    if country:
        filters.append(DataCenter.country.ilike(f"%{country}%"))
    items, total = await crud_datacenter.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create(items, total, pagination)


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("", response_model=DataCenterRead, status_code=201)
async def create_datacenter(
    body: DataCenterCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DataCenterRead:
    obj = await crud_datacenter.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="datacenter",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(obj)},
    )
    return obj


# ─── Read ─────────────────────────────────────────────────────────────────────

@router.get("/{datacenter_id}", response_model=DataCenterRead)
async def get_datacenter(
    datacenter_id: uuid.UUID,
    _current_user: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DataCenterRead:
    obj = await crud_datacenter.get(db, datacenter_id)
    if not obj:
        raise NotFoundError("DataCenter", str(datacenter_id))
    return obj


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{datacenter_id}", response_model=DataCenterRead)
async def update_datacenter(
    datacenter_id: uuid.UUID,
    body: DataCenterUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> DataCenterRead:
    obj = await crud_datacenter.get(db, datacenter_id)
    if not obj:
        raise NotFoundError("DataCenter", str(datacenter_id))
    before = _to_dict(obj)
    obj = await crud_datacenter.update(db, db_obj=obj, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="datacenter",
        entity_id=str(obj.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": _to_dict(obj)},
    )
    return obj


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{datacenter_id}", status_code=204)
async def delete_datacenter(
    datacenter_id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_datacenter.get(db, datacenter_id)
    if not obj:
        raise NotFoundError("DataCenter", str(datacenter_id))
    before = _to_dict(obj)
    await crud_datacenter.delete(db, id=datacenter_id)
    await crud_audit_log.create(
        db,
        entity_type="datacenter",
        entity_id=str(datacenter_id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ─── Nested: rooms ────────────────────────────────────────────────────────────

@router.get("/{datacenter_id}/rooms", response_model=Page[RoomRead])
async def list_datacenter_rooms(
    datacenter_id: uuid.UUID,
    _current_user: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[RoomRead]:
    obj = await crud_datacenter.get(db, datacenter_id)
    if not obj:
        raise NotFoundError("DataCenter", str(datacenter_id))
    items, total = await crud_room.get_by_datacenter(
        db, datacenter_id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)
