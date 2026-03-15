import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import VirtPlatform


class VirtClusterBase(BaseModel):
    name: str = Field(min_length=1)
    platform: VirtPlatform
    management_url: Optional[str] = None
    management_username: Optional[str] = None
    platform_config: Optional[dict[str, Any]] = None
    ha_enabled: bool = False
    drs_enabled: bool = False
    total_vcpu: Optional[int] = Field(default=None, ge=0)
    total_ram_gb: Optional[int] = Field(default=None, ge=0)
    total_storage_tb: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None


class VirtClusterCreate(VirtClusterBase):
    # Plaintext password — CRUD layer encrypts before storing as management_password_enc
    management_password: Optional[str] = None


class VirtClusterUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    management_url: Optional[str] = None
    management_username: Optional[str] = None
    management_password: Optional[str] = None
    platform_config: Optional[dict[str, Any]] = None
    ha_enabled: Optional[bool] = None
    drs_enabled: Optional[bool] = None
    total_vcpu: Optional[int] = Field(default=None, ge=0)
    total_ram_gb: Optional[int] = Field(default=None, ge=0)
    total_storage_tb: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None


class VirtClusterRead(VirtClusterBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # management_password_enc excluded — ends in _enc and contains password
