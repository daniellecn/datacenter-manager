import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.power_reading import PowerReading
from app.schemas.power_reading import PowerReadingCreate


class CRUDPowerReading:
    async def create(self, db: AsyncSession, *, obj_in: PowerReadingCreate) -> PowerReading:
        obj = PowerReading(**obj_in.model_dump())
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def create_many(self, db: AsyncSession, *, items: list[PowerReadingCreate]) -> int:
        """Bulk insert. Returns number of rows inserted."""
        objs = [PowerReading(**item.model_dump()) for item in items]
        db.add_all(objs)
        await db.commit()
        return len(objs)

    async def get_by_device(
        self,
        db: AsyncSession,
        device_id: uuid.UUID,
        *,
        since: datetime,
        skip: int = 0,
        limit: int = 500,
    ) -> list[PowerReading]:
        result = await db.execute(
            select(PowerReading)
            .where(PowerReading.device_id == device_id, PowerReading.recorded_at >= since)
            .order_by(PowerReading.recorded_at.asc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def delete_before(self, db: AsyncSession, *, before: datetime) -> int:
        """Prune rows older than `before`. Used by the retention cleanup job."""
        result = await db.execute(
            delete(PowerReading).where(PowerReading.recorded_at < before)
        )
        await db.commit()
        return result.rowcount  # type: ignore[return-value]


crud_power_reading = CRUDPowerReading()
