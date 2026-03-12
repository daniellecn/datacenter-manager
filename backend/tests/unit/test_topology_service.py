"""
Unit tests for app.services.topology — graph cache, path tracing, edge cases.

These tests work at the service level, directly calling get_path() with a
real test database session (provided by the session-scoped engine fixture from
conftest.py). The topology graph is rebuilt from network_links rows each time
the dirty flag is set.
"""
import uuid

import pytest

import app.services.topology as topo_svc
from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    NetworkInterfaceFactory,
    NetworkLinkFactory,
    RackFactory,
    RoomFactory,
)
from app.models.enums import LinkStatus


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _build_chain(db, n: int):
    """Build a linear chain of n devices: A─B─C─...─N.
    Returns list of devices in order.
    """
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    devices = []
    interfaces = []
    for i in range(n):
        d = await DeviceFactory.create(
            db, rack_id=rack.id, name=f"chain-dev-{i}", serial_number=f"CHAIN-{uuid.uuid4().hex[:8]}"
        )
        iface = await NetworkInterfaceFactory.create(db, device_id=d.id, name="eth0")
        devices.append(d)
        interfaces.append(iface)
    # Link them sequentially
    for i in range(n - 1):
        await NetworkLinkFactory.create(
            db,
            source_interface_id=interfaces[i].id,
            target_interface_id=interfaces[i + 1].id,
        )
    return devices


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_dirty_sets_flag():
    topo_svc._dirty = False
    topo_svc.mark_dirty()
    assert topo_svc._dirty is True


@pytest.mark.asyncio
async def test_same_device_path_is_reachable(db):
    topo_svc.mark_dirty()
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"SELF-{uuid.uuid4().hex[:8]}")

    result = await topo_svc.get_path(db, dev.id, dev.id)
    assert result.reachable is True
    assert result.hop_count == 0
    assert result.path_device_ids == [dev.id]


@pytest.mark.asyncio
async def test_direct_link_one_hop(db):
    topo_svc.mark_dirty()
    devices = await _build_chain(db, 2)
    result = await topo_svc.get_path(db, devices[0].id, devices[1].id)
    assert result.reachable is True
    assert result.hop_count == 1
    assert len(result.path_device_ids) == 2


@pytest.mark.asyncio
async def test_three_hop_path(db):
    topo_svc.mark_dirty()
    devices = await _build_chain(db, 4)
    result = await topo_svc.get_path(db, devices[0].id, devices[3].id)
    assert result.reachable is True
    assert result.hop_count == 3
    assert len(result.path_device_ids) == 4


@pytest.mark.asyncio
async def test_disconnected_graph_returns_unreachable(db):
    """Two devices with no link → reachable=False."""
    topo_svc.mark_dirty()
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev_a = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"DISCO-A-{uuid.uuid4().hex[:8]}")
    dev_b = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"DISCO-B-{uuid.uuid4().hex[:8]}")

    result = await topo_svc.get_path(db, dev_a.id, dev_b.id)
    assert result.reachable is False
    assert result.hop_count == -1
    assert result.path_device_ids == []


@pytest.mark.asyncio
async def test_isolated_single_node_unreachable(db):
    """A device not connected to anything → unreachable to any other device."""
    topo_svc.mark_dirty()
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    isolated = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"ISOL-{uuid.uuid4().hex[:8]}")
    other = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"OTHER-{uuid.uuid4().hex[:8]}")
    # No link between them

    result = await topo_svc.get_path(db, isolated.id, other.id)
    assert result.reachable is False


@pytest.mark.asyncio
async def test_graph_with_cycle_finds_shortest_path(db):
    """A─B─C─A (triangle cycle): A→C should find hop_count=1 (direct), not 2 (via B)."""
    topo_svc.mark_dirty()
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)

    dev_a = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"CYC-A-{uuid.uuid4().hex[:8]}")
    dev_b = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"CYC-B-{uuid.uuid4().hex[:8]}")
    dev_c = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"CYC-C-{uuid.uuid4().hex[:8]}")

    iface_a1 = await NetworkInterfaceFactory.create(db, device_id=dev_a.id, name="eth0")
    iface_a2 = await NetworkInterfaceFactory.create(db, device_id=dev_a.id, name="eth1")
    iface_b1 = await NetworkInterfaceFactory.create(db, device_id=dev_b.id, name="eth0")
    iface_b2 = await NetworkInterfaceFactory.create(db, device_id=dev_b.id, name="eth1")
    iface_c1 = await NetworkInterfaceFactory.create(db, device_id=dev_c.id, name="eth0")
    iface_c2 = await NetworkInterfaceFactory.create(db, device_id=dev_c.id, name="eth1")

    # A─B, B─C, C─A (triangle)
    await NetworkLinkFactory.create(db, source_interface_id=iface_a1.id, target_interface_id=iface_b1.id)
    await NetworkLinkFactory.create(db, source_interface_id=iface_b2.id, target_interface_id=iface_c1.id)
    await NetworkLinkFactory.create(db, source_interface_id=iface_c2.id, target_interface_id=iface_a2.id)

    result = await topo_svc.get_path(db, dev_a.id, dev_c.id)
    assert result.reachable is True
    assert result.hop_count == 1  # direct edge A─C via the C─A link


@pytest.mark.asyncio
async def test_inactive_links_excluded_from_graph(db):
    """Links with status=inactive must not be included in the topology graph."""
    topo_svc.mark_dirty()
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)

    dev_a = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"INACT-A-{uuid.uuid4().hex[:8]}")
    dev_b = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"INACT-B-{uuid.uuid4().hex[:8]}")

    iface_a = await NetworkInterfaceFactory.create(db, device_id=dev_a.id)
    iface_b = await NetworkInterfaceFactory.create(db, device_id=dev_b.id)

    # Create an inactive link
    await NetworkLinkFactory.create(
        db,
        source_interface_id=iface_a.id,
        target_interface_id=iface_b.id,
        status=LinkStatus.inactive,
    )

    result = await topo_svc.get_path(db, dev_a.id, dev_b.id)
    assert result.reachable is False


@pytest.mark.asyncio
async def test_graph_cache_dirty_flag_cleared_after_build(db):
    """After rebuilding, dirty must be False."""
    topo_svc.mark_dirty()
    assert topo_svc._dirty is True
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev = await DeviceFactory.create(db, rack_id=rack.id, serial_number=f"DIRTY-{uuid.uuid4().hex[:8]}")
    # Trigger rebuild
    await topo_svc.get_path(db, dev.id, dev.id)
    assert topo_svc._dirty is False
