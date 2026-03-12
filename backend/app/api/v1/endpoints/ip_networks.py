"""
IP Networks — Phase 6

GET    /ip-networks                  list (filter: vlan_id, purpose)
POST   /ip-networks                  create
GET    /ip-networks/{id}             get one
PUT    /ip-networks/{id}             update
DELETE /ip-networks/{id}             delete
GET    /ip-networks/{id}/addresses   list IP addresses in this subnet
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import Page, PaginationDep
from app.core.security import ActiveUser, OperatorUser
from app.crud.audit_log import crud_audit_log
from app.crud.ip_address import crud_ip_address
from app.crud.ip_network import crud_ip_network
from app.models.enums import AuditAction, NetworkPurpose
from app.models.ip_network import IPNetwork
from app.schemas.ip_address import IPAddressRead
from app.schemas.ip_network import IPNetworkCreate, IPNetworkRead, IPNetworkUpdate

router = APIRouter()


def _to_dict(obj: IPNetworkRead) -> dict:
    return obj.model_dump(mode="json")


# ─── GET /ip-networks ─────────────────────────────────────────────────────────

@router.get("", response_model=Page[IPNetworkRead])
async def list_ip_networks(
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
    vlan_id: Optional[uuid.UUID] = Query(default=None),
    purpose: Optional[NetworkPurpose] = Query(default=None),
) -> Page[IPNetworkRead]:
    filters = []
    if vlan_id is not None:
        filters.append(IPNetwork.vlan_id == vlan_id)
    if purpose is not None:
        filters.append(IPNetwork.purpose == purpose)

    items, total = await crud_ip_network.get_multi(
        db,
        skip=pagination.offset,
        limit=pagination.size,
        where_clauses=filters or None,
        order_by=IPNetwork.name,
    )
    return Page.create([IPNetworkRead.model_validate(i) for i in items], total, pagination)


# ─── POST /ip-networks ────────────────────────────────────────────────────────

@router.post("", response_model=IPNetworkRead, status_code=status.HTTP_201_CREATED)
async def create_ip_network(
    body: IPNetworkCreate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> IPNetworkRead:
    existing = await crud_ip_network.get_by_cidr(db, body.cidr)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Network {body.cidr} already exists.",
        )
    obj = await crud_ip_network.create(db, obj_in=body)
    read = IPNetworkRead.model_validate(obj)
    await crud_audit_log.create(
        db,
        entity_type="ip_network",
        entity_id=str(obj.id),
        action=AuditAction.create,
        user_id=current_user.id,
        diff={"before": None, "after": _to_dict(read)},
    )
    return read


# ─── GET /ip-networks/{id} ────────────────────────────────────────────────────

@router.get("/{id}", response_model=IPNetworkRead)
async def get_ip_network(
    id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> IPNetworkRead:
    obj = await crud_ip_network.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IP network {id} not found.")
    return IPNetworkRead.model_validate(obj)


# ─── PUT /ip-networks/{id} ────────────────────────────────────────────────────

@router.put("/{id}", response_model=IPNetworkRead)
async def update_ip_network(
    id: uuid.UUID,
    body: IPNetworkUpdate,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> IPNetworkRead:
    obj = await crud_ip_network.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IP network {id} not found.")

    if body.cidr and body.cidr != obj.cidr:
        clash = await crud_ip_network.get_by_cidr(db, body.cidr)
        if clash and clash.id != id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Network {body.cidr} already exists.",
            )

    before = _to_dict(IPNetworkRead.model_validate(obj))
    updated = await crud_ip_network.update(db, db_obj=obj, obj_in=body)
    after = _to_dict(IPNetworkRead.model_validate(updated))

    await crud_audit_log.create(
        db,
        entity_type="ip_network",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=current_user.id,
        diff={"before": before, "after": after},
    )
    return IPNetworkRead.model_validate(updated)


# ─── DELETE /ip-networks/{id} ─────────────────────────────────────────────────

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ip_network(
    id: uuid.UUID,
    current_user: OperatorUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    obj = await crud_ip_network.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IP network {id} not found.")

    before = _to_dict(IPNetworkRead.model_validate(obj))
    await crud_ip_network.delete(db, id=id)
    await crud_audit_log.create(
        db,
        entity_type="ip_network",
        entity_id=str(id),
        action=AuditAction.delete,
        user_id=current_user.id,
        diff={"before": before, "after": None},
    )


# ─── GET /ip-networks/{id}/addresses ─────────────────────────────────────────

@router.get("/{id}/addresses", response_model=Page[IPAddressRead])
async def list_addresses_in_network(
    id: uuid.UUID,
    _: ActiveUser,
    pagination: PaginationDep,
    db: AsyncSession = Depends(get_db),
) -> Page[IPAddressRead]:
    obj = await crud_ip_network.get(db, id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IP network {id} not found.")

    items, total = await crud_ip_address.get_by_subnet(
        db, id, skip=pagination.offset, limit=pagination.size
    )
    return Page.create([IPAddressRead.model_validate(i) for i in items], total, pagination)
