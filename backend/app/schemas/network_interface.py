import re
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import Duplex, InterfaceStatus, MediaType

_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$")
_WWN_RE = re.compile(r"^([0-9A-Fa-f]{2}:){7}[0-9A-Fa-f]{2}$|^[0-9A-Fa-f]{16}$")


class NetworkInterfaceBase(BaseModel):
    device_id: uuid.UUID
    name: str = Field(min_length=1, max_length=100)
    media_type: MediaType
    speed_mbps: Optional[int] = Field(default=None, ge=0)
    mac_address: Optional[str] = None
    wwn: Optional[str] = None
    is_management: bool = False
    is_uplink: bool = False
    duplex: Optional[Duplex] = None
    mtu: Optional[int] = Field(default=None, ge=576, le=9216)
    status: InterfaceStatus = InterfaceStatus.unknown

    @field_validator("mac_address", mode="before")
    @classmethod
    def validate_mac_address(cls, v: Any) -> Any:
        if v is None:
            return v
        v = str(v)
        if v == "":
            return v
        if not _MAC_RE.match(v):
            raise ValueError(
                f"'{v}' is not a valid MAC address. Expected format: XX:XX:XX:XX:XX:XX"
            )
        return v

    @field_validator("wwn", mode="before")
    @classmethod
    def validate_wwn(cls, v: Any) -> Any:
        if v is None:
            return v
        v = str(v)
        if v == "":
            return v
        if not _WWN_RE.match(v):
            raise ValueError(
                f"'{v}' is not a valid WWN. Expected 16 hex chars (optionally colon-separated)"
            )
        return v


class NetworkInterfaceCreate(NetworkInterfaceBase):
    pass


class NetworkInterfaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    media_type: Optional[MediaType] = None
    speed_mbps: Optional[int] = Field(default=None, ge=0)
    mac_address: Optional[str] = None
    wwn: Optional[str] = None
    is_management: Optional[bool] = None
    is_uplink: Optional[bool] = None
    duplex: Optional[Duplex] = None
    mtu: Optional[int] = Field(default=None, ge=576, le=9216)
    status: Optional[InterfaceStatus] = None

    @field_validator("mac_address", mode="before")
    @classmethod
    def validate_mac_address(cls, v: Any) -> Any:
        if v is None:
            return v
        v = str(v)
        if v == "":
            return v
        if not _MAC_RE.match(v):
            raise ValueError(
                f"'{v}' is not a valid MAC address. Expected format: XX:XX:XX:XX:XX:XX"
            )
        return v

    @field_validator("wwn", mode="before")
    @classmethod
    def validate_wwn(cls, v: Any) -> Any:
        if v is None:
            return v
        v = str(v)
        if v == "":
            return v
        if not _WWN_RE.match(v):
            raise ValueError(
                f"'{v}' is not a valid WWN. Expected 16 hex chars (optionally colon-separated)"
            )
        return v


class NetworkInterfaceRead(NetworkInterfaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_polled_status: Optional[datetime]

    @field_validator("mac_address", mode="before")
    @classmethod
    def coerce_mac(cls, v: Any) -> Any:
        if v is None:
            return v
        return str(v)
