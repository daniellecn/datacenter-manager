import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SANFabricType


class SANFabricBase(BaseModel):
    name: str = Field(min_length=1)
    fabric_type: SANFabricType
    speed_gbps: Optional[int] = Field(default=None, ge=1)
    wwn: Optional[str] = None


class SANFabricCreate(SANFabricBase):
    pass


class SANFabricUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    fabric_type: Optional[SANFabricType] = None
    speed_gbps: Optional[int] = Field(default=None, ge=1)
    wwn: Optional[str] = None


class SANFabricRead(SANFabricBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
