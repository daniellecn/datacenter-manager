import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DataCenterBase(BaseModel):
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    total_power_kw: Optional[Decimal] = None
    total_cooling_kw: Optional[Decimal] = None
    pue: Optional[Decimal] = None
    notes: Optional[str] = None


class DataCenterCreate(DataCenterBase):
    pass


class DataCenterUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    total_power_kw: Optional[Decimal] = None
    total_cooling_kw: Optional[Decimal] = None
    pue: Optional[Decimal] = None
    notes: Optional[str] = None


class DataCenterRead(DataCenterBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
