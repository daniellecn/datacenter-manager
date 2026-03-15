import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import IntegrationStatus, IntegrationType, SyncStatus


# ─── Integration ──────────────────────────────────────────────────────────────

class IntegrationBase(BaseModel):
    name: str = Field(min_length=1)
    integration_type: IntegrationType
    host: Optional[str] = None
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    extra_config: Optional[dict[str, Any]] = None
    enabled: bool = True
    polling_interval_sec: int = Field(default=3600, ge=60)


class IntegrationCreate(IntegrationBase):
    # Plaintext credentials — CRUD layer encrypts before storing as credentials_enc
    credentials: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_host_required_when_enabled(self) -> "IntegrationCreate":
        if self.enabled and not self.host:
            raise ValueError("host is required when enabled is True")
        return self


class IntegrationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    host: Optional[str] = None
    port: Optional[int] = Field(default=None, ge=1, le=65535)
    credentials: Optional[dict[str, Any]] = None
    extra_config: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    polling_interval_sec: Optional[int] = Field(default=None, ge=60)


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
