import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import IPAssignmentType, IPStatus


def _to_str(v: Any) -> Any:
    if v is None:
        return v
    return str(v)


class IPAddressBase(BaseModel):
    address: str
    subnet_id: Optional[uuid.UUID] = None
    device_id: Optional[uuid.UUID] = None
    interface_id: Optional[uuid.UUID] = None
    vm_id: Optional[uuid.UUID] = None
    fqdn: Optional[str] = None
    assignment_type: IPAssignmentType = IPAssignmentType.static
    status: IPStatus = IPStatus.in_use
    notes: Optional[str] = None


class IPAddressCreate(IPAddressBase):
    pass


class IPAddressUpdate(BaseModel):
    address: Optional[str] = None
    subnet_id: Optional[uuid.UUID] = None
    device_id: Optional[uuid.UUID] = None
    interface_id: Optional[uuid.UUID] = None
    vm_id: Optional[uuid.UUID] = None
    fqdn: Optional[str] = None
    assignment_type: Optional[IPAssignmentType] = None
    status: Optional[IPStatus] = None
    notes: Optional[str] = None


class IPAddressRead(IPAddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_seen_at: Optional[datetime]

    @field_validator("address", mode="before")
    @classmethod
    def coerce_to_str(cls, v: Any) -> Any:
        return _to_str(v)
