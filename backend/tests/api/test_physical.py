"""
API tests for physical layer endpoints:
  - Datacenters (/api/v1/datacenters)
  - Rooms (/api/v1/rooms)
  - Racks (/api/v1/racks)
  - Licenses (/api/v1/licenses)
"""
import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    LicenseFactory,
    RackFactory,
    RoomFactory,
    make_physical_stack,
)


# ── Datacenters ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_datacenters(readonly_client, db):
    await DatacenterFactory.create(db, name="DC-List-Test")
    resp = await readonly_client.get("/api/v1/datacenters")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_create_datacenter(operator_client, db):
    payload = {"name": "TestDC", "city": "Gotham", "country": "US"}
    resp = await operator_client.post("/api/v1/datacenters", json=payload)
    assert resp.status_code == 201
    assert resp.json()["name"] == "TestDC"


@pytest.mark.asyncio
async def test_create_datacenter_audit_log(operator_client, db):
    payload = {"name": "AuditDC", "city": "Metropolis", "country": "US"}
    resp = await operator_client.post("/api/v1/datacenters", json=payload)
    assert resp.status_code == 201
    dc_id = resp.json()["id"]

    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "datacenter",
            AuditLog.entity_id == dc_id,
            AuditLog.action == AuditAction.create,
        )
    )).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_get_datacenter(operator_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await operator_client.get(f"/api/v1/datacenters/{dc.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(dc.id)


@pytest.mark.asyncio
async def test_get_datacenter_not_found(operator_client):
    resp = await operator_client.get(f"/api/v1/datacenters/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_datacenter(operator_client, db):
    dc = await DatacenterFactory.create(db, name="OldDCName")
    resp = await operator_client.put(f"/api/v1/datacenters/{dc.id}", json={"name": "NewDCName"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "NewDCName"


@pytest.mark.asyncio
async def test_delete_datacenter(operator_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await operator_client.delete(f"/api/v1/datacenters/{dc.id}")
    assert resp.status_code in (200, 204)


@pytest.mark.asyncio
async def test_datacenter_read_only_cannot_create(readonly_client):
    resp = await readonly_client.post("/api/v1/datacenters", json={"name": "Hack"})
    assert resp.status_code == 403


# ── Rooms ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_room(operator_client, db):
    dc = await DatacenterFactory.create(db)
    resp = await operator_client.post(
        "/api/v1/rooms", json={"name": "Room-A", "datacenter_id": str(dc.id)}
    )
    assert resp.status_code == 201
    assert resp.json()["datacenter_id"] == str(dc.id)


@pytest.mark.asyncio
async def test_list_rooms_filter_by_datacenter(operator_client, db):
    dc1 = await DatacenterFactory.create(db)
    dc2 = await DatacenterFactory.create(db)
    room1 = await RoomFactory.create(db, datacenter_id=dc1.id)
    room2 = await RoomFactory.create(db, datacenter_id=dc2.id)

    resp = await operator_client.get(f"/api/v1/rooms?datacenter_id={dc1.id}")
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["items"]]
    assert str(room1.id) in ids
    assert str(room2.id) not in ids


# ── Racks ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_rack(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    resp = await operator_client.post(
        "/api/v1/racks",
        json={"name": "Rack-01", "room_id": str(room.id), "total_u": 42},
    )
    assert resp.status_code == 201
    assert resp.json()["total_u"] == 42


@pytest.mark.asyncio
async def test_rack_power_summary(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id, max_power_w=5000)
    await DeviceFactory.create(db, rack_id=rack.id, power_rated_w=500)

    resp = await readonly_client.get(f"/api/v1/racks/{rack.id}/power-summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "max_power_w" in data
    assert "rated_w" in data


@pytest.mark.asyncio
async def test_rack_devices_list_excludes_inactive(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    active = await DeviceFactory.create(db, rack_id=rack.id)
    from app.models.enums import DeviceStatus
    inactive = await DeviceFactory.create(db, rack_id=rack.id, status=DeviceStatus.inactive)

    resp = await readonly_client.get(f"/api/v1/racks/{rack.id}/devices")
    assert resp.status_code == 200
    ids = [d["id"] for d in resp.json()]
    assert str(active.id) in ids
    assert str(inactive.id) not in ids


# ── Licenses ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_license(operator_client, db):
    dc, room, rack, device = await make_physical_stack(db)
    payload = {
        "device_id": str(device.id),
        "product_name": "VMware vSphere",
        "license_type": "subscription",
        "quantity": 4,
    }
    resp = await operator_client.post("/api/v1/licenses", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["product_name"] == "VMware vSphere"
    # License key must not be exposed
    assert "license_key_enc" not in resp.text
    assert "license_key" not in data or data.get("license_key") is None


@pytest.mark.asyncio
async def test_licenses_expiring_endpoint(readonly_client, db):
    """GET /licenses/expiring must return before /{id} is matched."""
    dc, room, rack, device = await make_physical_stack(db)
    # Create an expiring license
    from app.models.license import License
    expiring = License(
        id=uuid.uuid4(),
        device_id=device.id,
        product_name="Expiring License",
        license_type="subscription",
        quantity=1,
        expiry_date=date(2026, 4, 1),  # soon
    )
    db.add(expiring)
    await db.flush()

    resp = await readonly_client.get("/api/v1/licenses/expiring")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_license_no_key_in_response(operator_client, db):
    dc, room, rack, device = await make_physical_stack(db)
    payload = {
        "device_id": str(device.id),
        "product_name": "Secret Licensed Product",
        "license_type": "perpetual",
        "license_key": "AAAA-BBBB-CCCC-DDDD",
    }
    resp = await operator_client.post("/api/v1/licenses", json=payload)
    assert resp.status_code == 201
    # The raw encrypted key must not be in the response body
    assert "license_key_enc" not in resp.text
