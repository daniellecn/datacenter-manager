import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AirflowDirection, RackStatus
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.room import Room
    from app.models.device import Device


class Rack(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "racks"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Floor grid position — e.g. row="A", column="03"
    row: Mapped[Optional[str]] = mapped_column(String(20))
    column: Mapped[Optional[str]] = mapped_column(String(20))
    total_u: Mapped[int] = mapped_column(SmallInteger, default=42, nullable=False)
    max_power_w: Mapped[Optional[int]] = mapped_column(Integer)
    max_weight_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))
    airflow_direction: Mapped[Optional[AirflowDirection]] = mapped_column(String(20))
    # Number of power feeds: 1 = single, 2 = dual
    power_feed_count: Mapped[int] = mapped_column(SmallInteger, default=2, nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255))
    model: Mapped[Optional[str]] = mapped_column(String(255))
    serial_number: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[RackStatus] = mapped_column(
        String(20), default=RackStatus.active, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    room: Mapped["Room"] = relationship(back_populates="racks")
    devices: Mapped[list["Device"]] = relationship(back_populates="rack")
