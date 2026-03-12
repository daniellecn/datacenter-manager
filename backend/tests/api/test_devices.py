"""
API tests for /api/v1/devices:
  - CRUD operations
  - Soft-delete (status=inactive, row preserved)
  - Default list excludes inactive
  - Duplicate serial → 409
  - RBAC matrix for mutating endpoints
  - Audit log written for every mutation
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.device import Device
from app.models.enums import AuditAction, DeviceStatus, DeviceType
from tests.factories import DatacenterFactory, DeviceFactory, RackFactory, RoomFactory


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _device_payload(db, rack_id=None, **overrides) -> dict:
    if rack_id is None:
        dc = await DatacenterFactory.create(db)
        room = await RoomFactory.create(db, datacenter_id=dc.id)
        rack = await RackFactory.create(db, room_id=room.id)
        rack_id = str(rack.id)
    return {
        "name": "test-server",
        "device_type": "server",
        "serial_number": f"SN-{uuid.uuid4().hex[:10]}",
        "rack_id": str(rack_id),
        **overrides,
    }


# ── List ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_devices_excludes_inactive_by_default(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    active = await DeviceFactory.create(db, rack_id=rack.id, status=DeviceStatus.active)
    inactive = await DeviceFactory.create(db, rack_id=rack.id, status=DeviceStatus.inactive)

    resp = await operator_client.get("/api/v1/devices")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert str(active.id) in ids
    assert str(inactive.id) not in ids


@pytest.mark.asyncio
async def test_list_devices_explicit_inactive_filter(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    inactive = await DeviceFactory.create(db, rack_id=rack.id, status=DeviceStatus.inactive)

    resp = await operator_client.get("/api/v1/devices?status=inactive")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()["items"]]
    assert str(inactive.id) in ids


# ── Create ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_device(operator_client, db):
    payload = await _device_payload(db)
    resp = await operator_client.post("/api/v1/devices", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == payload["name"]
    assert data["device_type"] == "server"


@pytest.mark.asyncio
async def test_create_device_writes_audit_log(operator_client, db):
    payload = await _device_payload(db)
    resp = await operator_client.post("/api/v1/devices", json=payload)
    assert resp.status_code == 201
    device_id = resp.json()["id"]

    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == device_id,
            AuditLog.action == AuditAction.create,
        )
    )).scalars().all()
    assert len(audit_rows) == 1


@pytest.mark.asyncio
async def test_create_device_duplicate_serial_returns_409(operator_client, db):
    payload = await _device_payload(db)
    resp1 = await operator_client.post("/api/v1/devices", json=payload)
    assert resp1.status_code == 201

    # Duplicate serial
    payload2 = dict(payload)
    payload2["name"] = "different-name"
    resp2 = await operator_client.post("/api/v1/devices", json=payload2)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_create_device_no_encrypted_fields_in_response(operator_client, db):
    payload = await _device_payload(db, ssh_password="secret-password", ssh_username="root")
    resp = await operator_client.post("/api/v1/devices", json=payload)
    assert resp.status_code == 201
    body = resp.text
    assert "ssh_password_enc" not in body
    assert "ssh_key_enc" not in body


# ── Read ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_device(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await operator_client.get(f"/api/v1/devices/{device.id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(device.id)


@pytest.mark.asyncio
async def test_get_nonexistent_device_returns_404(operator_client):
    resp = await operator_client.get(f"/api/v1/devices/{uuid.uuid4()}")
    assert resp.status_code == 404


# ── Update ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_device(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id, name="original-name")

    resp = await operator_client.put(
        f"/api/v1/devices/{device.id}", json={"name": "updated-name"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "updated-name"


@pytest.mark.asyncio
async def test_update_device_writes_audit_log(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id, name="before-update")

    await operator_client.put(f"/api/v1/devices/{device.id}", json={"name": "after-update"})

    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == str(device.id),
            AuditLog.action == AuditAction.update,
        )
    )).scalars().all()
    assert len(audit_rows) >= 1


# ── Soft-delete ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_device_sets_inactive(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await operator_client.delete(f"/api/v1/devices/{device.id}")
    assert resp.status_code in (200, 204)

    await db.refresh(device)
    assert device.status == DeviceStatus.inactive


@pytest.mark.asyncio
async def test_delete_device_row_not_hard_deleted(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    await operator_client.delete(f"/api/v1/devices/{device.id}")

    row = (await db.execute(select(Device).where(Device.id == device.id))).scalar_one_or_none()
    assert row is not None


# ── RBAC ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_device_read_only_returns_403(readonly_client, db):
    payload = await _device_payload(db)
    resp = await readonly_client.post("/api/v1/devices", json=payload)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_device_read_only_returns_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await readonly_client.put(f"/api/v1/devices/{device.id}", json={"name": "hack"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_device_read_only_returns_403(readonly_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)

    resp = await readonly_client.delete(f"/api/v1/devices/{device.id}")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_device_unauthenticated_returns_401(client, db):
    payload = await _device_payload(db)
    resp = await client.post("/api/v1/devices", json=payload)
    assert resp.status_code == 401
