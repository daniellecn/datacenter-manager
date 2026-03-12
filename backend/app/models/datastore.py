import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import DatastoreType
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.virt_cluster import VirtualizationCluster
    from app.models.san_fabric import SANFabric


class Datastore(UUIDPrimaryKey, Base):
    __tablename__ = "datastores"

    cluster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("virtualization_clusters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    datastore_type: Mapped[DatastoreType] = mapped_column(String(10), nullable=False)
    total_gb: Mapped[Optional[int]] = mapped_column(Integer)
    free_gb: Mapped[Optional[int]] = mapped_column(Integer)
    # For SAN-backed datastores
    san_fabric_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("san_fabrics.id", ondelete="SET NULL"),
        index=True,
    )
    # Native platform name for display: SR (XenServer), CSV (Hyper-V), Pool (Proxmox)
    platform_name: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    cluster: Mapped["VirtualizationCluster"] = relationship(back_populates="datastores")
    san_fabric: Mapped[Optional["SANFabric"]] = relationship(back_populates="datastores")
