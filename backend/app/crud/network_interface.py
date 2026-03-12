import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.network_interface import NetworkInterface
from app.schemas.network_interface import NetworkInterfaceCreate, NetworkInterfaceUpdate


class CRUDNetworkInterface(CRUDBase[NetworkInterface, NetworkInterfaceCreate, NetworkInterfaceUpdate]):
    async def get_by_device(
        self, db: AsyncSession, device_id: uuid.UUID, *, skip: int = 0, limit: int = 100
    ) -> tuple[list[NetworkInterface], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[NetworkInterface.device_id == device_id],
        )


crud_network_interface = CRUDNetworkInterface(NetworkInterface)
