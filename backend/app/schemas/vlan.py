import re
import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class VLANBase(BaseModel):
    vlan_id: int = Field(ge=1, le=4094)
    name: str = Field(min_length=1)
    description: Optional[str] = None
    color: Optional[str] = None

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, v: Any) -> Any:
        if v is None or v == "":
            return v
        if not _COLOR_RE.match(str(v)):
            raise ValueError(
                f"'{v}' is not a valid hex color. Expected format: #RRGGBB"
            )
        return v


class VLANCreate(VLANBase):
    pass


class VLANUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    color: Optional[str] = None

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, v: Any) -> Any:
        if v is None or v == "":
            return v
        if not _COLOR_RE.match(str(v)):
            raise ValueError(
                f"'{v}' is not a valid hex color. Expected format: #RRGGBB"
            )
        return v


class VLANRead(VLANBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
