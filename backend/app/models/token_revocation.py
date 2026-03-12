"""
Denylist for revoked JWT refresh tokens.
On logout (or password change), the token's JTI is inserted here.
Auth middleware checks this table before accepting a refresh token.
Rows can be pruned once expires_at has passed.
"""
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TokenRevocation(Base):
    __tablename__ = "token_revocations"

    # JTI (JWT ID claim) — primary key, already a UUID string
    jti: Mapped[str] = mapped_column(String(36), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
