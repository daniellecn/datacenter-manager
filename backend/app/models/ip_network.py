import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, CIDR, INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import NetworkPurpose
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.vlan import VLAN
    from app.models.ip_address import IPAddress


class IPNetwork(UUIDPrimaryKey, Base):
    __tablename__ = "ip_networks"

    # e.g. "10.10.1.0/24" — stored as PostgreSQL CIDR type
    cidr: Mapped[str] = mapped_column(CIDR, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gateway: Mapped[Optional[str]] = mapped_column(INET)
    vlan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vlans.id", ondelete="SET NULL"),
        index=True,
    )
    purpose: Mapped[Optional[NetworkPurpose]] = mapped_column(String(20))
    dhcp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dhcp_range_start: Mapped[Optional[str]] = mapped_column(INET)
    dhcp_range_end: Mapped[Optional[str]] = mapped_column(INET)
    # Array of DNS server IPs
    dns_servers: Mapped[Optional[list[str]]] = mapped_column(ARRAY(INET))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    vlan: Mapped[Optional["VLAN"]] = relationship(back_populates="ip_networks")
    ip_addresses: Mapped[list["IPAddress"]] = relationship(back_populates="subnet")
