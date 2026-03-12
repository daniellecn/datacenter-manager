import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.enums import AlertSeverity, AlertType
from app.schemas.alert import AlertCreate


class CRUDAlert:
    async def get(self, db: AsyncSession, id: uuid.UUID) -> Optional[Alert]:
        result = await db.execute(select(Alert).where(Alert.id == id))
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
        severity: Optional[AlertSeverity] = None,
        alert_type: Optional[AlertType] = None,
        entity_type: Optional[str] = None,
        acknowledged: Optional[bool] = None,
    ) -> tuple[list[Alert], int]:
        q = select(Alert)
        if severity is not None:
            q = q.where(Alert.severity == severity)
        if alert_type is not None:
            q = q.where(Alert.alert_type == alert_type)
        if entity_type is not None:
            q = q.where(Alert.entity_type == entity_type)
        if acknowledged is True:
            q = q.where(Alert.acknowledged_at.is_not(None))
        elif acknowledged is False:
            q = q.where(Alert.acknowledged_at.is_(None))

        count_q = select(func.count()).select_from(q.subquery())
        total: int = (await db.execute(count_q)).scalar_one()
        items = list(
            (await db.execute(q.order_by(Alert.created_at.desc()).offset(skip).limit(limit)))
            .scalars()
            .all()
        )
        return items, total

    async def upsert(
        self,
        db: AsyncSession,
        *,
        entity_type: Optional[str],
        entity_id: Optional[uuid.UUID],
        alert_type: AlertType,
        severity: AlertSeverity,
        message: str,
    ) -> Alert:
        """Insert or update an alert for the (entity_type, entity_id, alert_type) triple."""
        q = select(Alert).where(
            Alert.entity_type == entity_type,
            Alert.entity_id == entity_id,
            Alert.alert_type == alert_type,
        )
        result = await db.execute(q)
        existing = result.scalar_one_or_none()

        if existing is not None:
            existing.severity = severity
            existing.message = message
            existing.acknowledged_at = None  # Re-open if re-triggered
            existing.acknowledged_by = None
            db.add(existing)
            await db.commit()
            await db.refresh(existing)
            return existing

        obj = Alert(
            entity_type=entity_type,
            entity_id=entity_id,
            alert_type=alert_type,
            severity=severity,
            message=message,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def acknowledge(
        self, db: AsyncSession, *, id: uuid.UUID, acknowledged_by: str
    ) -> Optional[Alert]:
        obj = await self.get(db, id)
        if obj is None:
            return None
        obj.acknowledged_at = datetime.now(timezone.utc)
        obj.acknowledged_by = acknowledged_by
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def count_by_severity(self, db: AsyncSession) -> dict[str, int]:
        """Returns {severity: count} for un-acknowledged alerts."""
        q = (
            select(Alert.severity, func.count().label("cnt"))
            .where(Alert.acknowledged_at.is_(None))
            .group_by(Alert.severity)
        )
        rows = (await db.execute(q)).all()
        return {row.severity: row.cnt for row in rows}


crud_alert = CRUDAlert()
