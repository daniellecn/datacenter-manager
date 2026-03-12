"""
VLANs — Phase 6

GET    /vlans           list (filter: vlan_id)
POST   /vlans           create
GET    /vlans/{id}      get one
PUT    /vlans/{id}      update
DELETE /vlans/{id}      delete
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.vlan import crud_vlan
from app.models.enums import AuditAction
from app.models.vlan import VLAN
from app.schemas.vlan import VLANCreate, VLANRead, VLANUpdate

router = APIRouter()


def _to_dict(obj: VLANRead) -> dict:
    return obj.model_dump(mode="json")


# ─── GET /vlans ───────────────────────────────────────────────────────────────

@router.get("", response_model=Page[VLANRead])
async def list_vlans(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    vlan_id: Optional[int] = Query(default=None, ge=1, le=4094),
) -> Page[VLANRead]:
    filters = []
    if vlan_id is not None:
        filters.append(VLAN.vlan_id == vlan_id)

    items, total = await crud_vlan.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
        order_by=VLAN.vlan_id,
    )
    return Page.create([VLANRead.model_validate(i) for i in items], total, pagination)


# ─── POST /vlans ──────────────────────────────────────────────────────────────

@router.post("", response_model=VLANRead, status_code=status.HTTP_201_CREATED)
async def create_vlan(
    body: VLANCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VLANRead:
    existing = await crud_vlan.get_by_vlan_id(db, body.vlan_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"VLAN {body.vlan_id} already exists.",
        )
    obj = await crud_vlan.create(db, obj_in=body)
    read = VLANRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="vlan",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(read)},
    )
    return read


# ─── GET /vlans/{id} ──────────────────────────────────────────────────────────

@router.get("/{id}", response_model=VLANRead)
async def get_vlan(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> VLANRead:
    obj = await crud_vlan.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VLAN {id} not found.")
    return VLANRead.model_validate(obj)


# ─── PUT /vlans/{id} ──────────────────────────────────────────────────────────

@router.put("/{id}", response_model=VLANRead)
async def update_vlan(
    id: uuid.UUID,
    body: VLANUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VLANRead:
    obj = await crud_vlan.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VLAN {id} not found.")

    before = _to_dict(VLANRead.model_validate(obj))
    updated = await crud_vlan.update(db, db_obj=obj, obj_in=body)
    after = _to_dict(VLANRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="vlan",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return VLANRead.model_validate(updated)


# ─── DELETE /vlans/{id} ───────────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vlan(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_vlan.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VLAN {id} not found.")

    before = _to_dict(VLANRead.model_validate(obj))
    await crud_vlan.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="vlan",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
