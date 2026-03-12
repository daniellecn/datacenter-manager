"""
SAN Fabrics — Phase 6

GET    /san-fabrics           list (filter: fabric_type)
POST   /san-fabrics           create
GET    /san-fabrics/{id}      get one
PUT    /san-fabrics/{id}      update
DELETE /san-fabrics/{id}      delete
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.san_fabric import crud_san_fabric
from app.models.enums import AuditAction, SANFabricType
from app.models.san_fabric import SANFabric
from app.schemas.san_fabric import SANFabricCreate, SANFabricRead, SANFabricUpdate

router = APIRouter()


def _to_dict(obj: SANFabricRead) -> dict:
    return obj.model_dump(mode="json")


# ─── GET /san-fabrics ─────────────────────────────────────────────────────────

@router.get("", response_model=Page[SANFabricRead])
async def list_san_fabrics(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    fabric_type: Optional[SANFabricType] = Query(default=None),
) -> Page[SANFabricRead]:
    filters = []
    if fabric_type is not None:
        filters.append(SANFabric.fabric_type == fabric_type)

    items, total = await crud_san_fabric.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
        order_by=SANFabric.name,
    )
    return Page.create([SANFabricRead.model_validate(i) for i in items], total, pagination)


# ─── POST /san-fabrics ────────────────────────────────────────────────────────

@router.post("", response_model=SANFabricRead, status_code=status.HTTP_201_CREATED)
async def create_san_fabric(
    body: SANFabricCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> SANFabricRead:
    obj = await crud_san_fabric.create(db, obj_in=body)
    read = SANFabricRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="san_fabric",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(read)},
    )
    return read


# ─── GET /san-fabrics/{id} ────────────────────────────────────────────────────

@router.get("/{id}", response_model=SANFabricRead)
async def get_san_fabric(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> SANFabricRead:
    obj = await crud_san_fabric.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SAN fabric {id} not found.")
    return SANFabricRead.model_validate(obj)


# ─── PUT /san-fabrics/{id} ────────────────────────────────────────────────────

@router.put("/{id}", response_model=SANFabricRead)
async def update_san_fabric(
    id: uuid.UUID,
    body: SANFabricUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> SANFabricRead:
    obj = await crud_san_fabric.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SAN fabric {id} not found.")

    before = _to_dict(SANFabricRead.model_validate(obj))
    updated = await crud_san_fabric.update(db, db_obj=obj, obj_in=body)
    after = _to_dict(SANFabricRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="san_fabric",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return SANFabricRead.model_validate(updated)


# ─── DELETE /san-fabrics/{id} ─────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_san_fabric(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_san_fabric.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"SAN fabric {id} not found.")

    before = _to_dict(SANFabricRead.model_validate(obj))
    await crud_san_fabric.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="san_fabric",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
