import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.base import CRUDBase
from app.models.ip_address import IPAddress
from app.models.enums import IPStatus
from app.schemas.ip_address import IPAddressCreate, IPAddressUpdate


class CRUDIPAddress(CRUDBase[IPAddress, IPAddressCreate, IPAddressUpdate]):
    async def get_by_address(self, db: AsyncSession, address: str) -> Optional[IPAddress]:
        result = await db.execute(select(IPAddress).where(IPAddress.address == address))
        return result.scalar_one_or_none()

    async def get_by_subnet(
        self,
        db: AsyncSession,
        subnet_id: uuid.UUID,
        *,
        skip: int = 0,
        limit: int = 500,
    ) -> tuple[list[IPAddress], int]:
        return await self.get_multi(
            db,
            skip=skip,
            limit=limit,
            where_clauses=[IPAddress.subnet_id == subnet_id],
            order_by=text("address::inet"),
        )

    async def get_assigned_in_subnet(
        self, db: AsyncSession, subnet_id: uuid.UUID
    ) -> list[str]:
        """Return all address strings assigned to a subnet (any status)."""
        result = await db.execute(
            select(IPAddress.address).where(IPAddress.subnet_id == subnet_id)
        )
        return [row[0] for row in result.all()]

    async def upsert_seen(
        self, db: AsyncSession, *, address: str, subnet_id: Optional[uuid.UUID] = None
    ) -> IPAddress:
        """Create or update last_seen_at for an IP discovered by a ping sweep."""
        existing = await self.get_by_address(db, address)
        now = datetime.now(timezone.utc)
        if existing:
            existing.last_seen_at = now
            if existing.status == IPStatus.available:
                existing.status = IPStatus.in_use
            db.add(existing)
            await db.commit()
            await db.refresh(existing)
            return existing
        obj = IPAddress(
            address=address,
            subnet_id=subnet_id,
            status=IPStatus.in_use,
            last_seen_at=now,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj


crud_ip_address = CRUDIPAddress(IPAddress)
