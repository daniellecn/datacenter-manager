import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.enums import AuditAction


class AuditLogCreate(BaseModel):
    user_id: Optional[uuid.UUID] = None
    entity_type: str
    entity_id: str
    action: AuditAction
    diff: Optional[dict[str, Any]] = None
    ip_address: Optional[str] = None


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    entity_type: str
    entity_id: str
    action: AuditAction
    diff: Optional[dict[str, Any]]
    ip_address: Optional[str]
    timestamp: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def coerce_to_str(cls, v: Any) -> Any:
        if v is None:
            return v
        return str(v)
