from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt
from app.crud.base import CRUDBase
from app.models.virt_cluster import VirtualizationCluster
from app.schemas.virt_cluster import VirtClusterCreate, VirtClusterUpdate


class CRUDVirtCluster(CRUDBase[VirtualizationCluster, VirtClusterCreate, VirtClusterUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: VirtClusterCreate) -> VirtualizationCluster:
        data = obj_in.model_dump(exclude={"management_password"})
        if obj_in.management_password:
            data["management_password_enc"] = encrypt(obj_in.management_password)
        return await self.create_from_dict(db, data=data)

    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: VirtualizationCluster,
        obj_in: VirtClusterUpdate | dict,
    ) -> VirtualizationCluster:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        if "management_password" in update_data:
            val = update_data.pop("management_password")
            update_data["management_password_enc"] = encrypt(val) if val else None

        for field, value in update_data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj


crud_virt_cluster = CRUDVirtCluster(VirtualizationCluster)
