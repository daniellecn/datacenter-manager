import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import AirflowDirection, RackStatus


class RackBase(BaseModel):
    room_id: uuid.UUID
    name: str
    row: Optional[str] = None
    column: Optional[str] = None
    total_u: int = 42
    max_power_w: Optional[int] = None
    max_weight_kg: Optional[Decimal] = None
    airflow_direction: Optional[AirflowDirection] = None
    power_feed_count: int = 2
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    status: RackStatus = RackStatus.active
    notes: Optional[str] = None


class RackCreate(RackBase):
    pass


class RackUpdate(BaseModel):
    name: Optional[str] = None
    row: Optional[str] = None
    column: Optional[str] = None
    total_u: Optional[int] = None
    max_power_w: Optional[int] = None
    max_weight_kg: Optional[Decimal] = None
    airflow_direction: Optional[AirflowDirection] = None
    power_feed_count: Optional[int] = None
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
