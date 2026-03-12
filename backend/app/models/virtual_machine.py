import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import OSType, VMStatus
from app.models.mixins import UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.virt_host import VirtualizationHost
    from app.models.ip_address import IPAddress


class VirtualMachine(UUIDPrimaryKey, Base):
    __tablename__ = "virtual_machines"

    host_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("virtualization_hosts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Platform-native identifier — dedup key for all sync services:
    #   VMware:     VirtualMachine MOREF
    #   Hyper-V:    VM GUID
    #   Proxmox:    "{node}/{vmid}"
    #   XenServer:  VM UUID
    platform_vm_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    status: Mapped[VMStatus] = mapped_column(
        String(15), default=VMStatus.stopped, nullable=False, index=True
    )
    os_type: Mapped[Optional[OSType]] = mapped_column(String(15))
    os_version: Mapped[Optional[str]] = mapped_column(String(100))
    vcpu_count: Mapped[Optional[int]] = mapped_column(Integer)
    ram_gb: Mapped[Optional[int]] = mapped_column(Integer)
    storage_gb: Mapped[Optional[int]] = mapped_column(Integer)
    # VMware Tools / Hyper-V IC / xe-guest-utilities version
    tools_version: Mapped[Optional[str]] = mapped_column(String(50))
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    snapshot_count: Mapped[Optional[int]] = mapped_column(SmallInteger)
    # Platform-specific attributes:
    #   VMware:     {moref, vmx_path, hardware_version, tools_status,
    #                folder_path, resource_pool, vapp_name, consolidation_needed}
    #   Hyper-V:    {generation, checkpoint_type, dynamic_memory_enabled, scvmm_cloud}
    #   Proxmox:    {vmid, vm_type (qemu|lxc), pool_name}
    #   XenServer:  {xe_uuid, dom_id, sr_name, vcpus_max, xe_tools_version}
    platform_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    host: Mapped["VirtualizationHost"] = relationship(back_populates="vms")
    ip_addresses: Mapped[list["IPAddress"]] = relationship(back_populates="vm")
