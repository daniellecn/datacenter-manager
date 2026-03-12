import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt
from app.crud.base import CRUDBase
from app.models.license import License
from app.schemas.license import LicenseCreate, LicenseUpdate


class CRUDLicense(CRUDBase[License, LicenseCreate, LicenseUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: LicenseCreate) -> License:
        data = obj_in.model_dump(exclude={"license_key"})
        if obj_in.license_key:
            data["license_key_enc"] = encrypt(obj_in.license_key)
        return await self.create_from_dict(db, data=data)

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: License,
        obj_in: LicenseUpdate | dict,
    ) -> License:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        if "license_key" in update_data:
            val = update_data.pop("license_key")
            update_data["license_key_enc"] = encrypt(val) if val else None

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def get_by_device(
        self, db: AsyncSession, device_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[License], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[License.device_id == device_id],
        )


crud_license = CRUDLicense(License)
