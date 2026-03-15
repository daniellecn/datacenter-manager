import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import LAGMode, LinkStatus, LinkType


# ─── LAG Group ────────────────────────────────────────────────────────────────

class LAGGroupBase(BaseModel):
    device_id: uuid.UUID
    name: str
    mode: LAGMode
    combined_speed_mbps: Optional[int] = Field(default=None, ge=0)


class LAGGroupCreate(LAGGroupBase):
    pass


class LAGGroupUpdate(BaseModel):
    name: Optional[str] = None
    mode: Optional[LAGMode] = None
    combined_speed_mbps: Optional[int] = Field(default=None, ge=0)


class LAGGroupRead(LAGGroupBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


# ─── Network Link ─────────────────────────────────────────────────────────────

class NetworkLinkBase(BaseModel):
    source_interface_id: uuid.UUID
    target_interface_id: uuid.UUID
    link_type: LinkType
    speed_mbps: Optional[int] = Field(default=None, ge=0)
    cable_label: Optional[str] = None
    cable_color: Optional[str] = None
    lag_group_id: Optional[uuid.UUID] = None
    patch_panel_port_a: Optional[str] = None
    patch_panel_port_b: Optional[str] = None
    status: LinkStatus = LinkStatus.active
    notes: Optional[str] = None


class NetworkLinkCreate(NetworkLinkBase):
    @model_validator(mode="after")
    def validate_no_self_loop(self) -> "NetworkLinkCreate":
        if self.source_interface_id == self.target_interface_id:
            raise ValueError(
                "source_interface_id and target_interface_id must be different (no self-loops)"
            )
        return self


class NetworkLinkUpdate(BaseModel):
    link_type: Optional[LinkType] = None
    speed_mbps: Optional[int] = Field(default=None, ge=0)
    cable_label: Optional[str] = None
    cable_color: Optional[str] = None
    lag_group_id: Optional[uuid.UUID] = None
    patch_panel_port_a: Optional[str] = None
    patch_panel_port_b: Optional[str] = None
    status: Optional[LinkStatus] = None
    notes: Optional[str] = None


class NetworkLinkRead(NetworkLinkBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
