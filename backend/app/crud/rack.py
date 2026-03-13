import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.corridor import Corridor
from app.models.rack import Rack
from app.schemas.rack import RackCreate, RackUpdate


class CRUDRack(CRUDBase[Rack, RackCreate, RackUpdate]):
    async def get_by_corridor(
        self, db: AsyncSession, corridor_id: uuid.UUID, *, skip: int = 0, limit: int = 200
    ) -> tuple[list[Rack], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Rack.corridor_id == corridor_id],
        )

    async def get_by_room(
        self, db: AsyncSession, room_id: uuid.UUID, *, skip: int = 0, limit: int = 200
    ) -> tuple[list[Rack], int]:
        """Return all racks in a room by joining through corridors."""
        corridor_subq = select(Corridor.id).where(Corridor.room_id == room_id)
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Rack.corridor_id.in_(corridor_subq)],
        )


crud_rack = CRUDRack(Rack)
