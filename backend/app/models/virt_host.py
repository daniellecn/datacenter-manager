import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.device import Device
    from app.models.virt_cluster import VirtualizationCluster
    from app.models.virtual_machine import VirtualMachine


class VirtualizationHost(UUIDPrimaryKey, Base):
    __tablename__ = "virtualization_hosts"

    # Links to the physical server — nullable for hosts discovered via API
    # before the physical device record exists
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
    )
    cluster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("virtualization_clusters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Platform-native host version string, e.g. "ESXi 8.0 Update 3"
    platform_version: Mapped[Optional[str]] = mapped_column(String(100))
    # Stable platform-internal identifier (MOREF, GUID, UUID, node name)
    platform_uuid: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    # Platform-specific attributes:
    #   ESXi:       {esxi_build_number, vcenter_moref, vmotion_ip, storage_vmk_ip}
    #   Hyper-V:    {host_group, hyper_v_version}
    #   Proxmox:    {proxmox_node_name, pve_version}
    #   XenServer:  {xen_pool_uuid, xapi_version}
    platform_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    # Allocated totals (updated on sync)
    vcpu_allocated: Mapped[Optional[int]] = mapped_column(Integer)
    ram_allocated_gb: Mapped[Optional[int]] = mapped_column(Integer)
    is_in_maintenance: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    device: Mapped[Optional["Device"]] = relationship(back_populates="virt_hosts")
    cluster: Mapped["VirtualizationCluster"] = relationship(back_populates="hosts")
    vms: Mapped[list["VirtualMachine"]] = relationship(
        back_populates="host", cascade="all, delete-orphan"
    )
