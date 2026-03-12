"""
API tests for topology endpoints:
  - Path tracing (reachable / unreachable)
  - Physical topology
  - Floor plan
  - Edge cases: disconnected, isolated, cycle
"""
import uuid

import pytest

from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    NetworkInterfaceFactory,
    NetworkLinkFactory,
    RackFactory,
    RoomFactory,
    make_linked_devices,
)


# ── Path tracing ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_path_trace_reachable(readonly_client, db):
    import app.services.topology as topo_svc
    topo_svc.mark_dirty()

    dev_a, _, dev_c, _, _ = await make_linked_devices(db)

    resp = await readonly_client.get(
        f"/api/v1/topology/path?from={dev_a.id}&to={dev_c.id}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reachable"] is True
    assert data["hop_count"] == 2


@pytest.mark.asyncio
async def test_path_trace_disconnected(readonly_client, db):
    import app.services.topology as topo_svc
    topo_svc.mark_dirty()

    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev_a = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"PT-A-{uuid.uuid4().hex[:8]}")
    dev_b = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"PT-B-{uuid.uuid4().hex[:8]}")

    resp = await readonly_client.get(
        f"/api/v1/topology/path?from={dev_a.id}&to={dev_b.id}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reachable"] is False


@pytest.mark.asyncio
async def test_path_same_device(readonly_client, db):
    import app.services.topology as topo_svc
    topo_svc.mark_dirty()

    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"PT-SAME-{uuid.uuid4().hex[:8]}")

    resp = await readonly_client.get(
        f"/api/v1/topology/path?from={dev.id}&to={dev.id}"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["reachable"] is True
    assert data["hop_count"] == 0


# ── Physical topology ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_physical_topology_endpoint(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await readonly_client.get(f"/api/v1/topology/physical?datacenter_id={dc.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@pytest.mark.asyncio
async def test_network_topology_endpoint(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await readonly_client.get(f"/api/v1/topology/network?datacenter_id={dc.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


# ── Floor plan ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_floor_plan_endpoint(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)

    resp = await readonly_client.get(f"/api/v1/topology/floor-plan?datacenter_id={dc.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "rooms" in data


# ── Rack elevation ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rack_elevation_endpoint(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id, total_u=42)
    dev = await DeviceFactory.create(db, rack_id=rack.id, rack_unit_start=1, rack_unit_size=2)

    resp = await readonly_client.get(f"/api/v1/topology/rack/{rack.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "devices" in data
    device_ids = [d["device_id"] for d in data["devices"]]
    assert str(dev.id) in device_ids
