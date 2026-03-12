import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.rack import Rack
from app.schemas.rack import RackCreate, RackUpdate


class CRUDRack(CRUDBase[Rack, RackCreate, RackUpdate]):
    async def get_by_room(
        self, db: AsyncSession, room_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[Rack], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Rack.room_id == room_id],
        )


crud_rack = CRUDRack(Rack)
