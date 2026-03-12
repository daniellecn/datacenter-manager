from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.ip_network import IPNetwork
from app.schemas.ip_network import IPNetworkCreate, IPNetworkUpdate


class CRUDIPNetwork(CRUDBase[IPNetwork, IPNetworkCreate, IPNetworkUpdate]):
    async def get_by_cidr(self, db: AsyncSession, cidr: str) -> Optional[IPNetwork]:
        result = await db.execute(
            select(IPNetwork).where(IPNetwork.cidr == cidr)
        )
        return result.scalar_one_or_none()


crud_ip_network = CRUDIPNetwork(IPNetwork)
