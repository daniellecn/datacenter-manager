import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Numeric, Text, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.room import Room


class DataCenter(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "datacenters"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text)
    city: Mapped[Optional[str]] = mapped_column(String(100))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    total_power_kw: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    total_cooling_kw: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    # Power Usage Effectiveness — target < 1.5 for modern DCs
    pue: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    rooms: Mapped[list["Room"]] = relationship(
        back_populates="datacenter",
        cascade="all, delete-orphan",
    )
