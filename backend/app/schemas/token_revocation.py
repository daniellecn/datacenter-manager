from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TokenRevocationCreate(BaseModel):
    jti: str
    expires_at: datetime


class TokenRevocationRead(TokenRevocationCreate):
    model_config = ConfigDict(from_attributes=True)
