import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import Duplex, InterfaceStatus, MediaType


class NetworkInterfaceBase(BaseModel):
    device_id: uuid.UUID
    name: str
    media_type: MediaType
    speed_mbps: Optional[int] = None
    mac_address: Optional[str] = None
    wwn: Optional[str] = None
    is_management: bool = False
    is_uplink: bool = False
    duplex: Optional[Duplex] = None
    mtu: Optional[int] = None
    status: InterfaceStatus = InterfaceStatus.unknown


class NetworkInterfaceCreate(NetworkInterfaceBase):
    pass


class NetworkInterfaceUpdate(BaseModel):
    name: Optional[str] = None
    media_type: Optional[MediaType] = None
    speed_mbps: Optional[int] = None
    mac_address: Optional[str] = None
    wwn: Optional[str] = None
    is_management: Optional[bool] = None
    is_uplink: Optional[bool] = None
    duplex: Optional[Duplex] = None
    mtu: Optional[int] = None
    status: Optional[InterfaceStatus] = None


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
