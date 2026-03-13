import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.room import Room
    from app.models.rack import Rack


class Corridor(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "corridors"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    room: Mapped["Room"] = relationship(back_populates="corridors")
    racks: Mapped[list["Rack"]] = relationship(
        back_populates="corridor",
        cascade="all, delete-orphan",
    )
