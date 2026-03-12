from typing import TYPE_CHECKING, Optional

from sqlalchemy import SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.ip_network import IPNetwork


class VLAN(UUIDPrimaryKey, Base):
    __tablename__ = "vlans"
    __table_args__ = (
        UniqueConstraint("vlan_id", name="uq_vlans_vlan_id"),
    )

    # 802.1Q VLAN ID: 1–4094
    vlan_id: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    # Hex color for topology visualization, e.g. "#FF5733"
    color: Mapped[Optional[str]] = mapped_column(String(7))

    # Relationships
    ip_networks: Mapped[list["IPNetwork"]] = relationship(back_populates="vlan")
