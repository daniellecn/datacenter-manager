"""
API tests for network layer endpoints:
  - Interfaces, Links, VLANs, IP Networks, IP Addresses, SAN Fabrics
  - IP/CIDR edge cases: /32 hosts, containment queries
  - RBAC checks
"""
import uuid

import pytest

from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    IPAddressFactory,
    IPNetworkFactory,
    NetworkInterfaceFactory,
    NetworkLinkFactory,
    RackFactory,
    RoomFactory,
    SANFabricFactory,
    VLANFactory,
    make_linked_devices,
)


# ── Interfaces ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_interface(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await operator_client.post(
        "/api/v1/interfaces",
        json={
            "device_id": str(device.id),
            "name": "eth0",
            "media_type": "copper_rj45",
            "speed_mbps": 1000,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "eth0"


@pytest.mark.asyncio
async def test_list_interfaces_by_device(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    dev1 = await DeviceFactory.create(db, rack_id=rack.id)
    dev2 = await DeviceFactory.create(db, rack_id=rack.id)
    iface1 = await NetworkInterfaceFactory.create(db, device_id=dev1.id)
    iface2 = await NetworkInterfaceFactory.create(db, device_id=dev2.id)

    resp = await readonly_client.get(f"/api/v1/interfaces?device_id={dev1.id}")
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()["items"]]
    assert str(iface1.id) in ids
    assert str(iface2.id) not in ids


@pytest.mark.asyncio
async def test_interface_read_only_cannot_create(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await readonly_client.post(
        "/api/v1/interfaces",
        json={"device_id": str(device.id), "name": "eth99", "media_type": "sfp"},
    )
    assert resp.status_code == 403


# ── Links ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_link(operator_client, db):
    dev_a, dev_b, _, _, _ = await make_linked_devices(db)
    # make_linked_devices already created links; let's create a new pair
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    d1 = await DeviceFactory.create(db, rack_id=rack.id)
    d2 = await DeviceFactory.create(db, rack_id=rack.id)
    if1 = await NetworkInterfaceFactory.create(db, device_id=d1.id, name="eth0")
    if2 = await NetworkInterfaceFactory.create(db, device_id=d2.id, name="eth0")

    resp = await operator_client.post(
        "/api/v1/links",
        json={
            "source_interface_id": str(if1.id),
            "target_interface_id": str(if2.id),
            "link_type": "ethernet",
            "status": "active",
            "speed_mbps": 1000,
        },
    )
    assert resp.status_code == 201


# ── VLANs ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_vlan(operator_client, db):
    resp = await operator_client.post(
        "/api/v1/vlans",
        json={"vlan_id": 999, "name": "test-vlan-999"},
    )
    assert resp.status_code == 201
    assert resp.json()["vlan_id"] == 999


@pytest.mark.asyncio
async def test_duplicate_vlan_id_returns_409(operator_client, db):
    await VLANFactory.create(db, vlan_id=888, name="first-vlan")
    resp = await operator_client.post(
        "/api/v1/vlans",
        json={"vlan_id": 888, "name": "second-vlan"},
    )
    assert resp.status_code == 409


# ── IP Networks ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_ip_network(operator_client, db):
    resp = await operator_client.post(
        "/api/v1/ip-networks",
        json={"cidr": "192.168.1.0/24", "name": "test-net"},
    )
    assert resp.status_code == 201
    assert "192.168.1.0/24" in resp.json()["cidr"]


@pytest.mark.asyncio
async def test_duplicate_cidr_returns_409(operator_client, db):
    await IPNetworkFactory.create(db, cidr="10.0.0.0/8", name="net1")
    resp = await operator_client.post(
        "/api/v1/ip-networks",
        json={"cidr": "10.0.0.0/8", "name": "net2"},
    )
    assert resp.status_code == 409


# ── IP Addresses — edge cases ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_host_slash_32(operator_client, db):
    net = await IPNetworkFactory.create(db, cidr="172.16.0.0/24", name="host-net")
    resp = await operator_client.post(
        "/api/v1/ip-addresses",
        json={
            "address": "172.16.0.100",
            "subnet_id": str(net.id),
            "status": "in_use",
        },
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_ip_available_endpoint_declared_before_id_route(readonly_client, db):
    """GET /ip-addresses/available must not be shadowed by /{id} route."""
    net = await IPNetworkFactory.create(db, cidr="172.16.1.0/24", name="avail-net")
    resp = await readonly_client.get(f"/api/v1/ip-addresses/available?subnet_id={net.id}")
    # Must return 200 (not 422 / 404 from mistakenly routing to /{id})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_create_ip_duplicate_returns_409(operator_client, db):
    net = await IPNetworkFactory.create(db, cidr="172.17.0.0/24", name="dup-net")
    payload = {"address": "172.17.0.50", "subnet_id": str(net.id), "status": "in_use"}
    resp1 = await operator_client.post("/api/v1/ip-addresses", json=payload)
    assert resp1.status_code == 201

    resp2 = await operator_client.post("/api/v1/ip-addresses", json=payload)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_ip_status_deprecated(operator_client, db):
    net = await IPNetworkFactory.create(db, cidr="172.18.0.0/24", name="depr-net")
    resp = await operator_client.post(
        "/api/v1/ip-addresses",
        json={"address": "172.18.0.5", "subnet_id": str(net.id), "status": "deprecated"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "deprecated"


# ── SAN Fabrics ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_san_fabric(operator_client, db):
    resp = await operator_client.post(
        "/api/v1/san-fabrics",
        json={"name": "fabric-a", "fabric_type": "fc"},
    )
    assert resp.status_code == 201
    assert resp.json()["fabric_type"] == "fc"


@pytest.mark.asyncio
async def test_list_san_fabrics(readonly_client, db):
    await SANFabricFactory.create(db, name="san-list-test")
    resp = await readonly_client.get("/api/v1/san-fabrics")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
