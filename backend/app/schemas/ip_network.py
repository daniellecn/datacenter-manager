import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

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


class IPNetworkCreate(IPNetworkBase):
    pass


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
