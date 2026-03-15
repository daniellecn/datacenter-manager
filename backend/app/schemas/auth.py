from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    # refresh_token is now set as an httpOnly cookie by the backend.
    # This body field is omitted from responses; kept optional for legacy clients.
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    # Frontend uses this flag to redirect to the change-password page.
    must_change_password: bool = False


class RefreshRequest(BaseModel):
    # Optional: the backend reads the refresh token from the httpOnly cookie
    # first. This body field is retained for legacy clients only.
    refresh_token: Optional[str] = None


class LogoutRequest(BaseModel):
    # Client should send the refresh token so it can be revoked immediately.
    refresh_token: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
