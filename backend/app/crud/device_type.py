from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.device_type import DeviceTypeRecord
from app.schemas.device_type import DeviceTypeCreate, DeviceTypeUpdate


class CRUDDeviceType(CRUDBase[DeviceTypeRecord, DeviceTypeCreate, DeviceTypeUpdate]):
    async def get_by_name(self, db: AsyncSession, name: str) -> Optional[DeviceTypeRecord]:
        result = await db.execute(
            select(self.model).where(self.model.name == name)
        )
        return result.scalar_one_or_none()

    async def get_all_ordered(self, db: AsyncSession) -> list[DeviceTypeRecord]:
        result = await db.execute(
            select(self.model).order_by(self.model.sort_order, self.model.name)
        )
        return list(result.scalars().all())

    async def is_name_in_use(self, db: AsyncSession, name: str) -> bool:
        """Returns True if any device currently uses this device_type slug."""
        from app.models.device import Device  # noqa: PLC0415
        result = await db.execute(
            select(Device.id).where(Device.device_type == name).limit(1)
        )
        return result.scalar_one_or_none() is not None


crud_device_type = CRUDDeviceType(DeviceTypeRecord)
