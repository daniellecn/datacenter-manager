import ipaddress
import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.models.enums import NetworkPurpose


def _to_str(v: Any) -> Any:
    """Convert network/address objects returned by psycopg/SQLAlchemy to str."""
    if v is None:
        return v
    return str(v)


class IPNetworkBase(BaseModel):
    cidr: str
    name: str
    gateway: Optional[str] = None
    vlan_id: Optional[uuid.UUID] = None
    purpose: Optional[NetworkPurpose] = None
    dhcp_enabled: bool = False
    dhcp_range_start: Optional[str] = None
    dhcp_range_end: Optional[str] = None
    dns_servers: Optional[list[str]] = None
    notes: Optional[str] = None

    @field_validator("cidr", mode="before")
    @classmethod
    def validate_cidr(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None:
            return v
        try:
            ipaddress.ip_network(v, strict=False)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid CIDR network (e.g. 192.168.1.0/24)")
        return v

    @field_validator("gateway", "dhcp_range_start", "dhcp_range_end", mode="before")
    @classmethod
    def validate_ip_field(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v


class IPNetworkCreate(IPNetworkBase):
    @model_validator(mode="after")
    def validate_dhcp_range(self) -> "IPNetworkCreate":
        if self.dhcp_enabled:
            if not self.dhcp_range_start:
                raise ValueError("dhcp_range_start is required when dhcp_enabled is True")
            if not self.dhcp_range_end:
                raise ValueError("dhcp_range_end is required when dhcp_enabled is True")
        return self


class IPNetworkUpdate(BaseModel):
    cidr: Optional[str] = None
    name: Optional[str] = None
    gateway: Optional[str] = None
    vlan_id: Optional[uuid.UUID] = None
    purpose: Optional[NetworkPurpose] = None
    dhcp_enabled: Optional[bool] = None
    dhcp_range_start: Optional[str] = None
    dhcp_range_end: Optional[str] = None
    dns_servers: Optional[list[str]] = None
    notes: Optional[str] = None

    @field_validator("cidr", mode="before")
    @classmethod
    def validate_cidr(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_network(v, strict=False)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid CIDR network (e.g. 192.168.1.0/24)")
        return v

    @field_validator("gateway", "dhcp_range_start", "dhcp_range_end", mode="before")
    @classmethod
    def validate_ip_field(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v

    @model_validator(mode="after")
    def validate_dhcp_range(self) -> "IPNetworkUpdate":
        if self.dhcp_enabled:
            if not self.dhcp_range_start:
                raise ValueError("dhcp_range_start is required when dhcp_enabled is True")
            if not self.dhcp_range_end:
                raise ValueError("dhcp_range_end is required when dhcp_enabled is True")
        return self


class IPNetworkRead(IPNetworkBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID

    @field_validator("cidr", "gateway", "dhcp_range_start", "dhcp_range_end", mode="before")
    @classmethod
    def coerce_to_str(cls, v: Any) -> Any:
        return _to_str(v)

    @field_validator("dns_servers", mode="before")
    @classmethod
    def coerce_list_to_str(cls, v: Any) -> Any:
        if v is None:
            return v
        return [str(x) for x in v]
