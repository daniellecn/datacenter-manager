import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import CoolingType


class RoomBase(BaseModel):
    datacenter_id: uuid.UUID
    name: str
    floor: Optional[int] = None
    cooling_type: Optional[CoolingType] = None
    raised_floor: bool = False
    width_m: Optional[Decimal] = None
    depth_m: Optional[Decimal] = None
    height_m: Optional[Decimal] = None
    max_power_kw: Optional[Decimal] = None
    notes: Optional[str] = None


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    floor: Optional[int] = None
    cooling_type: Optional[CoolingType] = None
    raised_floor: Optional[bool] = None
    width_m: Optional[Decimal] = None
    depth_m: Optional[Decimal] = None
    height_m: Optional[Decimal] = None
    max_power_kw: Optional[Decimal] = None
    notes: Optional[str] = None


class RoomRead(RoomBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
