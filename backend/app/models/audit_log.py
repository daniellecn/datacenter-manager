import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import AuditAction
from app.models.mixins import UUIDPrimaryKey


class AuditLog(UUIDPrimaryKey, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        # Composite index for per-entity history lookups
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_audit_logs_timestamp", "timestamp"),
    )

    # Null when action is triggered by an automated sync job
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    # Entity type name: "device", "rack", "vm", "link", etc.
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # UUID stored as string for flexibility across entity types
    entity_id: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[AuditAction] = mapped_column(String(10), nullable=False)
    # JSON diff: {"before": {...}, "after": {...}}
    # "before" is null for create; "after" is null for delete
    diff: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    # Null for automated sync actions
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
