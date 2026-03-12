from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import VirtPlatform
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.virt_host import VirtualizationHost
    from app.models.datastore import Datastore


class VirtualizationCluster(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "virtualization_clusters"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[VirtPlatform] = mapped_column(String(30), nullable=False, index=True)
    # URL: vCenter FQDN, SCVMM URL, Proxmox node URL, XenServer host
    management_url: Mapped[Optional[str]] = mapped_column(String(500))
    management_username: Mapped[Optional[str]] = mapped_column(String(100))
    # Password encrypted via Fernet — never returned in API responses
    management_password_enc: Mapped[Optional[str]] = mapped_column(String(500))
    # Platform-specific config:
    #   vCenter:    {vcenter_datacenter_name, verify_ssl, sync_templates}
    #   SCVMM:      {scvmm_cloud, host_group, use_winrm}
    #   Proxmox:    {node_names, realm, verify_ssl}
    #   XenServer:  {pool_uuid, verify_ssl}
    platform_config: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    ha_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    drs_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Aggregate capacity (updated on sync)
    total_vcpu: Mapped[Optional[int]] = mapped_column(Integer)
    total_ram_gb: Mapped[Optional[int]] = mapped_column(Integer)
    total_storage_tb: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    hosts: Mapped[list["VirtualizationHost"]] = relationship(
        back_populates="cluster", cascade="all, delete-orphan"
    )
    datastores: Mapped[list["Datastore"]] = relationship(
        back_populates="cluster", cascade="all, delete-orphan"
    )
