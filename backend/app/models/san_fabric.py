from typing import TYPE_CHECKING, Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import SANFabricType
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.datastore import Datastore


class SANFabric(UUIDPrimaryKey, Base):
    __tablename__ = "san_fabrics"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    fabric_type: Mapped[SANFabricType] = mapped_column(String(20), nullable=False)
    speed_gbps: Mapped[Optional[int]] = mapped_column(Integer)
    # World Wide Name for Fibre Channel fabrics
    wwn: Mapped[Optional[str]] = mapped_column(String(50))

    # Relationships
    datastores: Mapped[list["Datastore"]] = relationship(back_populates="san_fabric")
