from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.vlan import VLAN
from app.schemas.vlan import VLANCreate, VLANUpdate


class CRUDVLAN(CRUDBase[VLAN, VLANCreate, VLANUpdate]):
    async def get_by_vlan_id(self, db: AsyncSession, vlan_id: int) -> Optional[VLAN]:
        result = await db.execute(select(VLAN).where(VLAN.vlan_id == vlan_id))
        return result.scalar_one_or_none()


crud_vlan = CRUDVLAN(VLAN)
