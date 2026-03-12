import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import IPAssignmentType, IPStatus
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.ip_network import IPNetwork
    from app.models.device import Device
    from app.models.network_interface import NetworkInterface
    from app.models.virtual_machine import VirtualMachine


class IPAddress(UUIDPrimaryKey, Base):
    __tablename__ = "ip_addresses"
    __table_args__ = (
        UniqueConstraint("address", name="uq_ip_addresses_address"),
    )

    # Stored as PostgreSQL INET — supports both IPv4 and IPv6
    address: Mapped[str] = mapped_column(INET, nullable=False, index=True)
    subnet_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ip_networks.id", ondelete="SET NULL"),
        index=True,
    )
    # At most one of these will be populated
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
    )
    interface_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("network_interfaces.id", ondelete="SET NULL"),
        index=True,
    )
    vm_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("virtual_machines.id", ondelete="SET NULL"),
        index=True,
    )
    fqdn: Mapped[Optional[str]] = mapped_column(String(255))
    assignment_type: Mapped[IPAssignmentType] = mapped_column(
        String(10), default=IPAssignmentType.static, nullable=False
    )
    status: Mapped[IPStatus] = mapped_column(
        String(15), default=IPStatus.in_use, nullable=False, index=True
    )
    # Updated by ARP/ping sweep scans
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    subnet: Mapped[Optional["IPNetwork"]] = relationship(back_populates="ip_addresses")
    device: Mapped[Optional["Device"]] = relationship(back_populates="ip_addresses")
    interface: Mapped[Optional["NetworkInterface"]] = relationship(
        back_populates="ip_addresses"
    )
    vm: Mapped[Optional["VirtualMachine"]] = relationship(back_populates="ip_addresses")
