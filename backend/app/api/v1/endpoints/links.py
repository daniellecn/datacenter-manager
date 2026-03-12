"""
Network Links & LAG Groups — Phase 6

Links router  (prefix: /links):
  GET    /links                   list (filter: link_type, status, source_device_id)
  POST   /links                   create
  GET    /links/{id}              get one
  PUT    /links/{id}              update
  DELETE /links/{id}              delete

LAG Groups router  (prefix: /lag-groups):
  GET    /lag-groups              list (filter: device_id)
  POST   /lag-groups              create
  GET    /lag-groups/{id}         get one
  PUT    /lag-groups/{id}         update
  DELETE /lag-groups/{id}         delete

Note: every create/update/delete on NetworkLink marks the topology graph as dirty
so the next path-trace request triggers a rebuild (CLAUDE.md topology cache spec).
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.network_link import crud_lag_group, crud_network_link
from app.models.enums import AuditAction, LAGMode, LinkStatus, LinkType
from app.models.network_interface import NetworkInterface
from app.models.network_link import LAGGroup, NetworkLink
from app.schemas.network_link import (
    LAGGroupCreate,
    LAGGroupRead,
    LAGGroupUpdate,
    NetworkLinkCreate,
    NetworkLinkRead,
    NetworkLinkUpdate,
)
from app.services import topology as topology_svc

# Two separate routers — registered at different prefixes in router.py
router = APIRouter()       # /links
lag_router = APIRouter()   # /lag-groups


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _link_dict(obj: NetworkLinkRead) -> dict:
    return obj.model_dump(mode="json")


def _lag_dict(obj: LAGGroupRead) -> dict:
    return obj.model_dump(mode="json")


# ─── GET /links ───────────────────────────────────────────────────────────────

@router.get("", response_model=Page[NetworkLinkRead])
async def list_links(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    link_type: Optional[LinkType] = Query(default=None),
    link_status: Optional[LinkStatus] = Query(default=None, alias="status"),
    source_device_id: Optional[uuid.UUID] = Query(default=None),
) -> Page[NetworkLinkRead]:
    filters = []
    if link_type is not None:
        filters.append(NetworkLink.link_type == link_type)
    if link_status is not None:
        filters.append(NetworkLink.status == link_status)

    if source_device_id is not None:
        # Find all interface IDs belonging to this device, then filter links
        iface_q = select(NetworkInterface.id).where(
            NetworkInterface.device_id == source_device_id
        )
        iface_result = await db.execute(iface_q)
        iface_ids = [row[0] for row in iface_result.all()]
        if not iface_ids:
            return Page.create([], 0, pagination)
        filters.append(
            or_(
                NetworkLink.source_interface_id.in_(iface_ids),
                NetworkLink.target_interface_id.in_(iface_ids),
            )
        )

    items, total = await crud_network_link.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
    )
    return Page.create([NetworkLinkRead.model_validate(i) for i in items], total, pagination)


# ─── POST /links ──────────────────────────────────────────────────────────────

@router.post("", response_model=NetworkLinkRead, status_code=status.HTTP_201_CREATED)
async def create_link(
    body: NetworkLinkCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkLinkRead:
    obj = await crud_network_link.create(db, obj_in=body)
    topology_svc.mark_dirty()
    read = NetworkLinkRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="network_link",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _link_dict(read)},
    )
    return read


# ─── GET /links/{id} ──────────────────────────────────────────────────────────

@router.get("/{id}", response_model=NetworkLinkRead)
async def get_link(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkLinkRead:
    obj = await crud_network_link.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Link {id} not found.")
    return NetworkLinkRead.model_validate(obj)


# ─── PUT /links/{id} ──────────────────────────────────────────────────────────

@router.put("/{id}", response_model=NetworkLinkRead)
async def update_link(
    id: uuid.UUID,
    body: NetworkLinkUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> NetworkLinkRead:
    obj = await crud_network_link.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Link {id} not found.")

    before = _link_dict(NetworkLinkRead.model_validate(obj))
    updated = await crud_network_link.update(db, db_obj=obj, obj_in=body)
    topology_svc.mark_dirty()
    after = _link_dict(NetworkLinkRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="network_link",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return NetworkLinkRead.model_validate(updated)


# ─── DELETE /links/{id} ───────────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_network_link.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Link {id} not found.")

    before = _link_dict(NetworkLinkRead.model_validate(obj))
    await crud_network_link.delete(db, id=id)
    topology_svc.mark_dirty()
    await crud_audit_log.create(
        db,
        entity_type="network_link",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# LAG Groups — lag_router (registered at /lag-groups in router.py)
# ═══════════════════════════════════════════════════════════════════════════════

@lag_router.get("", response_model=Page[LAGGroupRead])
async def list_lag_groups(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    device_id: Optional[uuid.UUID] = Query(default=None),
) -> Page[LAGGroupRead]:
    filters = []
    if device_id is not None:
        filters.append(LAGGroup.device_id == device_id)

    items, total = await crud_lag_group.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
        order_by=LAGGroup.name,
    )
    return Page.create([LAGGroupRead.model_validate(i) for i in items], total, pagination)


@lag_router.post("", response_model=LAGGroupRead, status_code=status.HTTP_201_CREATED)
async def create_lag_group(
    body: LAGGroupCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> LAGGroupRead:
    obj = await crud_lag_group.create(db, obj_in=body)
    read = LAGGroupRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="lag_group",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _lag_dict(read)},
    )
    return read


@lag_router.get("/{id}", response_model=LAGGroupRead)
async def get_lag_group(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> LAGGroupRead:
    obj = await crud_lag_group.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"LAG group {id} not found.")
    return LAGGroupRead.model_validate(obj)


@lag_router.put("/{id}", response_model=LAGGroupRead)
async def update_lag_group(
    id: uuid.UUID,
    body: LAGGroupUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> LAGGroupRead:
    obj = await crud_lag_group.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"LAG group {id} not found.")

    before = _lag_dict(LAGGroupRead.model_validate(obj))
    updated = await crud_lag_group.update(db, db_obj=obj, obj_in=body)
    after = _lag_dict(LAGGroupRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="lag_group",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return LAGGroupRead.model_validate(updated)


@lag_router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lag_group(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_lag_group.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"LAG group {id} not found.")

    before = _lag_dict(LAGGroupRead.model_validate(obj))
    await crud_lag_group.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="lag_group",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )
