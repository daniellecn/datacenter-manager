import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import LicenseType
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.device import Device


class License(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "licenses"

    # Nullable — supports datacenter-level / enterprise licenses not tied to a device
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor: Mapped[Optional[str]] = mapped_column(String(255))
    # License key stored encrypted via Fernet — never returned in API responses
    license_key_enc: Mapped[Optional[str]] = mapped_column(Text)
    license_type: Mapped[LicenseType] = mapped_column(String(20), nullable=False)
    quantity: Mapped[Optional[int]] = mapped_column(Integer)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    # Null for perpetual licenses
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    cost_usd: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    # Alert threshold: days before expiry_date to raise an alert
    renewal_reminder_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    device: Mapped[Optional["Device"]] = relationship(back_populates="licenses")
