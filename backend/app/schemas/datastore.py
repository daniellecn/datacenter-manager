import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import DatastoreType


class DatastoreBase(BaseModel):
    cluster_id: uuid.UUID
    name: str
    datastore_type: DatastoreType
    total_gb: Optional[int] = None
    free_gb: Optional[int] = None
    san_fabric_id: Optional[uuid.UUID] = None
    platform_name: Optional[str] = None
    notes: Optional[str] = None


class DatastoreCreate(DatastoreBase):
    pass


class DatastoreUpdate(BaseModel):
    name: Optional[str] = None
    datastore_type: Optional[DatastoreType] = None
    total_gb: Optional[int] = None
    free_gb: Optional[int] = None
    san_fabric_id: Optional[uuid.UUID] = None
    platform_name: Optional[str] = None
    notes: Optional[str] = None


class DatastoreRead(DatastoreBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
