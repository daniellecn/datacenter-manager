"""
Virtual Layer — Host endpoints — Phase 7

GET    /virt/hosts           — list with pagination + filters
POST   /virt/hosts           — create (operator+)
GET    /virt/hosts/{id}      — get one
PUT    /virt/hosts/{id}      — update (operator+)
DELETE /virt/hosts/{id}      — delete (operator+)
GET    /virt/hosts/{id}/vms  — list VMs running on this host
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.virtual_machine import crud_virtual_machine
from app.crud.virt_cluster import crud_virt_cluster
from app.crud.virt_host import crud_virt_host
from app.models.enums import AuditAction
from app.models.virt_host import VirtualizationHost
from app.schemas.virtual_machine import VMRead
from app.schemas.virt_host import VirtHostCreate, VirtHostRead, VirtHostUpdate

router = APIRouter()


# ─── GET /virt/hosts ─────────────────────────────────────────────────────────

@router.get("", response_model=Page[VirtHostRead])
async def list_hosts(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    cluster_id: Optional[uuid.UUID] = Query(None),
    is_in_maintenance: Optional[bool] = Query(None),
) -> Page[VirtHostRead]:
    where = []
    if cluster_id is not None:
        where.append(VirtualizationHost.cluster_id == cluster_id)
    if is_in_maintenance is not None:
        where.append(VirtualizationHost.is_in_maintenance == is_in_maintenance)
    items, total = await crud_virt_host.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=where or None,
    )
    return Page.create(items, total, pagination)


# ─── POST /virt/hosts ────────────────────────────────────────────────────────

@router.post("", response_model=VirtHostRead, status_code=status.HTTP_201_CREATED)
async def create_host(
    body: VirtHostCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationHost:
    cluster = await crud_virt_cluster.get(db, body.cluster_id)
    if cluster is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization cluster {body.cluster_id} not found.",
        )
    obj = await crud_virt_host.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="virt_host",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": VirtHostRead.model_validate(obj).model_dump(mode="json")},
    )
    return obj


# ─── GET /virt/hosts/{id} ────────────────────────────────────────────────────

@router.get("/{id}", response_model=VirtHostRead)
async def get_host(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationHost:
    obj = await crud_virt_host.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization host {id} not found.",
        )
    return obj


# ─── PUT /virt/hosts/{id} ────────────────────────────────────────────────────

@router.put("/{id}", response_model=VirtHostRead)
async def update_host(
    id: uuid.UUID,
    body: VirtHostUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualizationHost:
    obj = await crud_virt_host.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization host {id} not found.",
        )
    before = VirtHostRead.model_validate(obj).model_dump(mode="json")
    updated = await crud_virt_host.update(db, db_obj=obj, obj_in=body)
    after = VirtHostRead.model_validate(updated).model_dump(mode="json")
    await crud_audit_log.create(
        db,
        entity_type="virt_host",
        entity_id=str(id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return updated


# ─── DELETE /virt/hosts/{id} ─────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_host(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_virt_host.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization host {id} not found.",
        )
    snapshot = VirtHostRead.model_validate(obj).model_dump(mode="json")
    await crud_virt_host.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="virt_host",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": snapshot, "after": None},
    )


# ─── GET /virt/hosts/{id}/vms ────────────────────────────────────────────────

@router.get("/{id}/vms", response_model=Page[VMRead])
async def list_host_vms(
    id: uuid.UUID,
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[VMRead]:
    host = await crud_virt_host.get(db, id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization host {id} not found.",
        )
    items, total = await crud_virtual_machine.get_by_host(
        db, id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create(items, total, pagination)
