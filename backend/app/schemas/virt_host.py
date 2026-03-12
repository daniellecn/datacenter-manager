import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class VirtHostBase(BaseModel):
    device_id: Optional[uuid.UUID] = None
    cluster_id: uuid.UUID
    platform_version: Optional[str] = None
    platform_uuid: Optional[str] = None
    platform_data: Optional[dict[str, Any]] = None
    vcpu_allocated: Optional[int] = None
    ram_allocated_gb: Optional[int] = None
    is_in_maintenance: bool = False


class VirtHostCreate(VirtHostBase):
    pass


class VirtHostUpdate(BaseModel):
    device_id: Optional[uuid.UUID] = None
    platform_version: Optional[str] = None
    platform_uuid: Optional[str] = None
    platform_data: Optional[dict[str, Any]] = None
    vcpu_allocated: Optional[int] = None
    ram_allocated_gb: Optional[int] = None
    is_in_maintenance: Optional[bool] = None


class VirtHostRead(VirtHostBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_synced_at: Optional[datetime]
