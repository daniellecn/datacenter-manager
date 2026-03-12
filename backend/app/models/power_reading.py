"""
Time-series power readings polled from devices.
Composite index on (device_id, recorded_at) for efficient range queries.
Retention is controlled by POWER_READINGS_RETENTION_DAYS env var.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.device import Device


class PowerReading(Base):
    __tablename__ = "power_readings"
    __table_args__ = (
        Index("ix_power_readings_device_recorded", "device_id", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    watts: Mapped[int] = mapped_column(Integer, nullable=False)

    device: Mapped["Device"] = relationship()
