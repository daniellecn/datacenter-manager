"""
Topology endpoints — Phase 6 (path) + Phase 9 (full graph views)

GET /topology/path                — shortest hop path between two devices (networkx)
GET /topology/physical            — all devices + links as React Flow nodes + edges
GET /topology/network             — network-device-focused graph (switches/routers/firewalls)
GET /topology/rack/{id}           — rack elevation data (U-slot grid)
GET /topology/datacenter/{id}     — datacenter floor plan (rooms + racks by row/column)
"""
import uuid
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ActiveUser
from app.models.datacenter import DataCenter
from app.models.device import Device
from app.models.enums import DeviceStatus, DeviceType, LinkStatus, RackStatus
from app.models.network_interface import NetworkInterface
from app.models.network_link import NetworkLink
from app.models.rack import Rack
from app.models.room import Room
from app.services.topology import PathResult, get_path

router = APIRouter()


# ─── Path response schemas ────────────────────────────────────────────────────

class PathEdge(BaseModel):
    from_device_id: uuid.UUID
    to_device_id: uuid.UUID
    link_id: Optional[uuid.UUID]
    link_type: Optional[str]
    speed_mbps: Optional[int]


class PathResponse(BaseModel):
    from_device_id: uuid.UUID
    to_device_id: uuid.UUID
    reachable: bool
    hop_count: int
    path_device_ids: list[uuid.UUID]
    edges: list[PathEdge]


# ─── React Flow schemas ───────────────────────────────────────────────────────

class NodePosition(BaseModel):
    x: float
    y: float


class TopologyNode(BaseModel):
    id: str
    type: str                     # "device"
    data: dict[str, Any]
    position: NodePosition


class TopologyEdge(BaseModel):
    id: str
    source: str                   # device UUID
    target: str
    data: dict[str, Any]


class TopologyGraph(BaseModel):
    nodes: list[TopologyNode]
    edges: list[TopologyEdge]


# ─── Rack elevation schemas ───────────────────────────────────────────────────

class RackSlotDevice(BaseModel):
    device_id: uuid.UUID
    name: str
    device_type: str
    rack_unit_start: int
    rack_unit_size: int
    face: Optional[str]
    status: str
    power_actual_w: Optional[int]
    power_rated_w: Optional[int]
    manufacturer: Optional[str]
    model: Optional[str]


class RackElevation(BaseModel):
    rack_id: uuid.UUID
    rack_name: str
    total_u: int
    max_power_w: Optional[int]
    used_u: int
    free_u: int
    power_actual_w: int
    power_rated_w: int
    devices: list[RackSlotDevice]


# ─── Datacenter floor plan schemas ───────────────────────────────────────────

class FloorRack(BaseModel):
    rack_id: uuid.UUID
    name: str
    row: Optional[str]
    column: Optional[str]
    total_u: int
    used_u: int
    device_count: int
    max_power_w: Optional[int]
    power_actual_w: int
    status: str


class FloorRoom(BaseModel):
    room_id: uuid.UUID
    name: str
    floor: Optional[int]
    racks: list[FloorRack]


class DatacenterFloorPlan(BaseModel):
    datacenter_id: uuid.UUID
    name: str
    rooms: list[FloorRoom]


# ─── Helpers ─────────────────────────────────────────────────────────────────

_NETWORK_DEVICE_TYPES = {
    DeviceType.switch,
    DeviceType.router,
    DeviceType.firewall,
    DeviceType.load_balancer,
}

# Simple grid layout: pack nodes left-to-right in rows of 8
_COLS = 8
_X_SPACING = 200
_Y_SPACING = 150


def _position(index: int) -> NodePosition:
    return NodePosition(
        x=float((index % _COLS) * _X_SPACING),
        y=float((index // _COLS) * _Y_SPACING),
    )


async def _load_devices_and_links(
    db: AsyncSession,
    device_filter: Any = None,
) -> tuple[list[Device], list[tuple[str, str, dict]]]:
    """Return active devices and deduplicated device-pair edges from active links."""
    # Load devices
    q = select(Device).where(Device.status != DeviceStatus.inactive)
    if device_filter is not None:
        q = q.where(device_filter)
    devices = list((await db.execute(q)).scalars().all())

    # Load active links joined to interfaces to resolve device_ids
    src_if = aliased(NetworkInterface, name="src_if")
    tgt_if = aliased(NetworkInterface, name="tgt_if")

    link_rows = (
        await db.execute(
            select(
                NetworkLink.id.label("link_id"),
                NetworkLink.link_type,
                NetworkLink.speed_mbps,
                NetworkLink.status,
                src_if.device_id.label("src_device_id"),
                tgt_if.device_id.label("tgt_device_id"),
            )
            .join(src_if, NetworkLink.source_interface_id == src_if.id)
            .join(tgt_if, NetworkLink.target_interface_id == tgt_if.id)
            .where(NetworkLink.status != LinkStatus.inactive)
        )
    ).all()

    # Deduplicate to one React Flow edge per ordered device pair
    # (keep first link encountered for edge data)
    seen: set[tuple[str, str]] = set()
    edges: list[tuple[str, str, dict]] = []
    for row in link_rows:
        src = str(row.src_device_id)
        tgt = str(row.tgt_device_id)
        if src == tgt:
            continue
        key = (min(src, tgt), max(src, tgt))
        if key not in seen:
            seen.add(key)
            edges.append((src, tgt, {
                "link_id": str(row.link_id),
                "link_type": row.link_type,
                "speed_mbps": row.speed_mbps,
            }))

    return devices, edges


def _build_graph(
    devices: list[Device],
    edges: list[tuple[str, str, dict]],
) -> TopologyGraph:
    device_index = {str(d.id): i for i, d in enumerate(devices)}
    nodes = [
        TopologyNode(
            id=str(d.id),
            type="device",
            data={
                "name": d.name,
                "device_type": d.device_type,
                "status": d.status,
                "manufacturer": d.manufacturer,
                "model": d.model,
                "rack_id": str(d.rack_id) if d.rack_id else None,
                "management_ip": str(d.management_ip) if d.management_ip else None,
                "power_actual_w": d.power_actual_w,
            },
            position=_position(i),
        )
        for i, d in enumerate(devices)
    ]

    # Only emit edges whose both endpoints are in this device set
    topo_edges = []
    for src, tgt, data in edges:
        if src in device_index and tgt in device_index:
            topo_edges.append(
                TopologyEdge(
                    id=f"{src}__{tgt}",
                    source=src,
                    target=tgt,
                    data=data,
                )
            )

    return TopologyGraph(nodes=nodes, edges=topo_edges)


# ─── GET /topology/path ───────────────────────────────────────────────────────

@router.get("/path", response_model=PathResponse)
async def get_topology_path(
    _: ActiveUser,
    from_device: uuid.UUID = Query(..., alias="from", description="Source device UUID"),
    to_device: uuid.UUID = Query(..., alias="to", description="Target device UUID"),
    db: AsyncSession = Depends(get_db),
) -> PathResponse:
    """
    Return the shortest hop path between two devices using the NetworkX graph.

    The graph is rebuilt on demand whenever network_links have been modified
    (dirty-flag cache).  Returns reachable=false if no path exists rather than
    a 404, so callers can distinguish "devices exist but not connected" from
    "device not found".
    """
    result: PathResult = await get_path(db, from_device, to_device)

    edges = [
        PathEdge(
            from_device_id=uuid.UUID(e["from_device_id"]),
            to_device_id=uuid.UUID(e["to_device_id"]),
            link_id=uuid.UUID(e["link_id"]) if e.get("link_id") else None,
            link_type=e.get("link_type"),
            speed_mbps=e.get("speed_mbps"),
        )
        for e in result.edges
    ]

    return PathResponse(
        from_device_id=result.from_device_id,
        to_device_id=result.to_device_id,
        reachable=result.reachable,
        hop_count=result.hop_count,
        path_device_ids=result.path_device_ids,
        edges=edges,
    )


# ─── GET /topology/physical ───────────────────────────────────────────────────

@router.get("/physical", response_model=TopologyGraph)
async def topology_physical(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> TopologyGraph:
    """
    All active devices as nodes + all active links as edges.
    Returns React Flow-compatible nodes/edges with device metadata.
    Position is a deterministic grid layout — the frontend can override with ELK.js.
    """
    devices, edges = await _load_devices_and_links(db)
    return _build_graph(devices, edges)


# ─── GET /topology/network ────────────────────────────────────────────────────

@router.get("/network", response_model=TopologyGraph)
async def topology_network(
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> TopologyGraph:
    """
    Network-device-focused graph: switches, routers, firewalls, load balancers.
    Any non-network device that has an active link to a network device is also
    included so the graph is not artificially disconnected.
    """
    # Load all active devices + links (full set; we filter nodes below)
    all_devices, all_edges = await _load_devices_and_links(db)

    # Identify network-device IDs
    net_ids: set[str] = {
        str(d.id)
        for d in all_devices
        if d.device_type in _NETWORK_DEVICE_TYPES
    }

    # Include any device that is connected to at least one network device
    connected_ids: set[str] = set(net_ids)
    for src, tgt, _ in all_edges:
        if src in net_ids or tgt in net_ids:
            connected_ids.add(src)
            connected_ids.add(tgt)

    filtered_devices = [d for d in all_devices if str(d.id) in connected_ids]
    return _build_graph(filtered_devices, all_edges)


# ─── GET /topology/rack/{id} ──────────────────────────────────────────────────

@router.get("/rack/{rack_id}", response_model=RackElevation)
async def topology_rack(
    rack_id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> RackElevation:
    """
    Rack elevation data — U-slot occupancy for the rack elevation component.
    Returns rack metadata and all non-inactive devices sorted by rack_unit_start.
    """
    rack = (
        await db.execute(select(Rack).where(Rack.id == rack_id))
    ).scalar_one_or_none()
    if rack is None:
        raise HTTPException(status_code=404, detail=f"Rack {rack_id} not found.")

    result = await db.execute(
        select(Device)
        .where(
            Device.rack_id == rack_id,
            Device.status != DeviceStatus.inactive,
        )
        .order_by(Device.rack_unit_start.asc().nulls_last())
    )
    devices = list(result.scalars().all())

    used_u = sum(d.rack_unit_size or 1 for d in devices if d.rack_unit_start is not None)
    power_actual = sum(d.power_actual_w or 0 for d in devices)
    power_rated = sum(d.power_rated_w or 0 for d in devices)

    slots = [
        RackSlotDevice(
            device_id=d.id,
            name=d.name,
            device_type=d.device_type,
            rack_unit_start=d.rack_unit_start or 0,
            rack_unit_size=d.rack_unit_size or 1,
            face=d.face,
            status=d.status,
            power_actual_w=d.power_actual_w,
            power_rated_w=d.power_rated_w,
            manufacturer=d.manufacturer,
            model=d.model,
        )
        for d in devices
    ]

    return RackElevation(
        rack_id=rack.id,
        rack_name=rack.name,
        total_u=rack.total_u,
        max_power_w=rack.max_power_w,
        used_u=used_u,
        free_u=max(0, rack.total_u - used_u),
        power_actual_w=power_actual,
        power_rated_w=power_rated,
        devices=slots,
    )


# ─── GET /topology/datacenter/{id} ───────────────────────────────────────────

@router.get("/datacenter/{datacenter_id}", response_model=DatacenterFloorPlan)
async def topology_datacenter(
    datacenter_id: uuid.UUID,
    _: ActiveUser,
    db: AsyncSession = Depends(get_db),
) -> DatacenterFloorPlan:
    """
    Datacenter floor plan — rooms and their racks with summary metrics.
    Racks are sorted by row then column for natural grid ordering.
    """
    dc = (
        await db.execute(select(DataCenter).where(DataCenter.id == datacenter_id))
    ).scalar_one_or_none()
    if dc is None:
        raise HTTPException(
            status_code=404, detail=f"Datacenter {datacenter_id} not found."
        )

    # Load rooms for this datacenter
    rooms = list(
        (
            await db.execute(
                select(Room)
                .where(Room.datacenter_id == datacenter_id)
                .order_by(Room.name)
            )
        )
        .scalars()
        .all()
    )

    floor_rooms: list[FloorRoom] = []
    for room in rooms:
        # Load racks for this room
        racks = list(
            (
                await db.execute(
                    select(Rack)
                    .where(
                        Rack.room_id == room.id,
                        Rack.status != RackStatus.decommissioned,
                    )
                    .order_by(Rack.row.nulls_last(), Rack.column.nulls_last())
                )
            )
            .scalars()
            .all()
        )

        floor_racks: list[FloorRack] = []
        for rack in racks:
            # Per-rack device summary
            devices = list(
                (
                    await db.execute(
                        select(Device).where(
                            Device.rack_id == rack.id,
                            Device.status != DeviceStatus.inactive,
                        )
                    )
                )
                .scalars()
                .all()
            )
            used_u = sum(
                d.rack_unit_size or 1
                for d in devices
                if d.rack_unit_start is not None
            )
            power_actual = sum(d.power_actual_w or 0 for d in devices)

            floor_racks.append(
                FloorRack(
                    rack_id=rack.id,
                    name=rack.name,
                    row=rack.row,
                    column=rack.column,
                    total_u=rack.total_u,
                    used_u=used_u,
                    device_count=len(devices),
                    max_power_w=rack.max_power_w,
                    power_actual_w=power_actual,
                    status=rack.status,
                )
            )

        floor_rooms.append(
            FloorRoom(room_id=room.id, name=room.name, floor=room.floor, racks=floor_racks)
        )

    return DatacenterFloorPlan(
        datacenter_id=dc.id,
        name=dc.name,
        rooms=floor_rooms,
    )


# ─── GET /topology/floor-plan ─────────────────────────────────────────────────
# Frontend-facing alias: accepts ?datacenter_id= query param and returns
# field names that match the TypeScript FloorPlanResponse type.

class _FPRack(BaseModel):
    id: str
    name: str
    position_in_room: Optional[int]
    total_units: int
    used_units: int
    power_max_w: Optional[int]
    power_actual_w: int
    power_utilization_pct: Optional[float]
    device_count: int


class _FPRoom(BaseModel):
    id: str
    name: str
    notes: Optional[str]
    racks: list[_FPRack]


class _FPResponse(BaseModel):
    id: str
    name: str
    rooms: list[_FPRoom]


@router.get("/floor-plan", response_model=_FPResponse)
async def topology_floor_plan(
    _: ActiveUser,
    datacenter_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
) -> _FPResponse:
    """
    Datacenter floor plan for the frontend topology canvas.
    Returns field names that match the TypeScript FloorPlanResponse type.
    """
    dc = (
        await db.execute(select(DataCenter).where(DataCenter.id == datacenter_id))
    ).scalar_one_or_none()
    if dc is None:
        raise HTTPException(status_code=404, detail=f"Datacenter {datacenter_id} not found.")

    rooms = list(
        (
            await db.execute(
                select(Room).where(Room.datacenter_id == datacenter_id).order_by(Room.name)
            )
        )
        .scalars()
        .all()
    )

    fp_rooms: list[_FPRoom] = []
    for room in rooms:
        racks = list(
            (
                await db.execute(
                    select(Rack)
                    .where(Rack.room_id == room.id, Rack.status != RackStatus.decommissioned)
                    .order_by(Rack.row.nulls_last(), Rack.column.nulls_last())
                )
            )
            .scalars()
            .all()
        )

        fp_racks: list[_FPRack] = []
        for rack in racks:
            devices = list(
                (
                    await db.execute(
                        select(Device).where(
                            Device.rack_id == rack.id,
                            Device.status != DeviceStatus.inactive,
                        )
                    )
                )
                .scalars()
                .all()
            )
            used_u = sum(d.rack_unit_size or 1 for d in devices if d.rack_unit_start is not None)
            power_actual = sum(d.power_actual_w or 0 for d in devices)
            pct: Optional[float] = None
            if rack.max_power_w:
                pct = round(power_actual / rack.max_power_w * 100, 1)

            fp_racks.append(
                _FPRack(
                    id=str(rack.id),
                    name=rack.name,
                    position_in_room=None,
                    total_units=rack.total_u,
                    used_units=used_u,
                    power_max_w=rack.max_power_w,
                    power_actual_w=power_actual,
                    power_utilization_pct=pct,
                    device_count=len(devices),
                )
            )

        fp_rooms.append(
            _FPRoom(id=str(room.id), name=room.name, notes=room.notes, racks=fp_racks)
        )

    return _FPResponse(id=str(dc.id), name=dc.name, rooms=fp_rooms)
