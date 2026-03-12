"""
System-generated alerts for lifecycle, capacity, and sync events.
Alerts are acknowledged (not deleted) when addressed.
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import AlertSeverity, AlertType
from app.models.mixins import UUIDPrimaryKey, TimestampMixin


class Alert(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_entity", "entity_type", "entity_id"),
        Index("ix_alerts_acknowledged_at", "acknowledged_at"),
    )

    # Polymorphic reference — no FK constraint, entity may be device/license/integration
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

    alert_type: Mapped[AlertType] = mapped_column(String(30), nullable=False, index=True)
    severity: Mapped[AlertSeverity] = mapped_column(String(10), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(150))
