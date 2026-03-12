import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class UserBase(BaseModel):
    username: str = Field(max_length=150)
    email: Optional[str] = Field(default=None, max_length=255)
    role: UserRole = UserRole.read_only
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, max_length=150)
    email: Optional[str] = Field(default=None, max_length=255)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    must_change_password: Optional[bool] = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    must_change_password: bool
    last_login_at: Optional[datetime]
    created_at: datetime
    # hashed_password is excluded — contains "password", never returned
