import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.virtual_machine import VirtualMachine
from app.schemas.virtual_machine import VMCreate, VMUpdate


class CRUDVirtualMachine(CRUDBase[VirtualMachine, VMCreate, VMUpdate]):
    async def get_by_host(
        self, db: AsyncSession, host_id: uuid.UUID, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[VirtualMachine], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[VirtualMachine.host_id == host_id],
        )

    async def get_by_platform_vm_id(
        self, db: AsyncSession, platform_vm_id: str
    ) -> Optional[VirtualMachine]:
        result = await db.execute(
            select(VirtualMachine).where(VirtualMachine.platform_vm_id == platform_vm_id)
        )
        return result.scalar_one_or_none()


crud_virtual_machine = CRUDVirtualMachine(VirtualMachine)
