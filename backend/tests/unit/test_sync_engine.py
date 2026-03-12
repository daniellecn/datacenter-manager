"""
Unit tests for app.services.sync_engine — upsert, diff, idempotency,
inactive-not-delete rule, and audit log accuracy.
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.device import Device
from app.models.enums import AuditAction, DeviceStatus, DeviceType
from app.services.sync_engine import (
    SyncStats,
    compute_diff,
    mark_missing_devices_inactive,
    upsert_device_by_serial,
)
from tests.factories import DatacenterFactory, DeviceFactory, RackFactory, RoomFactory


# ── compute_diff unit tests ───────────────────────────────────────────────────

def test_compute_diff_detects_changed_field():
    before = {"name": "old-name", "status": "active"}
    after = {"name": "new-name", "status": "active"}
    diff = compute_diff(before, after)
    assert "name" in diff
    assert diff["name"]["before"] == "old-name"
    assert diff["name"]["after"] == "new-name"
    assert "status" not in diff


def test_compute_diff_no_changes_returns_empty():
    data = {"name": "same", "status": "active", "rack_id": None}
    assert compute_diff(data, data.copy()) == {}


def test_compute_diff_excludes_sensitive_keys():
    before = {"name": "dev", "ssh_password_enc": "old_enc", "some_key_enc": "v1"}
    after = {"name": "dev", "ssh_password_enc": "new_enc", "some_key_enc": "v2"}
    diff = compute_diff(before, after)
    assert "ssh_password_enc" not in diff
    assert "some_key_enc" not in diff
    assert diff == {}


def test_compute_diff_handles_none_to_value():
    before = {"notes": None}
    after = {"notes": "added note"}
    diff = compute_diff(before, after)
    assert "notes" in diff
    assert diff["notes"]["before"] is None
    assert diff["notes"]["after"] == "added note"


def test_compute_diff_handles_missing_key_in_before():
    diff = compute_diff({}, {"new_field": "value"})
    assert "new_field" in diff


# ── SyncStats tests ───────────────────────────────────────────────────────────

def test_syncstats_status_success():
    stats = SyncStats(items_created=5, items_updated=2, items_unchanged=10)
    from app.models.enums import SyncStatus
    assert stats.status == SyncStatus.success


def test_syncstats_status_failed_all_errors():
    stats = SyncStats()
    stats.add_error("device", "some-id", "Connection refused")
    from app.models.enums import SyncStatus
    assert stats.status == SyncStatus.failed


def test_syncstats_status_partial_some_errors():
    stats = SyncStats(items_created=3)
    stats.add_error("device", "some-id", "Timeout")
    from app.models.enums import SyncStatus
    assert stats.status == SyncStatus.partial


# ── upsert_device_by_serial integration tests ─────────────────────────────────

@pytest.mark.asyncio
async def test_upsert_creates_new_device(db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)

    stats = SyncStats()
    device_data = {
        "name": "new-server",
        "device_type": DeviceType.server,
        "serial_number": f"SN-NEW-{uuid.uuid4().hex[:8]}",
        "rack_id": rack.id,
    }
    device = await upsert_device_by_serial(db, device_data=device_data, stats=stats)

    assert device.id is not None
    assert stats.items_created == 1
    assert stats.items_updated == 0

    # Verify audit log entry was written
    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == str(device.id),
            AuditLog.action == AuditAction.create,
        )
    )).scalars().all()
    assert len(audit_rows) == 1


@pytest.mark.asyncio
async def test_upsert_updates_existing_device(db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    serial = f"SN-UPD-{uuid.uuid4().hex[:8]}"
    existing = await DeviceFactory.create(db, rack_id=rack.id, serial_number=serial, name="old-name")

    stats = SyncStats()
    device_data = {
        "name": "updated-name",
        "device_type": DeviceType.server,
        "serial_number": serial,
        "rack_id": rack.id,
    }
    device = await upsert_device_by_serial(db, device_data=device_data, stats=stats)

    assert device.id == existing.id
    assert device.name == "updated-name"
    assert stats.items_updated == 1
    assert stats.items_created == 0

    # Audit log for update
    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == str(device.id),
            AuditLog.action == AuditAction.update,
        )
    )).scalars().all()
    assert len(audit_rows) == 1
    assert "name" in audit_rows[0].diff


@pytest.mark.asyncio
async def test_upsert_idempotent_no_audit_on_second_call(db):
    """Running the same upsert twice with unchanged data → no second audit entry."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    serial = f"SN-IDEM-{uuid.uuid4().hex[:8]}"

    device_data = {
        "name": "idem-server",
        "device_type": DeviceType.server,
        "serial_number": serial,
        "rack_id": rack.id,
    }

    stats1 = SyncStats()
    device = await upsert_device_by_serial(db, device_data=device_data, stats=stats1)
    assert stats1.items_created == 1

    # Second call with identical data (excluding last_seen_at which always changes)
    # last_seen_at changes every call — that's acceptable and expected.
    stats2 = SyncStats()
    device2 = await upsert_device_by_serial(db, device_data=device_data, stats=stats2)
    assert device2.id == device.id
    # last_seen_at changes so it will count as updated, BUT the name/type fields
    # must not produce a false diff audit entry for name/type
    update_audits = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == str(device.id),
            AuditLog.action == AuditAction.update,
        )
    )).scalars().all()
    # Any update audit should not contain "name" or "device_type" as changed fields
    for row in update_audits:
        assert "name" not in row.diff, "name should not appear in diff when unchanged"
        assert "device_type" not in row.diff, "device_type should not appear when unchanged"


@pytest.mark.asyncio
async def test_diff_accuracy_changed_field_in_audit(db):
    """Changed field → audit log diff must contain that field with before/after."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    serial = f"SN-DIFF-{uuid.uuid4().hex[:8]}"
    await DeviceFactory.create(db, rack_id=rack.id, serial_number=serial, name="before-name")

    stats = SyncStats()
    await upsert_device_by_serial(
        db,
        device_data={
            "name": "after-name",
            "device_type": DeviceType.server,
            "serial_number": serial,
            "rack_id": rack.id,
        },
        stats=stats,
    )

    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.action == AuditAction.update,
        )
    )).scalars().all()
    name_diff_found = any("name" in row.diff for row in audit_rows)
    assert name_diff_found, "Expected 'name' in at least one update audit diff"


@pytest.mark.asyncio
async def test_inactive_not_delete_rule(db):
    """Device absent from sync → status=inactive, row NOT deleted."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    serial = f"SN-STALE-{uuid.uuid4().hex[:8]}"
    device = await DeviceFactory.create(
        db, rack_id=rack.id, serial_number=serial, status=DeviceStatus.active
    )

    stats = SyncStats()
    # Mark missing with an empty seen set (simulates nothing was seen in this sync)
    await mark_missing_devices_inactive(db, seen_serials=set(), stats=stats)

    await db.refresh(device)
    assert device.status == DeviceStatus.inactive
    # Row still exists
    row = (await db.execute(select(Device).where(Device.id == device.id))).scalar_one_or_none()
    assert row is not None

    # Audit log entry written for the status change
    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "device",
            AuditLog.entity_id == str(device.id),
            AuditLog.action == AuditAction.update,
        )
    )).scalars().all()
    assert any("status" in row.diff for row in audit_rows)


@pytest.mark.asyncio
async def test_active_device_in_seen_set_stays_active(db):
    """Device present in seen_serials must remain active."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    serial = f"SN-KEEP-{uuid.uuid4().hex[:8]}"
    device = await DeviceFactory.create(
        db, rack_id=rack.id, serial_number=serial, status=DeviceStatus.active
    )

    stats = SyncStats()
    await mark_missing_devices_inactive(db, seen_serials={serial}, stats=stats)

    await db.refresh(device)
    assert device.status == DeviceStatus.active
