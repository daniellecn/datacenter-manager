import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt
from app.crud.base import CRUDBase
from app.models.device import Device, DeviceNetwork, DevicePDU, DeviceServer
from app.schemas.device import (
    DeviceCreate,
    DeviceNetworkCreate,
    DeviceNetworkUpdate,
    DevicePDUCreate,
    DevicePDUUpdate,
    DeviceServerUpdate,
    DeviceUpdate,
)


class CRUDDevice(CRUDBase[Device, DeviceCreate, DeviceUpdate]):
    async def get_with_detail(self, db: AsyncSession, id: uuid.UUID) -> Optional[Device]:
        """Load device with all extension tables eagerly."""
        result = await db.execute(
            select(Device)
            .options(
                selectinload(Device.server_detail),
                selectinload(Device.network_detail),
                selectinload(Device.pdu_detail),
            )
            .where(Device.id == id)
        )
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: DeviceCreate) -> Device:
        data = obj_in.model_dump(exclude={"ssh_password", "ssh_key", "snmp_community"})
        if obj_in.snmp_community:
            data["snmp_community_enc"] = encrypt(obj_in.snmp_community)
        if obj_in.ssh_password:
            data["ssh_password_enc"] = encrypt(obj_in.ssh_password)
        if obj_in.ssh_key:
            data["ssh_key_enc"] = encrypt(obj_in.ssh_key)
        return await self.create_from_dict(db, data=data)

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: Device,
        obj_in: DeviceUpdate | dict,
    ) -> Device:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        # Handle plaintext → encrypted fields
        if "snmp_community" in update_data:
            val = update_data.pop("snmp_community")
            update_data["snmp_community_enc"] = encrypt(val) if val else None
        if "ssh_password" in update_data:
            val = update_data.pop("ssh_password")
            update_data["ssh_password_enc"] = encrypt(val) if val else None
        if "ssh_key" in update_data:
            val = update_data.pop("ssh_key")
            update_data["ssh_key_enc"] = encrypt(val) if val else None

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def soft_delete(self, db: AsyncSession, *, id: uuid.UUID) -> Optional[Device]:
        """Set status=inactive instead of hard-deleting."""
        from app.models.enums import DeviceStatus  # noqa: PLC0415
        obj = await self.get(db, id)
        if obj is None:
            return None
        obj.status = DeviceStatus.inactive
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def get_by_serial(self, db: AsyncSession, serial_number: str) -> Optional[Device]:
        result = await db.execute(
            select(Device).where(Device.serial_number == serial_number)
        )
        return result.scalar_one_or_none()

    # ── Extension table helpers ───────────────────────────────────────────────

    async def upsert_server_detail(
        self, db: AsyncSession, *, device_id: uuid.UUID, obj_in: DeviceServerUpdate
    ) -> DeviceServer:
        result = await db.execute(
            select(DeviceServer).where(DeviceServer.device_id == device_id)
        )
        db_obj = result.scalar_one_or_none()
        data = obj_in.model_dump()
        if db_obj is None:
            db_obj = DeviceServer(device_id=device_id, **data)
            db.add(db_obj)
        else:
            for field, value in data.items():
                setattr(db_obj, field, value)
            db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def upsert_network_detail(
        self, db: AsyncSession, *, device_id: uuid.UUID, obj_in: DeviceNetworkCreate
    ) -> DeviceNetwork:
        result = await db.execute(
            select(DeviceNetwork).where(DeviceNetwork.device_id == device_id)
        )
        db_obj = result.scalar_one_or_none()
        data = obj_in.model_dump()
        if db_obj is None:
            db_obj = DeviceNetwork(device_id=device_id, **data)
            db.add(db_obj)
        else:
            for field, value in data.items():
                setattr(db_obj, field, value)
            db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def upsert_pdu_detail(
        self, db: AsyncSession, *, device_id: uuid.UUID, obj_in: DevicePDUCreate
    ) -> DevicePDU:
        result = await db.execute(
            select(DevicePDU).where(DevicePDU.device_id == device_id)
        )
        db_obj = result.scalar_one_or_none()
        data = obj_in.model_dump()
        if db_obj is None:
            db_obj = DevicePDU(device_id=device_id, **data)
            db.add(db_obj)
        else:
            for field, value in data.items():
                setattr(db_obj, field, value)
            db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_device = CRUDDevice(Device)
