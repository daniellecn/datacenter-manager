"""
DeviceType — user-maintainable device type catalogue.

Built-in types (is_builtin=True) are seeded by the initial migration and cannot be deleted.
Custom types can be created, renamed (label only — name/slug is immutable), and deleted
as long as no device references them.
"""
from typing import Optional

from sqlalchemy import Boolean, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import UUIDPrimaryKey, TimestampMixin


class DeviceTypeRecord(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "device_types"

    # Slug — stored in devices.device_type; immutable after creation
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    # Human-readable label shown in the UI
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    # Hex colour for topology nodes, e.g. "#3b82f6" — optional
    color: Mapped[Optional[str]] = mapped_column(String(20))
    # Maps to a known icon key in the frontend icon set (server, switch, router, …, generic)
    icon_key: Mapped[Optional[str]] = mapped_column(String(50))
    # True for the 13 types seeded by the migration — blocks deletion
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Controls display order; ties broken alphabetically by name
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
