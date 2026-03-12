import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.network_link import LAGGroup, NetworkLink
from app.schemas.network_link import (
    LAGGroupCreate,
    LAGGroupUpdate,
    NetworkLinkCreate,
    NetworkLinkUpdate,
)


class CRUDNetworkLink(CRUDBase[NetworkLink, NetworkLinkCreate, NetworkLinkUpdate]):
    async def get_by_interface(
        self, db: AsyncSession, interface_id: uuid.UUID
    ) -> list[NetworkLink]:
        result = await db.execute(
            select(NetworkLink).where(
                or_(
                    NetworkLink.source_interface_id == interface_id,
                    NetworkLink.target_interface_id == interface_id,
                )
            )
        )
        return list(result.scalars().all())


class CRUDLAGGroup(CRUDBase[LAGGroup, LAGGroupCreate, LAGGroupUpdate]):
    async def get_by_device(
        self, db: AsyncSession, device_id: uuid.UUID
    ) -> list[LAGGroup]:
        result = await db.execute(
            select(LAGGroup).where(LAGGroup.device_id == device_id)
        )
        return list(result.scalars().all())


crud_network_link = CRUDNetworkLink(NetworkLink)
crud_lag_group = CRUDLAGGroup(LAGGroup)
