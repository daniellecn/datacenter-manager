import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CorridorBase(BaseModel):
    room_id: uuid.UUID
    name: str
    position: Optional[int] = None
    notes: Optional[str] = None


class CorridorCreate(CorridorBase):
    pass


class CorridorUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[int] = None
    notes: Optional[str] = None
    corridor_id: Optional[uuid.UUID] = None  # allows reassigning room if needed


class CorridorRead(CorridorBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
