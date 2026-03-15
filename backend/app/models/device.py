"""
Device base model + extension tables (1:1).

device_servers  — server-specific attributes
device_network  — switch/router/firewall-specific attributes
device_pdu      — PDU-specific attributes

Extension tables use device_id as both PK and FK (ondelete CASCADE).
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, SmallInteger, String, Text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    DeviceFace, DeviceStatus,
    FormFactor, ManagementProtocol, SNMPVersion,
)
from app.models.mixins import UUIDPrimaryKey, TimestampMixin

if TYPE_CHECKING:
    from app.models.rack import Rack
    from app.models.license import License
    from app.models.network_interface import NetworkInterface
    from app.models.network_link import LAGGroup
    from app.models.virt_host import VirtualizationHost
    from app.models.ip_address import IPAddress


# ─── Base Device ──────────────────────────────────────────────────────────────

class Device(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "devices"

    rack_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("racks.id", ondelete="SET NULL"),
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255))
    model: Mapped[Optional[str]] = mapped_column(String(255))
    part_number: Mapped[Optional[str]] = mapped_column(String(255))
    serial_number: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    asset_tag: Mapped[Optional[str]] = mapped_column(String(100), index=True)

    # Rack position
    rack_unit_start: Mapped[Optional[int]] = mapped_column(SmallInteger)
    rack_unit_size: Mapped[Optional[int]] = mapped_column(SmallInteger)
    face: Mapped[Optional[DeviceFace]] = mapped_column(String(10))

    # Power
    power_rated_w: Mapped[Optional[int]] = mapped_column(Integer)
    power_actual_w: Mapped[Optional[int]] = mapped_column(Integer)
    weight_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2))

    status: Mapped[DeviceStatus] = mapped_column(
        String(20), default=DeviceStatus.active, nullable=False, index=True
    )

    # Out-of-band management
    management_ip: Mapped[Optional[str]] = mapped_column(INET)
    management_protocol: Mapped[Optional[ManagementProtocol]] = mapped_column(String(10))

    # SNMP (community stored encrypted)
    snmp_community: Mapped[Optional[str]] = mapped_column(String(500))
    snmp_version: Mapped[Optional[SNMPVersion]] = mapped_column(String(5))

    # SSH credentials (encrypted via Fernet — never returned in API responses)
    ssh_username: Mapped[Optional[str]] = mapped_column(String(100))
    ssh_password_enc: Mapped[Optional[str]] = mapped_column(String(500))
    ssh_key_enc: Mapped[Optional[str]] = mapped_column(Text)

    # Lifecycle dates
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    warranty_expiry: Mapped[Optional[date]] = mapped_column(Date, index=True)
    end_of_support_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    end_of_life_date: Mapped[Optional[date]] = mapped_column(Date, index=True)

    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Flexible vendor-specific extra attributes
    custom_fields: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)

    # Relationships
    rack: Mapped[Optional["Rack"]] = relationship(back_populates="devices")
    licenses: Mapped[list["License"]] = relationship(back_populates="device")
    interfaces: Mapped[list["NetworkInterface"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    lag_groups: Mapped[list["LAGGroup"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    virt_hosts: Mapped[list["VirtualizationHost"]] = relationship(back_populates="device")
    ip_addresses: Mapped[list["IPAddress"]] = relationship(back_populates="device")

    # Extension table relationships (1:1)
    # foreign_keys required: DeviceServer has two FKs to devices (device_id + blade_chassis_id)
    server_detail: Mapped[Optional["DeviceServer"]] = relationship(
        back_populates="device", uselist=False, cascade="all, delete-orphan",
        foreign_keys="DeviceServer.device_id",
    )
    network_detail: Mapped[Optional["DeviceNetwork"]] = relationship(
        back_populates="device", uselist=False, cascade="all, delete-orphan"
    )
    pdu_detail: Mapped[Optional["DevicePDU"]] = relationship(
        back_populates="device", uselist=False, cascade="all, delete-orphan"
    )


# ─── Server Extension ─────────────────────────────────────────────────────────

class DeviceServer(Base):
    __tablename__ = "device_servers"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )
    form_factor: Mapped[Optional[FormFactor]] = mapped_column(String(10))
    # For blade servers: FK to the chassis device
    blade_chassis_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
    )
    blade_slot: Mapped[Optional[int]] = mapped_column(SmallInteger)

    # CPU
    cpu_model: Mapped[Optional[str]] = mapped_column(String(255))
    cpu_socket_count: Mapped[Optional[int]] = mapped_column(SmallInteger)
    cpu_cores_per_socket: Mapped[Optional[int]] = mapped_column(SmallInteger)
    cpu_threads_per_core: Mapped[Optional[int]] = mapped_column(SmallInteger)

    # RAM
    ram_gb: Mapped[Optional[int]] = mapped_column(Integer)
    ram_max_gb: Mapped[Optional[int]] = mapped_column(Integer)
    ram_slots_total: Mapped[Optional[int]] = mapped_column(SmallInteger)
    ram_slots_used: Mapped[Optional[int]] = mapped_column(SmallInteger)

    # Storage: [{slot, type, size_gb, model, status}]
    storage_drives: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)

    nic_count: Mapped[Optional[int]] = mapped_column(SmallInteger)
    hba_count: Mapped[Optional[int]] = mapped_column(SmallInteger)
    bios_version: Mapped[Optional[str]] = mapped_column(String(100))
    bmc_firmware_version: Mapped[Optional[str]] = mapped_column(String(100))
    # Dedup key for Lenovo xClarity sync
    xclarity_uuid: Mapped[Optional[str]] = mapped_column(String(100), index=True)

    # Blade chassis capacity fields (only meaningful when device_type=blade_chassis)
    total_blade_slots: Mapped[Optional[int]] = mapped_column(SmallInteger)
    ethernet_switch_modules: Mapped[Optional[int]] = mapped_column(SmallInteger)
    fc_switch_modules: Mapped[Optional[int]] = mapped_column(SmallInteger)

    # Relationships
    device: Mapped["Device"] = relationship(
        back_populates="server_detail",
        foreign_keys=[device_id],
    )


# ─── Network Device Extension ─────────────────────────────────────────────────

class DeviceNetwork(Base):
    __tablename__ = "device_network"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # OS examples: ios, nxos, eos, junos, fortios, pfsense
    os_type: Mapped[Optional[str]] = mapped_column(String(50))
    os_version: Mapped[Optional[str]] = mapped_column(String(100))
    port_count: Mapped[Optional[int]] = mapped_column(Integer)
    uplink_port_count: Mapped[Optional[int]] = mapped_column(Integer)
    management_vlan: Mapped[Optional[int]] = mapped_column(SmallInteger)
    # STP mode: rstp, mstp, pvst
    spanning_tree_mode: Mapped[Optional[str]] = mapped_column(String(10))
    spanning_tree_priority: Mapped[Optional[int]] = mapped_column(Integer)
    stacking_enabled: Mapped[Optional[bool]] = mapped_column(Boolean)
    stack_member_id: Mapped[Optional[int]] = mapped_column(SmallInteger)
    snmp_sysoid: Mapped[Optional[str]] = mapped_column(String(255))

    # Relationships
    device: Mapped["Device"] = relationship(back_populates="network_detail")


# ─── PDU Extension ────────────────────────────────────────────────────────────

class DevicePDU(Base):
    __tablename__ = "device_pdu"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )
    outlet_count: Mapped[Optional[int]] = mapped_column(SmallInteger)
    # e.g. C13, C19, NEMA_5-15, IEC_60309
    outlet_type: Mapped[Optional[str]] = mapped_column(String(30))
    input_voltage: Mapped[Optional[int]] = mapped_column(SmallInteger)
    input_current_max_a: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2))
    is_metered: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_switched: Mapped[Optional[bool]] = mapped_column(Boolean)
    current_load_w: Mapped[Optional[int]] = mapped_column(Integer)

    # Relationships
    device: Mapped["Device"] = relationship(back_populates="pdu_detail")
