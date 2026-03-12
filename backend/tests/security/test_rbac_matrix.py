"""
RBAC matrix test: for every mutating endpoint, assert that:
  - read_only user receives 403 Forbidden
  - unauthenticated request receives 401 Unauthorized
  - operator/admin user receives 2xx (success)

The parametrized cases cover one representative mutating endpoint per
resource group. Full endpoint coverage is validated in the resource-
specific test files; this file focuses on the auth/authz layer.
"""
import uuid

import pytest

from tests.factories import (
    AlertFactory,
    DatacenterFactory,
    DeviceFactory,
    IPNetworkFactory,
    RackFactory,
    RoomFactory,
    SANFabricFactory,
    VirtClusterFactory,
    VirtHostFactory,
    make_physical_stack,
)


# ── Parametrized RBAC cases ───────────────────────────────────────────────────
# Each tuple: (method, path_template, body_factory_coro, description)
# path_template may contain {id} which is filled with a real UUID from the DB.


@pytest.mark.asyncio
async def test_rbac_create_datacenter_read_only_403(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/datacenters", json={"name": "rbac-dc"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_datacenter_unauth_401(client):
    resp = await client.post("/api/v1/datacenters", json={"name": "rbac-dc"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_rbac_create_datacenter_operator_2xx(operator_client):
    resp = await operator_client.post(
        "/api/v1/datacenters", json={"name": f"rbac-op-dc-{uuid.uuid4().hex[:8]}"}
    )
    assert resp.status_code in (200, 201)


@pytest.mark.asyncio
async def test_rbac_update_datacenter_read_only_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await readonly_client.put(f"/api/v1/datacenters/{dc.id}", json={"name": "hack"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_update_datacenter_unauth_401(client, db):
    dc = await DatacenterFactory.create(db)
    resp = await client.put(f"/api/v1/datacenters/{dc.id}", json={"name": "hack"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_rbac_delete_datacenter_read_only_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await readonly_client.delete(f"/api/v1/datacenters/{dc.id}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_room_read_only_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await readonly_client.post(
        "/api/v1/rooms", json={"name": "rm", "datacenter_id": str(dc.id)}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_rack_read_only_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    resp = await readonly_client.post(
        "/api/v1/racks",
        json={"name": "rk", "room_id": str(room.id), "total_units": 42},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_device_read_only_403(readonly_client, db):
    dc, room, rack, _ = await make_physical_stack(db)
    resp = await readonly_client.post(
        "/api/v1/devices",
        json={
            "name": "rbac-dev",
            "device_type": "server",
            "serial_number": f"RBAC-{uuid.uuid4().hex[:8]}",
            "rack_id": str(rack.id),
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_delete_device_read_only_403(readonly_client, db):
    dc, room, rack, device = await make_physical_stack(db)
    resp = await readonly_client.delete(f"/api/v1/devices/{device.id}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_vlan_read_only_403(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/vlans", json={"vlan_id": 1234, "name": "rbac-vlan"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_ip_network_read_only_403(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/ip-networks", json={"cidr": "10.99.0.0/24", "name": "rbac-net"}
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_cluster_read_only_403(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/virt/clusters",
        json={"name": "rbac-cluster", "platform": "proxmox"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_acknowledge_alert_read_only_403(readonly_client, db):
    alert = await AlertFactory.create(db)
    resp = await readonly_client.post(f"/api/v1/alerts/{alert.id}/acknowledge")
    assert resp.status_code == 403


# ── Read endpoints accessible to all roles ────────────────────────────────────

@pytest.mark.asyncio
async def test_rbac_list_datacenters_read_only_200(readonly_client):
    resp = await readonly_client.get("/api/v1/datacenters")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rbac_list_devices_read_only_200(readonly_client):
    resp = await readonly_client.get("/api/v1/devices")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rbac_dashboard_read_only_200(readonly_client):
    resp = await readonly_client.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200


# ── Admin-only endpoints ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rbac_list_users_operator_403(operator_client):
    resp = await operator_client.get("/api/v1/users")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_list_users_admin_200(admin_client):
    resp = await admin_client.get("/api/v1/users")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rbac_create_user_read_only_403(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/users",
        json={"username": "new_user", "password": "P@ss1234!", "role": "read_only"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_rbac_create_user_operator_403(operator_client):
    resp = await operator_client.post(
        "/api/v1/users",
        json={"username": "new_user2", "password": "P@ss1234!", "role": "read_only"},
    )
    assert resp.status_code == 403
