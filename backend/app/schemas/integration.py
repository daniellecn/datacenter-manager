import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import IntegrationStatus, IntegrationType, SyncStatus


# ─── Integration ──────────────────────────────────────────────────────────────

class IntegrationBase(BaseModel):
    name: str
    integration_type: IntegrationType
    host: Optional[str] = None
    port: Optional[int] = None
    extra_config: Optional[dict[str, Any]] = None
    enabled: bool = True
    polling_interval_sec: int = 3600


class IntegrationCreate(IntegrationBase):
    # Plaintext credentials — CRUD layer encrypts before storing as credentials_enc
    credentials: Optional[dict[str, Any]] = None


class IntegrationUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    credentials: Optional[dict[str, Any]] = None
    extra_config: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    polling_interval_sec: Optional[int] = None


class IntegrationRead(IntegrationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: IntegrationStatus
    last_polled_at: Optional[datetime]
    last_success_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    # credentials_enc excluded — ends in _enc


# ─── Sync Log ─────────────────────────────────────────────────────────────────

class SyncLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    integration_id: uuid.UUID
    started_at: datetime
    completed_at: Optional[datetime]
    status: Optional[SyncStatus]
    items_created: int
    items_updated: int
    items_unchanged: int
    errors: Optional[list[dict[str, Any]]]
