import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DataCenterBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    total_power_kw: Optional[Decimal] = Field(default=None, gt=0)
    total_cooling_kw: Optional[Decimal] = Field(default=None, gt=0)
    pue: Optional[Decimal] = Field(default=None, ge=1.0, le=10.0)
    notes: Optional[str] = None


class DataCenterCreate(DataCenterBase):
    pass


class DataCenterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    total_power_kw: Optional[Decimal] = Field(default=None, gt=0)
    total_cooling_kw: Optional[Decimal] = Field(default=None, gt=0)
    pue: Optional[Decimal] = Field(default=None, ge=1.0, le=10.0)
    notes: Optional[str] = None


class DataCenterRead(DataCenterBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
