import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.corridor import Corridor
from app.schemas.corridor import CorridorCreate, CorridorUpdate


class CRUDCorridor(CRUDBase[Corridor, CorridorCreate, CorridorUpdate]):
    async def get_by_room(
        self, db: AsyncSession, room_id: uuid.UUID, *, skip: int = 0, limit: int = 200
    ) -> tuple[list[Corridor], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Corridor.room_id == room_id],
        )


crud_corridor = CRUDCorridor(Corridor)
