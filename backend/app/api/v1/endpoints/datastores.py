"""
Virtual Layer — Datastore endpoints — Phase 7

GET    /virt/datastores      — list with pagination + filters
POST   /virt/datastores      — create (operator+)
GET    /virt/datastores/{id} — get one
PUT    /virt/datastores/{id} — update (operator+)
DELETE /virt/datastores/{id} — delete (operator+)
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.datastore import crud_datastore
from app.crud.virt_cluster import crud_virt_cluster
from app.models.datastore import Datastore
from app.models.enums import AuditAction, DatastoreType
from app.schemas.datastore import DatastoreCreate, DatastoreRead, DatastoreUpdate

router = APIRouter()


# ─── GET /virt/datastores ────────────────────────────────────────────────────

@router.get("", response_model=Page[DatastoreRead])
async def list_datastores(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    cluster_id: Optional[uuid.UUID] = Query(None),
    datastore_type: Optional[DatastoreType] = Query(None),
    name: Optional[str] = Query(None),
) -> Page[DatastoreRead]:
    where = []
    if cluster_id is not None:
        where.append(Datastore.cluster_id == cluster_id)
    if datastore_type is not None:
        where.append(Datastore.datastore_type == datastore_type)
    if name is not None:
        where.append(Datastore.name.ilike(f"%{name}%"))
    items, total = await crud_datastore.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=where or None,
        order_by=Datastore.name,
    )
    return Page.create(items, total, pagination)


# ─── POST /virt/datastores ───────────────────────────────────────────────────

@router.post("", response_model=DatastoreRead, status_code=status.HTTP_201_CREATED)
async def create_datastore(
    body: DatastoreCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> Datastore:
    cluster = await crud_virt_cluster.get(db, body.cluster_id)
    if cluster is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {body.cluster_id} not found.",
        )
    obj = await crud_datastore.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="datastore",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": DatastoreRead.model_validate(obj).model_dump(mode="json")},
    )
    return obj


# ─── GET /virt/datastores/{id} ───────────────────────────────────────────────

@router.get("/{id}", response_model=DatastoreRead)
async def get_datastore(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> Datastore:
    obj = await crud_datastore.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Datastore {id} not found.",
        )
    return obj


# ─── PUT /virt/datastores/{id} ───────────────────────────────────────────────

@router.put("/{id}", response_model=DatastoreRead)
async def update_datastore(
    id: uuid.UUID,
    body: DatastoreUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> Datastore:
    obj = await crud_datastore.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Datastore {id} not found.",
        )
    before = DatastoreRead.model_validate(obj).model_dump(mode="json")
    updated = await crud_datastore.update(db, db_obj=obj, obj_in=body)
    after = DatastoreRead.model_validate(updated).model_dump(mode="json")
    await crud_audit_log.create(
        db,
        entity_type="datastore",
        entity_id=str(id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return updated


# ─── DELETE /virt/datastores/{id} ────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_datastore(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_datastore.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Datastore {id} not found.",
        )
    snapshot = DatastoreRead.model_validate(obj).model_dump(mode="json")
    await crud_datastore.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="datastore",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": snapshot, "after": None},
    )
