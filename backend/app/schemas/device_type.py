import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

_NAME_RE = re.compile(r'^[a-z][a-z0-9_]*$')
_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')

KNOWN_ICON_KEYS = {
    "server", "switch", "router", "firewall", "storage",
    "pdu", "patch_panel", "blade_chassis", "blade", "generic",
}


def _validate_color(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    if not _COLOR_RE.match(v):
        raise ValueError("color must be a 6-digit hex colour like #3b82f6")
    return v.lower()


class DeviceTypeCreate(BaseModel):
    name: str
    label: str
    color: Optional[str] = None
    icon_key: Optional[str] = None
    sort_order: int = 0

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip().lower()
        if not _NAME_RE.match(v):
            raise ValueError(
                "name must start with a letter and contain only lowercase letters, digits, and underscores"
            )
        if len(v) > 50:
            raise ValueError("name must be 50 characters or fewer")
        return v

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        return _validate_color(v)

    @field_validator("icon_key")
    @classmethod
    def validate_icon_key(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in KNOWN_ICON_KEYS:
            raise ValueError(f"icon_key must be one of: {', '.join(sorted(KNOWN_ICON_KEYS))}")
        return v


class DeviceTypeUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    icon_key: Optional[str] = None
    sort_order: Optional[int] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        return _validate_color(v)

    @field_validator("icon_key")
    @classmethod
    def validate_icon_key(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in KNOWN_ICON_KEYS:
            raise ValueError(f"icon_key must be one of: {', '.join(sorted(KNOWN_ICON_KEYS))}")
        return v


class DeviceTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    label: str
    color: Optional[str]
    icon_key: Optional[str]
    is_builtin: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
