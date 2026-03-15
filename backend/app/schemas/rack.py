import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AirflowDirection, RackStatus


class RackBase(BaseModel):
    corridor_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    row: Optional[str] = None
    column: Optional[str] = None
    total_u: int = Field(default=42, ge=1, le=100)
    max_power_w: Optional[int] = Field(default=None, gt=0)
    max_weight_kg: Optional[Decimal] = Field(default=None, gt=0)
    airflow_direction: Optional[AirflowDirection] = None
    power_feed_count: int = Field(default=2, ge=1, le=8)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    status: RackStatus = RackStatus.active
    notes: Optional[str] = None


class RackCreate(RackBase):
    pass


class RackUpdate(BaseModel):
    corridor_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    row: Optional[str] = None
    column: Optional[str] = None
    total_u: Optional[int] = Field(default=None, ge=1, le=100)
    max_power_w: Optional[int] = Field(default=None, gt=0)
    max_weight_kg: Optional[Decimal] = Field(default=None, gt=0)
    airflow_direction: Optional[AirflowDirection] = None
    power_feed_count: Optional[int] = Field(default=None, ge=1, le=8)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    status: Optional[RackStatus] = None
    notes: Optional[str] = None


class RackRead(RackBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
