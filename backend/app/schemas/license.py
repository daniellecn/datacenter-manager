import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import LicenseType


class LicenseBase(BaseModel):
    device_id: Optional[uuid.UUID] = None
    product_name: str = Field(min_length=1)
    vendor: Optional[str] = None
    license_type: LicenseType
    quantity: Optional[int] = Field(default=None, ge=1)
    purchase_date: Optional[date] = None
    expiry_date: Optional[date] = None
    cost_usd: Optional[Decimal] = Field(default=None, ge=0)
    renewal_reminder_days: int = Field(default=90, ge=1, le=365)
    notes: Optional[str] = None


class LicenseCreate(LicenseBase):
    # Plaintext key — CRUD layer encrypts before storing as license_key_enc
    license_key: Optional[str] = None

    @model_validator(mode="after")
    def validate_expiry_required(self) -> "LicenseCreate":
        lt_val = self.license_type.value if hasattr(self.license_type, "value") else str(self.license_type)
        if lt_val != "perpetual" and self.expiry_date is None:
            raise ValueError("expiry_date is required for non-perpetual licenses")
        return self


class LicenseUpdate(BaseModel):
    device_id: Optional[uuid.UUID] = None
    product_name: Optional[str] = Field(default=None, min_length=1)
    vendor: Optional[str] = None
    license_key: Optional[str] = None
    license_type: Optional[LicenseType] = None
    quantity: Optional[int] = Field(default=None, ge=1)
    purchase_date: Optional[date] = None
    expiry_date: Optional[date] = None
    cost_usd: Optional[Decimal] = Field(default=None, ge=0)
    renewal_reminder_days: Optional[int] = Field(default=None, ge=1, le=365)
    notes: Optional[str] = None


class LicenseRead(LicenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # license_key_enc excluded — ends in _enc and contains _key
