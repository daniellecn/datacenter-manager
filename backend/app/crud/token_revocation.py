from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token_revocation import TokenRevocation


class CRUDTokenRevocation:
    async def is_revoked(self, db: AsyncSession, jti: str) -> bool:
        result = await db.execute(
            select(func.count())
            .select_from(TokenRevocation)
            .where(TokenRevocation.jti == jti)
        )
        return (result.scalar_one() or 0) > 0

    async def revoke(self, db: AsyncSession, *, jti: str, expires_at: datetime) -> TokenRevocation:
        obj = TokenRevocation(jti=jti, expires_at=expires_at)
        db.add(obj)
        await db.commit()
        return obj

    async def purge_expired(self, db: AsyncSession) -> int:
        """Delete all rows whose expires_at has passed. Returns number deleted."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            delete(TokenRevocation).where(TokenRevocation.expires_at < now)
        )
        await db.commit()
        return result.rowcount  # type: ignore[return-value]


crud_token_revocation = CRUDTokenRevocation()
