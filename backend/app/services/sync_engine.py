"""
Sync Engine — shared upsert, diff, audit, and stats logic.

All integration services call these functions; they never touch the DB directly.
Guarantees:
  - Diff is written to audit_log on every field change
  - Devices are never hard-deleted — set status=inactive when missing from source
  - VMs are never hard-deleted — same rule
  - A SyncLog row is created/updated for every sync run
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.audit_log import crud_audit_log
from app.models.audit_log import AuditLog
from app.models.datastore import Datastore
from app.models.device import Device, DeviceNetwork, DeviceServer
from app.models.enums import (
    AuditAction,
    DeviceStatus,
    IntegrationStatus,
    SyncStatus,
    VMStatus,
)
from app.models.integration import Integration, SyncLog
from app.models.virtual_machine import VirtualMachine
from app.models.virt_cluster import VirtualizationCluster
from app.models.virt_host import VirtualizationHost

logger = logging.getLogger(__name__)

# Fields that must never appear in audit diffs
_SENSITIVE_SUFFIXES = ("_enc", "_password", "_key", "_secret")


# ─── Stats Tracking ───────────────────────────────────────────────────────────


@dataclass
class SyncStats:
    items_created: int = 0
    items_updated: int = 0
    items_unchanged: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)

    def add_error(self, entity_type: str, entity_id: str, message: str) -> None:
        self.errors.append(
            {"entity_type": entity_type, "entity_id": entity_id, "message": message}
        )

    @property
    def status(self) -> SyncStatus:
        if self.errors and (self.items_created + self.items_updated) == 0:
            return SyncStatus.failed
        if self.errors:
            return SyncStatus.partial
        return SyncStatus.success


# ─── Diff Utilities ───────────────────────────────────────────────────────────


def _safe_str(val: Any) -> str:
    """Normalize a value to a stable string for comparison."""
    if val is None:
        return ""
    return str(val)


def compute_diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """Return {field: {"before": v, "after": v}} for changed fields only."""
    diff: dict[str, Any] = {}
    all_keys = set(before) | set(after)
    for key in all_keys:
        if any(key.endswith(s) for s in _SENSITIVE_SUFFIXES):
            continue
        old_val = before.get(key)
        new_val = after.get(key)
        if _safe_str(old_val) != _safe_str(new_val):
            diff[key] = {"before": old_val, "after": new_val}
    return diff


def _json_safe(val: Any) -> Any:
    """Convert a value to a JSON-serializable type."""
    if val is None or isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)  # covers UUID, Enum, Decimal, etc.


def _row_to_dict(obj: Any) -> dict[str, Any]:
    """Convert ORM model row to dict, excluding sensitive columns.
    Values are coerced to JSON-safe types (datetime → ISO string, UUID → str).
    """
    result: dict[str, Any] = {}
    for col in obj.__class__.__table__.columns:
        if any(col.name.endswith(s) for s in _SENSITIVE_SUFFIXES):
            continue
        result[col.name] = _json_safe(getattr(obj, col.name, None))
    return result


def _safe_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Make all values in a dict JSON-serializable."""
    return {
        k: _json_safe(v)
        for k, v in d.items()
        if not any(k.endswith(s) for s in _SENSITIVE_SUFFIXES)
    }


# ─── Audit Helper ─────────────────────────────────────────────────────────────


async def _write_audit(
    db: AsyncSession,
    entity_type: str,
    entity_id: str,
    action: AuditAction,
    diff: Optional[dict[str, Any]] = None,
) -> None:
    obj = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        diff=diff or {},
        user_id=None,  # system-initiated sync
    )
    db.add(obj)
    # Flushed to DB when the caller commits


# ─── Device Upsert ────────────────────────────────────────────────────────────


async def upsert_device_by_serial(
    db: AsyncSession,
    *,
    device_data: dict[str, Any],
    server_data: Optional[dict[str, Any]] = None,
    stats: SyncStats,
) -> Device:
    """
    Upsert a Device (dedup by serial_number).
    Optionally upsert the DeviceServer extension row.
    Returns the Device ORM object.
    """
    serial = device_data.get("serial_number")
    existing: Optional[Device] = None

    if serial:
        result = await db.execute(
            select(Device).where(Device.serial_number == serial)
        )
        existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    device_data["last_seen_at"] = now

    if existing is None:
        # Create
        device_data.setdefault("status", DeviceStatus.active)
        device = Device(**device_data)
        db.add(device)
        await db.flush()
        await _write_audit(db, "device", str(device.id), AuditAction.create, _safe_dict(device_data))
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in device_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(db, "device", str(existing.id), AuditAction.update, diff)
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        device = existing

    if server_data:
        await _upsert_server_extension(db, device_id=device.id, server_data=server_data)

    await db.commit()
    await db.refresh(device)
    return device


async def upsert_device_by_xclarity_uuid(
    db: AsyncSession,
    *,
    xclarity_uuid: str,
    device_data: dict[str, Any],
    server_data: dict[str, Any],
    stats: SyncStats,
) -> Device:
    """
    Upsert a Device + DeviceServer (dedup by device_servers.xclarity_uuid).
    Falls back to serial_number dedup if no xclarity record exists yet.
    """
    now = datetime.now(timezone.utc)
    device_data["last_seen_at"] = now

    # Try to find by xclarity_uuid in device_servers
    result = await db.execute(
        select(Device)
        .join(DeviceServer, DeviceServer.device_id == Device.id)
        .where(DeviceServer.xclarity_uuid == xclarity_uuid)
    )
    existing = result.scalar_one_or_none()

    # Fallback: match by serial_number
    if existing is None and device_data.get("serial_number"):
        r2 = await db.execute(
            select(Device).where(Device.serial_number == device_data["serial_number"])
        )
        existing = r2.scalar_one_or_none()

    if existing is None:
        device_data.setdefault("status", DeviceStatus.active)
        device = Device(**device_data)
        db.add(device)
        await db.flush()
        await _write_audit(db, "device", str(device.id), AuditAction.create, _safe_dict(device_data))
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in device_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(db, "device", str(existing.id), AuditAction.update, diff)
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        device = existing

    # Always ensure xclarity_uuid is set on server extension
    server_data["xclarity_uuid"] = xclarity_uuid
    await _upsert_server_extension(db, device_id=device.id, server_data=server_data)

    await db.commit()
    await db.refresh(device)
    return device


async def _upsert_server_extension(
    db: AsyncSession, *, device_id: uuid.UUID, server_data: dict[str, Any]
) -> DeviceServer:
    result = await db.execute(
        select(DeviceServer).where(DeviceServer.device_id == device_id)
    )
    ext = result.scalar_one_or_none()
    if ext is None:
        ext = DeviceServer(device_id=device_id, **server_data)
        db.add(ext)
    else:
        for k, v in server_data.items():
            setattr(ext, k, v)
        db.add(ext)
    return ext


async def upsert_network_device(
    db: AsyncSession,
    *,
    device_data: dict[str, Any],
    network_data: Optional[dict[str, Any]] = None,
    dedup_field: str,
    dedup_value: str,
    stats: SyncStats,
) -> Device:
    """
    Upsert a network Device (dedup by management_ip or serial_number).
    Optionally upsert DeviceNetwork extension.
    """
    now = datetime.now(timezone.utc)
    device_data["last_seen_at"] = now

    col = getattr(Device, dedup_field)
    result = await db.execute(select(Device).where(col == dedup_value))
    existing = result.scalar_one_or_none()

    if existing is None:
        device_data.setdefault("status", DeviceStatus.active)
        device = Device(**device_data)
        db.add(device)
        await db.flush()
        await _write_audit(db, "device", str(device.id), AuditAction.create, _safe_dict(device_data))
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in device_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(db, "device", str(existing.id), AuditAction.update, diff)
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        device = existing

    if network_data:
        result2 = await db.execute(
            select(DeviceNetwork).where(DeviceNetwork.device_id == device.id)
        )
        ext = result2.scalar_one_or_none()
        if ext is None:
            ext = DeviceNetwork(device_id=device.id, **network_data)
            db.add(ext)
        else:
            for k, v in network_data.items():
                setattr(ext, k, v)
            db.add(ext)

    await db.commit()
    await db.refresh(device)
    return device


async def mark_missing_devices_inactive(
    db: AsyncSession,
    *,
    seen_serials: set[str],
    stats: SyncStats,
) -> None:
    """
    Set status=inactive for devices with a serial_number not in seen_serials.
    Only applies to devices that already have a serial_number (so un-serialized
    devices are not inadvertently deactivated).
    """
    result = await db.execute(
        select(Device).where(
            Device.serial_number.isnot(None),
            Device.serial_number.notin_(seen_serials) if seen_serials else True,
            Device.status == DeviceStatus.active,
        )
    )
    stale = result.scalars().all()
    for dev in stale:
        dev.status = DeviceStatus.inactive
        db.add(dev)
        await _write_audit(
            db,
            "device",
            str(dev.id),
            AuditAction.update,
            {"status": {"before": "active", "after": "inactive"}},
        )
    if stale:
        await db.commit()


async def mark_missing_xclarity_devices_inactive(
    db: AsyncSession,
    *,
    seen_xclarity_uuids: set[str],
    stats: SyncStats,
) -> None:
    """
    Set status=inactive for DeviceServer rows whose xclarity_uuid is not in seen set.
    """
    result = await db.execute(
        select(Device)
        .join(DeviceServer, DeviceServer.device_id == Device.id)
        .where(
            DeviceServer.xclarity_uuid.isnot(None),
            DeviceServer.xclarity_uuid.notin_(seen_xclarity_uuids)
            if seen_xclarity_uuids
            else True,
            Device.status == DeviceStatus.active,
        )
    )
    stale = result.scalars().all()
    for dev in stale:
        dev.status = DeviceStatus.inactive
        db.add(dev)
        await _write_audit(
            db,
            "device",
            str(dev.id),
            AuditAction.update,
            {"status": {"before": "active", "after": "inactive"}},
        )
    if stale:
        await db.commit()


# ─── Virtual Cluster Upsert ───────────────────────────────────────────────────


async def upsert_virt_cluster(
    db: AsyncSession,
    *,
    cluster_data: dict[str, Any],
    stats: SyncStats,
) -> VirtualizationCluster:
    """Upsert a VirtualizationCluster (dedup by name + platform)."""
    result = await db.execute(
        select(VirtualizationCluster).where(
            VirtualizationCluster.name == cluster_data["name"],
            VirtualizationCluster.platform == cluster_data["platform"],
        )
    )
    existing = result.scalar_one_or_none()

    if existing is None:
        cluster = VirtualizationCluster(**cluster_data)
        db.add(cluster)
        await db.flush()
        await _write_audit(
            db, "virt_cluster", str(cluster.id), AuditAction.create, _safe_dict(cluster_data)
        )
        stats.items_created += 1
        await db.commit()
        await db.refresh(cluster)
        return cluster
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in cluster_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(
                db, "virt_cluster", str(existing.id), AuditAction.update, diff
            )
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        await db.commit()
        await db.refresh(existing)
        return existing


# ─── Virt Host Upsert ─────────────────────────────────────────────────────────


async def upsert_virt_host(
    db: AsyncSession,
    *,
    cluster_id: uuid.UUID,
    host_data: dict[str, Any],
    stats: SyncStats,
) -> VirtualizationHost:
    """Upsert a VirtualizationHost (dedup by platform_uuid)."""
    platform_uuid = host_data.get("platform_uuid")
    existing: Optional[VirtualizationHost] = None

    if platform_uuid:
        result = await db.execute(
            select(VirtualizationHost).where(
                VirtualizationHost.platform_uuid == platform_uuid
            )
        )
        existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    host_data["last_synced_at"] = now
    host_data["cluster_id"] = cluster_id

    if existing is None:
        host = VirtualizationHost(**host_data)
        db.add(host)
        await db.flush()
        await _write_audit(db, "virt_host", str(host.id), AuditAction.create, _safe_dict(host_data))
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in host_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(
                db, "virt_host", str(existing.id), AuditAction.update, diff
            )
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        host = existing

    await db.commit()
    await db.refresh(host)
    return host


# ─── VM Upsert ────────────────────────────────────────────────────────────────


async def upsert_vm(
    db: AsyncSession,
    *,
    host_id: uuid.UUID,
    vm_data: dict[str, Any],
    stats: SyncStats,
) -> VirtualMachine:
    """Upsert a VirtualMachine (dedup by platform_vm_id)."""
    platform_vm_id = vm_data.get("platform_vm_id")
    existing: Optional[VirtualMachine] = None

    if platform_vm_id:
        result = await db.execute(
            select(VirtualMachine).where(
                VirtualMachine.platform_vm_id == platform_vm_id
            )
        )
        existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    vm_data["last_seen_at"] = now
    vm_data["last_synced_at"] = now
    vm_data["host_id"] = host_id

    if existing is None:
        vm_data.setdefault("status", VMStatus.stopped)
        vm = VirtualMachine(**vm_data)
        db.add(vm)
        await db.flush()
        await _write_audit(db, "virtual_machine", str(vm.id), AuditAction.create, _safe_dict(vm_data))
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in vm_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(
                db, "virtual_machine", str(existing.id), AuditAction.update, diff
            )
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        vm = existing

    await db.commit()
    await db.refresh(vm)
    return vm


async def mark_missing_vms_inactive(
    db: AsyncSession,
    *,
    host_id: uuid.UUID,
    seen_platform_ids: set[str],
    stats: SyncStats,
) -> None:
    """
    VMs previously on this host but absent from current sync → set status=stopped
    (there is no 'inactive' state for VMs; 'stopped' is the tombstone marker here,
    but we still write an audit entry and never hard-delete).
    """
    result = await db.execute(
        select(VirtualMachine).where(
            VirtualMachine.host_id == host_id,
            VirtualMachine.platform_vm_id.isnot(None),
            VirtualMachine.platform_vm_id.notin_(seen_platform_ids)
            if seen_platform_ids
            else True,
            VirtualMachine.status != VMStatus.stopped,
        )
    )
    stale = result.scalars().all()
    for vm in stale:
        vm.status = VMStatus.stopped
        db.add(vm)
        await _write_audit(
            db,
            "virtual_machine",
            str(vm.id),
            AuditAction.update,
            {"status": {"before": vm.status, "after": "stopped"}},
        )
    if stale:
        await db.commit()


# ─── Datastore Upsert ─────────────────────────────────────────────────────────


async def upsert_datastore(
    db: AsyncSession,
    *,
    cluster_id: uuid.UUID,
    datastore_data: dict[str, Any],
    stats: SyncStats,
) -> Datastore:
    """Upsert a Datastore (dedup by cluster_id + name)."""
    result = await db.execute(
        select(Datastore).where(
            Datastore.cluster_id == cluster_id,
            Datastore.name == datastore_data["name"],
        )
    )
    existing = result.scalar_one_or_none()
    datastore_data["cluster_id"] = cluster_id

    if existing is None:
        ds = Datastore(**datastore_data)
        db.add(ds)
        await db.flush()
        await _write_audit(
            db, "datastore", str(ds.id), AuditAction.create, _safe_dict(datastore_data)
        )
        stats.items_created += 1
    else:
        before = _row_to_dict(existing)
        changed = False
        for k, v in datastore_data.items():
            if getattr(existing, k, None) != v:
                setattr(existing, k, v)
                changed = True
        if changed:
            after = _row_to_dict(existing)
            diff = compute_diff(before, after)
            await _write_audit(
                db, "datastore", str(existing.id), AuditAction.update, diff
            )
            stats.items_updated += 1
        else:
            stats.items_unchanged += 1
        existing = existing

    await db.commit()
    ds_obj = existing if existing else ds  # type: ignore[possibly-undefined]
    await db.refresh(ds_obj)
    return ds_obj  # type: ignore[return-value]


# ─── Sync Log Management ──────────────────────────────────────────────────────


async def begin_sync_log(
    db: AsyncSession, *, integration_id: uuid.UUID
) -> tuple[SyncLog, datetime]:
    """Create a new SyncLog entry and return (log, started_at)."""
    started_at = datetime.now(timezone.utc)
    log = SyncLog(
        integration_id=integration_id,
        started_at=started_at,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log, started_at


async def finalize_sync_log(
    db: AsyncSession,
    *,
    log: SyncLog,
    stats: SyncStats,
) -> SyncLog:
    """Update SyncLog with completion stats."""
    log.completed_at = datetime.now(timezone.utc)
    log.status = stats.status
    log.items_created = stats.items_created
    log.items_updated = stats.items_updated
    log.items_unchanged = stats.items_unchanged
    log.errors = stats.errors if stats.errors else None
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


async def update_integration_status(
    db: AsyncSession,
    *,
    integration_id: uuid.UUID,
    stats: SyncStats,
) -> None:
    """Update Integration.status, last_polled_at, last_success_at, error_message."""
    now = datetime.now(timezone.utc)
    update_values: dict[str, Any] = {"last_polled_at": now}

    if stats.status == SyncStatus.success:
        update_values["status"] = IntegrationStatus.ok
        update_values["last_success_at"] = now
        update_values["error_message"] = None
    elif stats.status == SyncStatus.partial:
        update_values["status"] = IntegrationStatus.warning
        update_values["error_message"] = f"{len(stats.errors)} error(s) during sync"
    else:
        update_values["status"] = IntegrationStatus.error
        first_err = stats.errors[0]["message"] if stats.errors else "Unknown error"
        update_values["error_message"] = first_err

    await db.execute(
        update(Integration)
        .where(Integration.id == integration_id)
        .values(**update_values)
    )
    await db.commit()
