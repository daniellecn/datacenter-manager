import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.virt_host import VirtualizationHost
from app.schemas.virt_host import VirtHostCreate, VirtHostUpdate


class CRUDVirtHost(CRUDBase[VirtualizationHost, VirtHostCreate, VirtHostUpdate]):
    async def get_by_cluster(
        self, db: AsyncSession, cluster_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[VirtualizationHost], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[VirtualizationHost.cluster_id == cluster_id],
        )

    async def get_by_platform_uuid(
        self, db: AsyncSession, platform_uuid: str
    ) -> Optional[VirtualizationHost]:
        result = await db.execute(
            select(VirtualizationHost).where(VirtualizationHost.platform_uuid == platform_uuid)
        )
        return result.scalar_one_or_none()


crud_virt_host = CRUDVirtHost(VirtualizationHost)
