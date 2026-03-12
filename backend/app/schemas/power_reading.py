import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PowerReadingCreate(BaseModel):
    device_id: uuid.UUID
    recorded_at: datetime
    watts: int


class PowerReadingRead(PowerReadingCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
