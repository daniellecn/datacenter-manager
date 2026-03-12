"""
Device schemas — base device plus the three extension tables.

DeviceRead        — base fields only, used in list endpoints.
DeviceDetailRead  — base fields + optional nested extension, used in GET /devices/{id}.
DeviceServerRead/Create/Update, DeviceNetworkRead/Create/Update, DevicePDURead/Create/Update
  — managed via separate endpoints: /devices/{id}/server-detail, etc.

Excluded from all Read schemas:
  ssh_password_enc  — ends in _enc, contains password
  ssh_key_enc       — ends in _enc, contains _key
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import (
    DeviceFace, DeviceStatus, DeviceType,
    FormFactor, ManagementProtocol, SNMPVersion,
)


def _coerce_str(v: Any) -> Any:
    """Convert PostgreSQL INET/MACADDR objects to str."""
    if v is None:
        return v
    return str(v)


# ─── Server Extension ─────────────────────────────────────────────────────────

class DeviceServerBase(BaseModel):
    form_factor: Optional[FormFactor] = None
    blade_chassis_id: Optional[uuid.UUID] = None
    blade_slot: Optional[int] = None
    cpu_model: Optional[str] = None
    cpu_socket_count: Optional[int] = None
    cpu_cores_per_socket: Optional[int] = None
    cpu_threads_per_core: Optional[int] = None
    ram_gb: Optional[int] = None
    ram_max_gb: Optional[int] = None
    ram_slots_total: Optional[int] = None
    ram_slots_used: Optional[int] = None
    storage_drives: Optional[list[dict[str, Any]]] = None
    nic_count: Optional[int] = None
    hba_count: Optional[int] = None
    bios_version: Optional[str] = None
    bmc_firmware_version: Optional[str] = None
    xclarity_uuid: Optional[str] = None


class DeviceServerCreate(DeviceServerBase):
    pass


class DeviceServerUpdate(DeviceServerBase):
    pass


class DeviceServerRead(DeviceServerBase):
    model_config = ConfigDict(from_attributes=True)
    device_id: uuid.UUID


# ─── Network Device Extension ─────────────────────────────────────────────────

class DeviceNetworkBase(BaseModel):
    os_type: Optional[str] = None
    os_version: Optional[str] = None
    port_count: Optional[int] = None
    uplink_port_count: Optional[int] = None
    management_vlan: Optional[int] = None
    spanning_tree_mode: Optional[str] = None
    spanning_tree_priority: Optional[int] = None
    stacking_enabled: Optional[bool] = None
    stack_member_id: Optional[int] = None
    snmp_sysoid: Optional[str] = None


class DeviceNetworkCreate(DeviceNetworkBase):
    pass


class DeviceNetworkUpdate(DeviceNetworkBase):
    pass


class DeviceNetworkRead(DeviceNetworkBase):
    model_config = ConfigDict(from_attributes=True)
    device_id: uuid.UUID


# ─── PDU Extension ────────────────────────────────────────────────────────────

class DevicePDUBase(BaseModel):
    outlet_count: Optional[int] = None
    outlet_type: Optional[str] = None
    input_voltage: Optional[int] = None
    input_current_max_a: Optional[Decimal] = None
    is_metered: Optional[bool] = None
    is_switched: Optional[bool] = None
    current_load_w: Optional[int] = None


class DevicePDUCreate(DevicePDUBase):
    pass


class DevicePDUUpdate(DevicePDUBase):
    pass


class DevicePDURead(DevicePDUBase):
    model_config = ConfigDict(from_attributes=True)
    device_id: uuid.UUID


# ─── Base Device ──────────────────────────────────────────────────────────────

class DeviceBase(BaseModel):
    rack_id: Optional[uuid.UUID] = None
    name: str
    device_type: DeviceType
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    rack_unit_start: Optional[int] = None
    rack_unit_size: Optional[int] = None
    face: Optional[DeviceFace] = None
    power_rated_w: Optional[int] = None
    power_actual_w: Optional[int] = None
    weight_kg: Optional[Decimal] = None
    status: DeviceStatus = DeviceStatus.active
    management_ip: Optional[str] = None
    management_protocol: Optional[ManagementProtocol] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[SNMPVersion] = None
    ssh_username: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    end_of_support_date: Optional[date] = None
    end_of_life_date: Optional[date] = None
    notes: Optional[str] = None
    custom_fields: Optional[dict[str, Any]] = None


class DeviceCreate(DeviceBase):
    # Plaintext SSH credentials — CRUD layer encrypts before storing as *_enc
    ssh_password: Optional[str] = None
    ssh_key: Optional[str] = None


class DeviceUpdate(BaseModel):
    rack_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    device_type: Optional[DeviceType] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    rack_unit_start: Optional[int] = None
    rack_unit_size: Optional[int] = None
    face: Optional[DeviceFace] = None
    power_rated_w: Optional[int] = None
    power_actual_w: Optional[int] = None
    weight_kg: Optional[Decimal] = None
    status: Optional[DeviceStatus] = None
    management_ip: Optional[str] = None
    management_protocol: Optional[ManagementProtocol] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[SNMPVersion] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_key: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    end_of_support_date: Optional[date] = None
    end_of_life_date: Optional[date] = None
    notes: Optional[str] = None
    custom_fields: Optional[dict[str, Any]] = None


class DeviceRead(DeviceBase):
    """Base device read — used in list endpoints."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_synced_at: Optional[datetime]
    last_seen_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    # ssh_password_enc, ssh_key_enc excluded — never returned

    @field_validator("management_ip", mode="before")
    @classmethod
    def coerce_management_ip(cls, v: Any) -> Any:
        return _coerce_str(v)


class DeviceDetailRead(DeviceRead):
    """Full device read with optional nested extension rows."""
    server_detail: Optional[DeviceServerRead] = None
    network_detail: Optional[DeviceNetworkRead] = None
    pdu_detail: Optional[DevicePDURead] = None
