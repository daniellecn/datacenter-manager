"""
Generic async CRUD base class.

Usage:
    class CRUDDevice(CRUDBase[Device, DeviceCreate, DeviceUpdate]):
        pass
    crud_device = CRUDDevice(Device)

All database writes go through commit + refresh so callers always receive
a fully populated ORM object. No business logic lives here — only DB I/O.
"""
import uuid
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)
CreateSchemaType = TypeVar("CreateSchemaType", bound=BaseModel)
UpdateSchemaType = TypeVar("UpdateSchemaType", bound=BaseModel)


class CRUDBase(Generic[ModelType, CreateSchemaType, UpdateSchemaType]):
    def __init__(self, model: type[ModelType]) -> None:
        self.model = model

    async def get(self, db: AsyncSession, id: uuid.UUID) -> ModelType | None:
        result = await db.execute(select(self.model).where(self.model.id == id))  # type: ignore[attr-defined]
        return result.scalar_one_or_none()

    async def get_multi(
        self,
        db: AsyncSession,
        *,
        skip: int = 0,
        limit: int = 50,
        where_clauses: list[Any] | None = None,
        order_by: Any = None,
    ) -> tuple[list[ModelType], int]:
        base_q = select(self.model)
        if where_clauses:
            for clause in where_clauses:
                base_q = base_q.where(clause)

        count_q = select(func.count()).select_from(base_q.subquery())
        total: int = (await db.execute(count_q)).scalar_one()

        if order_by is not None:
            base_q = base_q.order_by(order_by)
        base_q = base_q.offset(skip).limit(limit)
        items = list((await db.execute(base_q)).scalars().all())

        return items, total

    async def create(self, db: AsyncSession, *, obj_in: CreateSchemaType) -> ModelType:
        data = obj_in.model_dump()
        db_obj = self.model(**data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def create_from_dict(self, db: AsyncSession, *, data: dict[str, Any]) -> ModelType:
        """Create from a plain dict (used when pre-processing is needed, e.g. encryption)."""
        db_obj = self.model(**data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: ModelType,
        obj_in: UpdateSchemaType | dict[str, Any],
    ) -> ModelType:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def delete(self, db: AsyncSession, *, id: uuid.UUID) -> bool:
        obj = await self.get(db, id)
        if obj is None:
            return False
        await db.delete(obj)
        await db.commit()
        return True

    async def exists(self, db: AsyncSession, id: uuid.UUID) -> bool:
        result = await db.execute(
            select(func.count()).select_from(self.model).where(self.model.id == id)  # type: ignore[attr-defined]
        )
        return (result.scalar_one() or 0) > 0
