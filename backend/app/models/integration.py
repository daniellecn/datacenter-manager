"""
Integration    — connection config for each external data source.
SyncLog        — immutable record of each sync run per integration.
"""
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import IntegrationStatus, IntegrationType, SyncStatus
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    pass


class Integration(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "integrations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    integration_type: Mapped[IntegrationType] = mapped_column(
        String(20), nullable=False, index=True
    )
    host: Mapped[Optional[str]] = mapped_column(String(500))
    port: Mapped[Optional[int]] = mapped_column(Integer)
    # Encrypted credential bundle — structure varies by type:
    #   xclarity/vcenter/scvmm: {username, password}
    #   snmp:                   {community, auth_key, priv_key}
    #   ssh:                    {username, password, private_key}
    #   proxmox:                {username, token_id, token_secret}
    #   xenserver:              {username, password}
    credentials_enc: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    # Platform-specific non-secret config:
    #   xclarity:   {}
    #   snmp:       {version, community_enc, auth_protocol, priv_protocol}
    #   ssh:        {default_device_os}
    #   vcenter:    {vcenter_datacenter_name, verify_ssl, sync_templates}
    #   scvmm:      {use_winrm, host_group, scvmm_cloud}
    #   proxmox:    {node_names, realm, verify_ssl}
    #   xenserver:  {pool_uuid, verify_ssl}
    extra_config: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    polling_interval_sec: Mapped[int] = mapped_column(
        Integer, default=3600, nullable=False
    )
    last_polled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[IntegrationStatus] = mapped_column(
        String(10), default=IntegrationStatus.disabled, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    sync_logs: Mapped[list["SyncLog"]] = relationship(
        back_populates="integration", cascade="all, delete-orphan"
    )


class SyncLog(UUIDPrimaryKey, Base):
    __tablename__ = "sync_logs"

    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("integrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[Optional[SyncStatus]] = mapped_column(String(10))
    items_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_unchanged: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Array of error objects: [{entity_type, entity_id, message}]
    errors: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)

    # Relationships
    integration: Mapped["Integration"] = relationship(back_populates="sync_logs")
