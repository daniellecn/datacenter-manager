import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import MACADDR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import Duplex, InterfaceStatus, MediaType
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.network_link import NetworkLink
    from app.models.ip_address import IPAddress


class NetworkInterface(UUIDPrimaryKey, Base):
    __tablename__ = "network_interfaces"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Platform-native interface name: eth0, GigabitEthernet0/1, fc0
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    media_type: Mapped[MediaType] = mapped_column(String(20), nullable=False)
    speed_mbps: Mapped[Optional[int]] = mapped_column(Integer)
    mac_address: Mapped[Optional[str]] = mapped_column(MACADDR)
    # World Wide Name for Fibre Channel interfaces
    wwn: Mapped[Optional[str]] = mapped_column(String(50))
    is_management: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_uplink: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duplex: Mapped[Optional[Duplex]] = mapped_column(String(10))
    mtu: Mapped[Optional[int]] = mapped_column(SmallInteger)
    status: Mapped[InterfaceStatus] = mapped_column(
        String(15), default=InterfaceStatus.unknown, nullable=False
    )
    last_polled_status: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    device: Mapped["Device"] = relationship(back_populates="interfaces")
    source_links: Mapped[list["NetworkLink"]] = relationship(
        back_populates="source_interface",
        foreign_keys="NetworkLink.source_interface_id",
    )
    target_links: Mapped[list["NetworkLink"]] = relationship(
        back_populates="target_interface",
        foreign_keys="NetworkLink.target_interface_id",
    )
    ip_addresses: Mapped[list["IPAddress"]] = relationship(back_populates="interface")
