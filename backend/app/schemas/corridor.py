import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CorridorBase(BaseModel):
    room_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    position: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


class CorridorCreate(CorridorBase):
    pass


class CorridorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    position: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None
    corridor_id: Optional[uuid.UUID] = None  # allows reassigning room if needed


class CorridorRead(CorridorBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
