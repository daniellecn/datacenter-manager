import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import LicenseType


class LicenseBase(BaseModel):
    device_id: Optional[uuid.UUID] = None
    product_name: str
    vendor: Optional[str] = None
    license_type: LicenseType
    quantity: Optional[int] = None
    purchase_date: Optional[date] = None
    expiry_date: Optional[date] = None
    cost_usd: Optional[Decimal] = None
    renewal_reminder_days: int = 90
    notes: Optional[str] = None


class LicenseCreate(LicenseBase):
    # Plaintext key — CRUD layer encrypts before storing as license_key_enc
    license_key: Optional[str] = None


class LicenseUpdate(BaseModel):
    device_id: Optional[uuid.UUID] = None
    product_name: Optional[str] = None
    vendor: Optional[str] = None
    license_key: Optional[str] = None
    license_type: Optional[LicenseType] = None
    quantity: Optional[int] = None
    purchase_date: Optional[date] = None
    expiry_date: Optional[date] = None
    cost_usd: Optional[Decimal] = None
    renewal_reminder_days: Optional[int] = None
    notes: Optional[str] = None


class LicenseRead(LicenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # license_key_enc excluded — ends in _enc and contains _key
