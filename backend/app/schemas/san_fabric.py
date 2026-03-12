import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import SANFabricType


class SANFabricBase(BaseModel):
    name: str
    fabric_type: SANFabricType
    speed_gbps: Optional[int] = None
    wwn: Optional[str] = None


class SANFabricCreate(SANFabricBase):
    pass


class SANFabricUpdate(BaseModel):
    name: Optional[str] = None
    fabric_type: Optional[SANFabricType] = None
    speed_gbps: Optional[int] = None
    wwn: Optional[str] = None


class SANFabricRead(SANFabricBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
