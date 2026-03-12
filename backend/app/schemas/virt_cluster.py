import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import VirtPlatform


class VirtClusterBase(BaseModel):
    name: str
    platform: VirtPlatform
    management_url: Optional[str] = None
    management_username: Optional[str] = None
    platform_config: Optional[dict[str, Any]] = None
    ha_enabled: bool = False
    drs_enabled: bool = False
    total_vcpu: Optional[int] = None
    total_ram_gb: Optional[int] = None
    total_storage_tb: Optional[Decimal] = None
    notes: Optional[str] = None


class VirtClusterCreate(VirtClusterBase):
    # Plaintext password — CRUD layer encrypts before storing as management_password_enc
    management_password: Optional[str] = None


class VirtClusterUpdate(BaseModel):
    name: Optional[str] = None
    management_url: Optional[str] = None
    management_username: Optional[str] = None
    management_password: Optional[str] = None
    platform_config: Optional[dict[str, Any]] = None
    ha_enabled: Optional[bool] = None
    drs_enabled: Optional[bool] = None
    total_vcpu: Optional[int] = None
    total_ram_gb: Optional[int] = None
    total_storage_tb: Optional[Decimal] = None
    notes: Optional[str] = None


class VirtClusterRead(VirtClusterBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # management_password_enc excluded — ends in _enc and contains password
