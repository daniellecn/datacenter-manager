"""
Virtual Layer — VM endpoints — Phase 7

GET    /virt/vms      — list with pagination + filters
POST   /virt/vms      — create (operator+)
GET    /virt/vms/{id} — get one
PUT    /virt/vms/{id} — update (operator+)
DELETE /virt/vms/{id} — delete (operator+)
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.virtual_machine import crud_virtual_machine
from app.crud.virt_host import crud_virt_host
from app.models.enums import AuditAction, OSType, VMStatus
from app.models.virtual_machine import VirtualMachine
from app.schemas.virtual_machine import VMCreate, VMRead, VMUpdate

router = APIRouter()


# ─── GET /virt/vms ───────────────────────────────────────────────────────────

@router.get("", response_model=Page[VMRead])
async def list_vms(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    host_id: Optional[uuid.UUID] = Query(None),
    vm_status: Optional[VMStatus] = Query(None, alias="status"),
    os_type: Optional[OSType] = Query(None),
    is_template: Optional[bool] = Query(None),
    name: Optional[str] = Query(None),
) -> Page[VMRead]:
    where = []
    if host_id is not None:
        where.append(VirtualMachine.host_id == host_id)
    if vm_status is not None:
        where.append(VirtualMachine.status == vm_status)
    if os_type is not None:
        where.append(VirtualMachine.os_type == os_type)
    if is_template is not None:
        where.append(VirtualMachine.is_template == is_template)
    if name is not None:
        where.append(VirtualMachine.name.ilike(f"%{name}%"))
    items, total = await crud_virtual_machine.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=where or None,
        order_by=VirtualMachine.name,
    )
    return Page.create(items, total, pagination)


# ─── POST /virt/vms ──────────────────────────────────────────────────────────

@router.post("", response_model=VMRead, status_code=http_status.HTTP_201_CREATED)
async def create_vm(
    body: VMCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualMachine:
    host = await crud_virt_host.get(db, body.host_id)
    if host is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Virtualization host {body.host_id} not found.",
        )
    obj = await crud_virtual_machine.create(db, obj_in=body)
    await crud_audit_log.create(
        db,
        entity_type="virtual_machine",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": VMRead.model_validate(obj).model_dump(mode="json")},
    )
    return obj


# ─── GET /virt/vms/{id} ──────────────────────────────────────────────────────

@router.get("/{id}", response_model=VMRead)
async def get_vm(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualMachine:
    obj = await crud_virtual_machine.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Virtual machine {id} not found.",
        )
    return obj


# ─── PUT /virt/vms/{id} ──────────────────────────────────────────────────────

@router.put("/{id}", response_model=VMRead)
async def update_vm(
    id: uuid.UUID,
    body: VMUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> VirtualMachine:
    obj = await crud_virtual_machine.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Virtual machine {id} not found.",
        )
    if body.host_id is not None:
        host = await crud_virt_host.get(db, body.host_id)
        if host is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Virtualization host {body.host_id} not found.",
            )
    before = VMRead.model_validate(obj).model_dump(mode="json")
    updated = await crud_virtual_machine.update(db, db_obj=obj, obj_in=body)
    after = VMRead.model_validate(updated).model_dump(mode="json")
    await crud_audit_log.create(
        db,
        entity_type="virtual_machine",
        entity_id=str(id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return updated


# ─── DELETE /virt/vms/{id} ───────────────────────────────────────────────────

@router.delete("/{id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_vm(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_virtual_machine.get(db, id)
    if obj is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Virtual machine {id} not found.",
        )
    snapshot = VMRead.model_validate(obj).model_dump(mode="json")
    await crud_virtual_machine.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="virtual_machine",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": snapshot, "after": None},
    )
