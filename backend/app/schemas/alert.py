import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import AlertSeverity, AlertType


class AlertCreate(BaseModel):
    entity_type: Optional[str] = None
    entity_id: Optional[uuid.UUID] = None
    alert_type: AlertType
    severity: AlertSeverity
    message: str


class AlertRead(AlertCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    acknowledged_at: Optional[datetime]
    acknowledged_by: Optional[str]
    created_at: datetime
    updated_at: datetime
