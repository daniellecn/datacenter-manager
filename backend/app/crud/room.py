import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomUpdate


class CRUDRoom(CRUDBase[Room, RoomCreate, RoomUpdate]):
    async def get_by_datacenter(
        self, db: AsyncSession, datacenter_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[Room], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[Room.datacenter_id == datacenter_id],
        )


crud_room = CRUDRoom(Room)
