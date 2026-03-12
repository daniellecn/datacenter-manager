"""
Audit log API tests + meta-test verifying every mutating endpoint writes
at least one audit_logs row.
"""
import uuid

import pytest
from sqlalchemy import func, select

from app.models.audit_log import AuditLog
from tests.factories import DatacenterFactory, DeviceFactory, RackFactory, RoomFactory


# ── Basic API tests ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_audit_logs(readonly_client, db):
    from app.models.enums import AuditAction
    from app.models.audit_log import AuditLog as AL
    db.add(AL(
        entity_type="device",
        entity_id=str(uuid.uuid4()),
        action=AuditAction.create,
        diff={"test": True},
    ))
    await db.flush()
    resp = await readonly_client.get("/api/v1/audit-logs")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data


@pytest.mark.asyncio
async def test_audit_log_entity_filter(readonly_client, db):
    from app.models.enums import AuditAction
    from app.models.audit_log import AuditLog as AL
    device_id = str(uuid.uuid4())
    db.add(AL(entity_type="device", entity_id=device_id, action=AuditAction.create, diff={}))
    await db.flush()

    resp = await readonly_client.get(f"/api/v1/audit-logs/device/{device_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["entity_id"] == device_id for item in data["items"])


# ── Meta-test: every mutating endpoint writes at least one audit row ──────────

@pytest.mark.asyncio
async def test_create_datacenter_produces_audit_log(operator_client, db):
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.post("/api/v1/datacenters", json={"name": "AuditMetaDC", "country": "US"})
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before


@pytest.mark.asyncio
async def test_update_datacenter_produces_audit_log(operator_client, db):
    dc = await DatacenterFactory.create(db)
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.put(f"/api/v1/datacenters/{dc.id}", json={"name": "AuditMetaDCUpdated"})
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before


@pytest.mark.asyncio
async def test_delete_datacenter_produces_audit_log(operator_client, db):
    dc = await DatacenterFactory.create(db)
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.delete(f"/api/v1/datacenters/{dc.id}")
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before


@pytest.mark.asyncio
async def test_create_device_produces_audit_log(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.post(
        "/api/v1/devices",
        json={
            "name": "audit-meta-device",
            "device_type": "server",
            "serial_number": f"AMETA-{uuid.uuid4().hex[:8]}",
            "rack_id": str(rack.id),
        },
    )
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before


@pytest.mark.asyncio
async def test_delete_device_produces_audit_log(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.delete(f"/api/v1/devices/{device.id}")
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before


@pytest.mark.asyncio
async def test_create_vlan_produces_audit_log(operator_client, db):
    before = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    await operator_client.post("/api/v1/vlans", json={"vlan_id": 777, "name": "audit-vlan-777"})
    after = (await db.execute(select(func.count(AuditLog.id)))).scalar()
    assert after > before
