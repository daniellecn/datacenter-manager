"""
Global search endpoint — Phase 9

GET /search?q=<term>

Performs PostgreSQL ILIKE across:
  - devices     (name, serial_number, asset_tag, manufacturer, model, management_ip)
  - racks        (name)
  - rooms        (name)
  - datacenters  (name)
  - ip_addresses (address cast to text, fqdn)
  - virtual_machines (name, os_version)

Results are grouped by entity type with a configurable per-type limit.
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import cast, or_, select
from sqlalchemy import String as SAString
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ActiveUser
from app.models.datacenter import DataCenter
from app.models.device import Device
from app.models.enums import DeviceStatus
from app.models.ip_address import IPAddress
from app.models.rack import Rack
from app.models.room import Room
from app.models.virtual_machine import VirtualMachine

router = APIRouter()

_MAX_PER_TYPE = 20


class SearchHit(BaseModel):
    entity_type: str
    entity_id: str
    label: str                    # primary display string
    sublabel: Optional[str]       # secondary info (type, location, etc.)
    extra: dict[str, Any] = {}    # additional metadata for the frontend


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchHit]


@router.get("", response_model=SearchResponse)
async def global_search(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
    q: str = Query(..., min_length=1, max_length=200, description="Search term"),
    limit: int = Query(_MAX_PER_TYPE, ge=1, le=100, description="Max results per entity type"),
) -> SearchResponse:
    """
    Global ILIKE search across devices, racks, rooms, datacenters, IPs, and VMs.
    Returns at most `limit` hits per entity type, sorted by relevance (exact-prefix first).
    """
    term = f"%{q}%"
    hits: list[SearchHit] = []

    # ── Devices ──────────────────────────────────────────────────────────────
    device_rows = list(
        (
            await db.execute(
                select(Device)
                .where(
                    Device.status != DeviceStatus.inactive,
                    or_(
                        Device.name.ilike(term),
                        Device.serial_number.ilike(term),
                        Device.asset_tag.ilike(term),
                        Device.manufacturer.ilike(term),
                        Device.model.ilike(term),
                        cast(Device.management_ip, SAString).ilike(term),
                    ),
                )
                .order_by(Device.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for d in device_rows:
        hits.append(
            SearchHit(
                entity_type="device",
                entity_id=str(d.id),
                label=d.name,
                sublabel=f"{d.device_type} — {d.manufacturer or ''} {d.model or ''}".strip(" —"),
                extra={
                    "status": d.status,
                    "device_type": d.device_type,
                    "serial_number": d.serial_number,
                    "rack_id": str(d.rack_id) if d.rack_id else None,
                },
            )
        )

    # ── Racks ─────────────────────────────────────────────────────────────────
    rack_rows = list(
        (
            await db.execute(
                select(Rack)
                .where(Rack.name.ilike(term))
                .order_by(Rack.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for r in rack_rows:
        hits.append(
            SearchHit(
                entity_type="rack",
                entity_id=str(r.id),
                label=r.name,
                sublabel=f"Row {r.row}, Col {r.column}" if r.row or r.column else None,
                extra={
                    "total_u": r.total_u,
                    "status": r.status,
                    "room_id": str(r.room_id),
                },
            )
        )

    # ── Rooms ─────────────────────────────────────────────────────────────────
    room_rows = list(
        (
            await db.execute(
                select(Room)
                .where(Room.name.ilike(term))
                .order_by(Room.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for r in room_rows:
        hits.append(
            SearchHit(
                entity_type="room",
                entity_id=str(r.id),
                label=r.name,
                sublabel=f"Floor {r.floor}" if r.floor is not None else None,
                extra={"datacenter_id": str(r.datacenter_id)},
            )
        )

    # ── Datacenters ───────────────────────────────────────────────────────────
    dc_rows = list(
        (
            await db.execute(
                select(DataCenter)
                .where(
                    or_(
                        DataCenter.name.ilike(term),
                        DataCenter.city.ilike(term),
                    )
                )
                .order_by(DataCenter.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for dc in dc_rows:
        hits.append(
            SearchHit(
                entity_type="datacenter",
                entity_id=str(dc.id),
                label=dc.name,
                sublabel=", ".join(filter(None, [dc.city, dc.country])) or None,
                extra={},
            )
        )

    # ── IP Addresses ──────────────────────────────────────────────────────────
    ip_rows = list(
        (
            await db.execute(
                select(IPAddress)
                .where(
                    or_(
                        cast(IPAddress.address, SAString).ilike(term),
                        IPAddress.fqdn.ilike(term),
                    )
                )
                .order_by(IPAddress.address)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for ip in ip_rows:
        hits.append(
            SearchHit(
                entity_type="ip_address",
                entity_id=str(ip.id),
                label=str(ip.address),
                sublabel=ip.fqdn,
                extra={
                    "status": ip.status,
                    "device_id": str(ip.device_id) if ip.device_id else None,
                    "vm_id": str(ip.vm_id) if ip.vm_id else None,
                },
            )
        )

    # ── Virtual Machines ──────────────────────────────────────────────────────
    vm_rows = list(
        (
            await db.execute(
                select(VirtualMachine)
                .where(
                    or_(
                        VirtualMachine.name.ilike(term),
                        VirtualMachine.os_version.ilike(term),
                        VirtualMachine.platform_vm_id.ilike(term),
                    )
                )
                .order_by(VirtualMachine.name)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for vm in vm_rows:
        hits.append(
            SearchHit(
                entity_type="vm",
                entity_id=str(vm.id),
                label=vm.name,
                sublabel=f"{vm.os_type or ''} {vm.os_version or ''}".strip() or None,
                extra={
                    "status": vm.status,
                    "vcpu_count": vm.vcpu_count,
                    "ram_gb": vm.ram_gb,
                    "host_id": str(vm.host_id),
                },
            )
        )

    return SearchResponse(query=q, total=len(hits), results=hits)
