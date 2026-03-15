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
import ipaddress
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    DeviceFace, DeviceStatus,
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
    blade_slot: Optional[int] = Field(default=None, ge=1)
    cpu_model: Optional[str] = None
    cpu_socket_count: Optional[int] = Field(default=None, ge=1)
    cpu_cores_per_socket: Optional[int] = Field(default=None, ge=1)
    cpu_threads_per_core: Optional[int] = Field(default=None, ge=1)
    ram_gb: Optional[int] = Field(default=None, ge=1)
    ram_max_gb: Optional[int] = Field(default=None, ge=1)
    ram_slots_total: Optional[int] = Field(default=None, ge=0)
    ram_slots_used: Optional[int] = Field(default=None, ge=0)
    storage_drives: Optional[list[dict[str, Any]]] = None
    nic_count: Optional[int] = Field(default=None, ge=0)
    hba_count: Optional[int] = Field(default=None, ge=0)
    bios_version: Optional[str] = None
    bmc_firmware_version: Optional[str] = None
    xclarity_uuid: Optional[str] = None
    # Blade chassis capacity (only meaningful when device_type=blade_chassis)
    total_blade_slots: Optional[int] = Field(default=None, ge=1)
    ethernet_switch_modules: Optional[int] = Field(default=None, ge=0)
    fc_switch_modules: Optional[int] = Field(default=None, ge=0)


class DeviceServerCreate(DeviceServerBase):
    @model_validator(mode="after")
    def validate_blade_fields(self) -> "DeviceServerCreate":
        if self.form_factor is not None:
            # Compare against the enum value (.value is the string '1u','2u','blade', etc.)
            ff_val = self.form_factor.value if hasattr(self.form_factor, "value") else str(self.form_factor)
            if ff_val == "blade":
                if self.blade_chassis_id is None:
                    raise ValueError("blade_chassis_id is required when form_factor is 'blade'")
                if self.blade_slot is None:
                    raise ValueError("blade_slot is required when form_factor is 'blade'")
        return self


class DeviceServerUpdate(DeviceServerBase):
    pass


class DeviceServerRead(DeviceServerBase):
    model_config = ConfigDict(from_attributes=True)
    device_id: uuid.UUID


# ─── Network Device Extension ─────────────────────────────────────────────────

class DeviceNetworkBase(BaseModel):
    os_type: Optional[str] = None
    os_version: Optional[str] = None
    port_count: Optional[int] = Field(default=None, ge=1)
    uplink_port_count: Optional[int] = Field(default=None, ge=0)
    management_vlan: Optional[int] = Field(default=None, ge=1, le=4094)
    spanning_tree_mode: Optional[str] = None
    spanning_tree_priority: Optional[int] = Field(default=None, ge=0, le=61440)
    stacking_enabled: Optional[bool] = None
    stack_member_id: Optional[int] = Field(default=None, ge=0)
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
    outlet_count: Optional[int] = Field(default=None, ge=1)
    outlet_type: Optional[str] = None
    input_voltage: Optional[int] = Field(default=None, ge=100, le=480)
    input_current_max_a: Optional[Decimal] = Field(default=None, ge=0)
    is_metered: Optional[bool] = None
    is_switched: Optional[bool] = None
    current_load_w: Optional[int] = Field(default=None, ge=0)


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
    name: str = Field(min_length=1, max_length=200)
    device_type: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    rack_unit_start: Optional[int] = Field(default=None, ge=1)
    rack_unit_size: Optional[int] = Field(default=None, ge=1)
    face: Optional[DeviceFace] = None
    power_rated_w: Optional[int] = Field(default=None, ge=0)
    power_actual_w: Optional[int] = Field(default=None, ge=0)
    weight_kg: Optional[Decimal] = Field(default=None, ge=0)
    status: DeviceStatus = DeviceStatus.active
    management_ip: Optional[str] = None
    management_protocol: Optional[ManagementProtocol] = None
    # snmp_community excluded from base/read — it is encrypted at rest.
    # Provide it in DeviceCreate / DeviceUpdate; it is never returned in responses.
    snmp_version: Optional[SNMPVersion] = None
    ssh_username: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_expiry: Optional[date] = None
    end_of_support_date: Optional[date] = None
    end_of_life_date: Optional[date] = None
    notes: Optional[str] = None
    custom_fields: Optional[dict[str, Any]] = None


class DeviceCreate(DeviceBase):
    # Plaintext credentials — CRUD layer encrypts before storing as *_enc fields.
    # These are write-only and never returned in any Read schema.
    snmp_community: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_key: Optional[str] = None

    @field_validator("management_ip", mode="before")
    @classmethod
    def validate_management_ip(cls, v: Any) -> Any:
        v = _coerce_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IPv4 or IPv6 address")
        return v

    @model_validator(mode="after")
    def validate_rack_unit_start_required(self) -> "DeviceCreate":
        if self.rack_id is not None and self.rack_unit_start is None:
            raise ValueError("rack_unit_start is required when rack_id is set")
        return self

    @model_validator(mode="after")
    def validate_lifecycle_dates(self) -> "DeviceCreate":
        if self.purchase_date is not None:
            if self.end_of_life_date is not None and self.end_of_life_date < self.purchase_date:
                raise ValueError("end_of_life_date must not be before purchase_date")
            if self.end_of_support_date is not None and self.end_of_support_date < self.purchase_date:
                raise ValueError("end_of_support_date must not be before purchase_date")
        return self


class DeviceUpdate(BaseModel):
    rack_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    device_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    part_number: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    rack_unit_start: Optional[int] = Field(default=None, ge=1)
    rack_unit_size: Optional[int] = Field(default=None, ge=1)
    face: Optional[DeviceFace] = None
    power_rated_w: Optional[int] = Field(default=None, ge=0)
    power_actual_w: Optional[int] = Field(default=None, ge=0)
    weight_kg: Optional[Decimal] = Field(default=None, ge=0)
    status: Optional[DeviceStatus] = None
    management_ip: Optional[str] = None
    management_protocol: Optional[ManagementProtocol] = None
    # Plaintext credentials — encrypted by CRUD; never returned in responses.
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

    @field_validator("management_ip", mode="before")
    @classmethod
    def validate_management_ip(cls, v: Any) -> Any:
        v = _coerce_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IPv4 or IPv6 address")
        return v


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
