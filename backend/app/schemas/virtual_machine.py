import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import OSType, VMStatus


class VMBase(BaseModel):
    host_id: uuid.UUID
    name: str
    platform_vm_id: Optional[str] = None
    status: VMStatus = VMStatus.stopped
    os_type: Optional[OSType] = None
    os_version: Optional[str] = None
    vcpu_count: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    tools_version: Optional[str] = None
    is_template: bool = False
    snapshot_count: Optional[int] = None
    platform_data: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class VMCreate(VMBase):
    pass


class VMUpdate(BaseModel):
    host_id: Optional[uuid.UUID] = None
    name: Optional[str] = None
    platform_vm_id: Optional[str] = None
    status: Optional[VMStatus] = None
    os_type: Optional[OSType] = None
    os_version: Optional[str] = None
    vcpu_count: Optional[int] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    tools_version: Optional[str] = None
    is_template: Optional[bool] = None
    snapshot_count: Optional[int] = None
    platform_data: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class VMRead(VMBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    last_seen_at: Optional[datetime]
    last_synced_at: Optional[datetime]
