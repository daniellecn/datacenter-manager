import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import CoolingType
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.datacenter import DataCenter
    from app.models.corridor import Corridor


class Room(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "rooms"

    datacenter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datacenters.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    floor: Mapped[Optional[int]] = mapped_column(SmallInteger)
    cooling_type: Mapped[Optional[CoolingType]] = mapped_column(String(20))
    raised_floor: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Physical dimensions in metres
    width_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    depth_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    height_m: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    max_power_kw: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    datacenter: Mapped["DataCenter"] = relationship(back_populates="rooms")
    corridors: Mapped[list["Corridor"]] = relationship(
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="Corridor.position.nulls_last(), Corridor.name",
    )
