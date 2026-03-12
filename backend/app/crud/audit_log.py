import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction


class CRUDAuditLog:
    async def create(
        self,
        db: AsyncSession,
        *,
        entity_type: str,
        entity_id: str,
        action: AuditAction,
        user_id: Optional[uuid.UUID] = None,
        diff: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        obj = AuditLog(
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            diff=diff,
            ip_address=ip_address,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj

    async def get_by_entity(
        self,
        db: AsyncSession,
        entity_type: str,
        entity_id: str,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditLog], int]:
        from sqlalchemy import func  # noqa: PLC0415
        base_q = (
            select(AuditLog)
            .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
            .order_by(AuditLog.timestamp.desc())
        )
        count_q = select(func.count()).select_from(base_q.subquery())
        total: int = (await db.execute(count_q)).scalar_one()
        items = list((await db.execute(base_q.offset(skip).limit(limit))).scalars().all())
        return items, total

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[AuditLog], int]:
        from sqlalchemy import func  # noqa: PLC0415
        base_q = select(AuditLog).order_by(AuditLog.timestamp.desc())
        count_q = select(func.count()).select_from(base_q.subquery())
        total: int = (await db.execute(count_q)).scalar_one()
        items = list((await db.execute(base_q.offset(skip).limit(limit))).scalars().all())
        return items, total


crud_audit_log = CRUDAuditLog()
