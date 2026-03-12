"""
Virtual Layer — Cluster endpoints — Phase 7

GET    /virt/clusters                  — list with pagination + filters
POST   /virt/clusters                  — create (operator+)
GET    /virt/clusters/{id}             — get one
PUT    /virt/clusters/{id}             — update (operator+)
DELETE /virt/clusters/{id}             — delete (operator+)
GET    /virt/clusters/{id}/hosts       — list hosts belonging to this cluster
GET    /virt/clusters/{id}/datastores  — list datastores belonging to this cluster
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
from app.crud.virt_host import crud_virt_host
from app.models.enums import AuditAction, VirtPlatform
from app.models.virt_cluster import VirtualizationCluster
from app.schemas.datastore import DatastoreRead
from app.schemas.virt_cluster import VirtClusterCreate, VirtClusterRead, VirtClusterUpdate
from app.schemas.virt_host import VirtHostRead

router = APIRouter()


# ─── GET /virt/clusters ──────────────────────────────────────────────────────

@router.get("", response_model=Page[VirtClusterRead])
async def list_clusters(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    platform: Optional[VirtPlatform] = Query(None),
    name: Optional[str] = Query(None),
) -> Page[VirtClusterRead]:
    where = []
    if platform is not None:
        where.append(VirtualizationCluster.platform == platform)
    if name is not None:
        where.append(VirtualizationCluster.name.ilike(f"%{name}%"))
    items, total = await crud_virt_cluster.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=where or None,
        order_by=VirtualizationCluster.name,
    )
    return Page.create(items, total, pagination)


# ─── POST /virt/clusters ─────────────────────────────────────────────────────

@router.post("", response_model=VirtClusterRead, status_code=status.HTTP_201_CREATED)
async def create_cluster(
    body: VirtClusterCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationCluster:
    obj = await crud_virt_cluster.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="virt_cluster",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": VirtClusterRead.model_validate(obj).model_dump(mode="json")},
    )
    return obj


# ─── GET /virt/clusters/{id} ─────────────────────────────────────────────────

@router.get("/{id}", response_model=VirtClusterRead)
async def get_cluster(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationCluster:
    obj = await crud_virt_cluster.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {id} not found.",
        )
    return obj


# ─── PUT /virt/clusters/{id} ─────────────────────────────────────────────────

@router.put("/{id}", response_model=VirtClusterRead)
async def update_cluster(
    id: uuid.UUID,
    body: VirtClusterUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationCluster:
    obj = await crud_virt_cluster.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {id} not found.",
        )
    before = VirtClusterRead.model_validate(obj).model_dump(mode="json")
    updated = await crud_virt_cluster.update(db, db_obj=obj, obj_in=body)
    after = VirtClusterRead.model_validate(updated).model_dump(mode="json")
    await crud_audit_log.create(
        db,
        entity_type="virt_cluster",
        entity_id=str(id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return updated


# ─── DELETE /virt/clusters/{id} ──────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cluster(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_virt_cluster.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {id} not found.",
        )
    snapshot = VirtClusterRead.model_validate(obj).model_dump(mode="json")
    await crud_virt_cluster.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="virt_cluster",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": snapshot, "after": None},
    )


# ─── GET /virt/clusters/{id}/hosts ───────────────────────────────────────────

@router.get("/{id}/hosts", response_model=Page[VirtHostRead])
async def list_cluster_hosts(
    id: uuid.UUID,
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[VirtHostRead]:
    cluster = await crud_virt_cluster.get(db, id)
    if cluster is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {id} not found.",
        )
    items, total = await crud_virt_host.get_by_cluster(
        db, id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)


# ─── GET /virt/clusters/{id}/datastores ──────────────────────────────────────

@router.get("/{id}/datastores", response_model=Page[DatastoreRead])
async def list_cluster_datastores(
    id: uuid.UUID,
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[DatastoreRead]:
    cluster = await crud_virt_cluster.get(db, id)
    if cluster is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {id} not found.",
        )
    items, total = await crud_datastore.get_by_cluster(
        db, id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)
