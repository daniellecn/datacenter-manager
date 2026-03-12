import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VLANBase(BaseModel):
    vlan_id: int = Field(ge=1, le=4094)
    name: str
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)


class VLANCreate(VLANBase):
    pass


class VLANUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)


class VLANRead(VLANBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
