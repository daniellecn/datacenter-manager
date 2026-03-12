import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt
from app.crud.base import CRUDBase
from app.models.integration import Integration, SyncLog
from app.schemas.integration import IntegrationCreate, IntegrationUpdate, SyncLogRead


class CRUDIntegration(CRUDBase[Integration, IntegrationCreate, IntegrationUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: IntegrationCreate) -> Integration:
        data = obj_in.model_dump(exclude={"credentials"})
        if obj_in.credentials:
            # Encrypt the entire credentials dict as a JSON string
            import json  # noqa: PLC0415
            data["credentials_enc"] = encrypt(json.dumps(obj_in.credentials))
        return await self.create_from_dict(db, data=data)

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: Integration,
        obj_in: IntegrationUpdate | dict,
    ) -> Integration:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        if "credentials" in update_data:
            import json  # noqa: PLC0415
            val = update_data.pop("credentials")
            update_data["credentials_enc"] = encrypt(json.dumps(val)) if val else None

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_sync_logs(
        self,
        db: AsyncSession,
        integration_id: uuid.UUID,
        *,
        limit: int = 20,
    ) -> list[SyncLog]:
        result = await db.execute(
            select(SyncLog)
            .where(SyncLog.integration_id == integration_id)
            .order_by(SyncLog.started_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_sync_log(
        self, db: AsyncSession, *, integration_id: uuid.UUID, data: dict[str, Any]
    ) -> SyncLog:
        obj = SyncLog(integration_id=integration_id, **data)
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj


crud_integration = CRUDIntegration(Integration)
