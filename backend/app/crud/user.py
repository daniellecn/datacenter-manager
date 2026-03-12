import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.crud.base import CRUDBase
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    async def get_by_username(self, db: AsyncSession, username: str) -> Optional[User]:
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()

    async def create(self, db: AsyncSession, *, obj_in: UserCreate) -> User:
        data = obj_in.model_dump(exclude={"password"})
        data["hashed_password"] = hash_password(obj_in.password)
        return await self.create_from_dict(db, data=data)

    async def set_password(self, db: AsyncSession, *, db_obj: User, new_password: str) -> User:
        db_obj.hashed_password = hash_password(new_password)
        db_obj.must_change_password = False
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_user = CRUDUser(User)
