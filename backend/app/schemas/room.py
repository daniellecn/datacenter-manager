import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import CoolingType


class RoomBase(BaseModel):
    datacenter_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    floor: Optional[int] = None
    cooling_type: Optional[CoolingType] = None
    raised_floor: bool = False
    width_m: Optional[Decimal] = Field(default=None, gt=0)
    depth_m: Optional[Decimal] = Field(default=None, gt=0)
    height_m: Optional[Decimal] = Field(default=None, gt=0)
    max_power_kw: Optional[Decimal] = Field(default=None, gt=0)
    notes: Optional[str] = None


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    floor: Optional[int] = None
    cooling_type: Optional[CoolingType] = None
    raised_floor: Optional[bool] = None
    width_m: Optional[Decimal] = Field(default=None, gt=0)
    depth_m: Optional[Decimal] = Field(default=None, gt=0)
    height_m: Optional[Decimal] = Field(default=None, gt=0)
    max_power_kw: Optional[Decimal] = Field(default=None, gt=0)
    notes: Optional[str] = None


class RoomRead(RoomBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
