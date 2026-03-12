"""
Network Interfaces — Phase 6

GET    /interfaces            list (filter: device_id, media_type, status)
POST   /interfaces            create
GET    /interfaces/{id}       get one
PUT    /interfaces/{id}       update
DELETE /interfaces/{id}       delete
"""
import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PageParams, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.network_interface import crud_network_interface
from app.models.enums import AuditAction, InterfaceStatus, MediaType
from app.models.network_interface import NetworkInterface
from app.schemas.network_interface import (
    NetworkInterfaceCreate,
    NetworkInterfaceRead,
    NetworkInterfaceUpdate,
)

router = APIRouter()


def _to_dict(obj: NetworkInterfaceRead) -> dict:
    return obj.model_dump(mode="json")


# ─── GET /interfaces ──────────────────────────────────────────────────────────

@router.get("", response_model=Page[NetworkInterfaceRead])
async def list_interfaces(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    device_id: Optional[uuid.UUID] = Query(default=None),
    media_type: Optional[MediaType] = Query(default=None),
    iface_status: Optional[InterfaceStatus] = Query(default=None, alias="status"),
) -> Page[NetworkInterfaceRead]:
    filters = []
    if device_id is not None:
        filters.append(NetworkInterface.device_id == device_id)
    if media_type is not None:
        filters.append(NetworkInterface.media_type == media_type)
    if iface_status is not None:
        filters.append(NetworkInterface.status == iface_status)

    items, total = await crud_network_interface.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
        order_by=NetworkInterface.name,
    )
    return Page.create(
        [NetworkInterfaceRead.model_validate(i) for i in items], total, pagination
    )


# ─── POST /interfaces ─────────────────────────────────────────────────────────

@router.post("", response_model=NetworkInterfaceRead, status_code=status.HTTP_201_CREATED)
async def create_interface(
    body: NetworkInterfaceCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkInterfaceRead:
    obj = await crud_network_interface.create(db, obj_in=body)
    read = NetworkInterfaceRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="network_interface",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(read)},
    )
    return read


# ─── GET /interfaces/{id} ─────────────────────────────────────────────────────

@router.get("/{id}", response_model=NetworkInterfaceRead)
async def get_interface(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkInterfaceRead:
    obj = await crud_network_interface.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Interface {id} not found.")
    return NetworkInterfaceRead.model_validate(obj)


# ─── PUT /interfaces/{id} ─────────────────────────────────────────────────────

@router.put("/{id}", response_model=NetworkInterfaceRead)
async def update_interface(
    id: uuid.UUID,
    body: NetworkInterfaceUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkInterfaceRead:
    obj = await crud_network_interface.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Interface {id} not found.")

    before = _to_dict(NetworkInterfaceRead.model_validate(obj))
    updated = await crud_network_interface.update(db, db_obj=obj, obj_in=body)
    after = _to_dict(NetworkInterfaceRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="network_interface",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return NetworkInterfaceRead.model_validate(updated)


# ─── DELETE /interfaces/{id} ──────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_interface(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_network_interface.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Interface {id} not found.")

    before = _to_dict(NetworkInterfaceRead.model_validate(obj))
    await crud_network_interface.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="network_interface",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
