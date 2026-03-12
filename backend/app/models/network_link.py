"""
LAGGroup  — Link Aggregation Group (bond0, Port-channel, ae0).
NetworkLink — Physical/logical cable between two NetworkInterface records.
"""
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import LAGMode, LinkStatus, LinkType
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.network_interface import NetworkInterface


class LAGGroup(UUIDPrimaryKey, Base):
    __tablename__ = "lag_groups"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Platform-native name: bond0, Port-channel1, ae0
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    mode: Mapped[LAGMode] = mapped_column(String(20), nullable=False)
    combined_speed_mbps: Mapped[Optional[int]] = mapped_column(Integer)

    # Relationships
    device: Mapped["Device"] = relationship(back_populates="lag_groups")
    links: Mapped[list["NetworkLink"]] = relationship(back_populates="lag_group")


class NetworkLink(UUIDPrimaryKey, Base):
    __tablename__ = "network_links"

    source_interface_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("network_interfaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_interface_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("network_interfaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    link_type: Mapped[LinkType] = mapped_column(String(20), nullable=False)
    # Negotiated or configured speed (may differ from interface speed)
    speed_mbps: Mapped[Optional[int]] = mapped_column(Integer)
    cable_label: Mapped[Optional[str]] = mapped_column(String(100))
    cable_color: Mapped[Optional[str]] = mapped_column(String(30))
    # If this link is a member of a LAG
    lag_group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lag_groups.id", ondelete="SET NULL"),
        index=True,
    )
    # Intermediate patch panel port labels (optional traceability)
    patch_panel_port_a: Mapped[Optional[str]] = mapped_column(String(50))
    patch_panel_port_b: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[LinkStatus] = mapped_column(
        String(10), default=LinkStatus.active, nullable=False
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    source_interface: Mapped["NetworkInterface"] = relationship(
        back_populates="source_links",
        foreign_keys=[source_interface_id],
    )
    target_interface: Mapped["NetworkInterface"] = relationship(
        back_populates="target_links",
        foreign_keys=[target_interface_id],
    )
    lag_group: Mapped[Optional["LAGGroup"]] = relationship(back_populates="links")
