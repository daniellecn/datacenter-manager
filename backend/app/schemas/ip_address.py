import ipaddress
import re
import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import IPAssignmentType, IPStatus

_LABEL_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$")


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

    @field_validator("address", mode="before")
    @classmethod
    def validate_address(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v

    @field_validator("fqdn", mode="before")
    @classmethod
    def validate_fqdn(cls, v: Any) -> Any:
        if v is None or v == "":
            return v
        v = str(v)
        if len(v) > 253:
            raise ValueError("FQDN must not exceed 253 characters")
        labels = v.rstrip(".").split(".")
        for label in labels:
            if not label:
                raise ValueError(f"FQDN '{v}' contains an empty label")
            if len(label) > 63:
                raise ValueError(f"FQDN label '{label}' exceeds 63 characters")
            if not _LABEL_RE.match(label):
                raise ValueError(
                    f"FQDN label '{label}' contains invalid characters. "
                    "Labels must start and end with alphanumeric and contain only a-z, A-Z, 0-9, -"
                )
        return v


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

    @field_validator("address", mode="before")
    @classmethod
    def validate_address(cls, v: Any) -> Any:
        v = _to_str(v)
        if v is None or v == "":
            return v
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"'{v}' is not a valid IP address")
        return v

    @field_validator("fqdn", mode="before")
    @classmethod
    def validate_fqdn(cls, v: Any) -> Any:
        if v is None or v == "":
            return v
        v = str(v)
        if len(v) > 253:
            raise ValueError("FQDN must not exceed 253 characters")
        labels = v.rstrip(".").split(".")
        for label in labels:
            if not label:
                raise ValueError(f"FQDN '{v}' contains an empty label")
            if len(label) > 63:
                raise ValueError(f"FQDN label '{label}' exceeds 63 characters")
            if not _LABEL_RE.match(label):
                raise ValueError(
                    f"FQDN label '{label}' contains invalid characters. "
                    "Labels must start and end with alphanumeric and contain only a-z, A-Z, 0-9, -"
                )
        return v


class IPAddressRead(IPAddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_seen_at: Optional[datetime]

    @field_validator("address", mode="before")
    @classmethod
    def coerce_to_str(cls, v: Any) -> Any:
        return _to_str(v)
