"""
JWT utilities, password hashing, and FastAPI dependency hierarchy.

Dependency chain (each level includes all checks from the level above):
  get_current_user  → decode access token, check revocation denylist, load user
  get_active_user   → + require must_change_password == False
  require_operator  → + require role in (admin, operator)
  require_admin     → + require role == admin

Type aliases for use in endpoint signatures:
  CurrentUser   — use ONLY for the change-password endpoint
  ActiveUser    — all other authenticated endpoints
  OperatorUser  — mutating endpoints (write access)
  AdminUser     — admin-only endpoints
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

ALGORITHM = "HS256"
_ACCESS = "access"
_REFRESH = "refresh"

bearer_scheme = HTTPBearer(auto_error=False)


# ─── Password hashing ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


# ─── Token creation ────────────────────────────────────────────────────────────

def _make_token(subject: str, token_type: str, expires_delta: timedelta) -> tuple[str, str]:
    """Returns (encoded_jwt, jti)."""
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + expires_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "jti": jti,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), jti


def create_access_token(subject: str) -> tuple[str, str]:
    """Returns (access_token, jti)."""
    delta = timedelta(minutes=settings.access_token_expire_minutes)
    return _make_token(subject, _ACCESS, delta)


def create_refresh_token(subject: str) -> tuple[str, str]:
    """Returns (refresh_token, jti)."""
    delta = timedelta(days=settings.refresh_token_expire_days)
    return _make_token(subject, _REFRESH, delta)


# ─── Token decoding ────────────────────────────────────────────────────────────

def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises HTTP 401 on any failure."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ─── Dependencies ──────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode access token, check revocation denylist, return the User."""
    # Lazy imports to avoid circular imports at module load time.
    from app.crud.token_revocation import crud_token_revocation  # noqa: PLC0415
    from app.crud.user import crud_user  # noqa: PLC0415

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)

    if payload.get("type") != _ACCESS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    jti: str = payload.get("jti", "")
    if jti and await crud_token_revocation.is_revoked(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub: str = payload.get("sub", "")
    try:
        user_id = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token subject.",
        )

    user = await crud_user.get(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_active_user(current_user: "CurrentUser") -> User:
    """Block access while must_change_password is True."""
    if current_user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"reason": "password_change_required"},
        )
    return current_user


async def _require_operator(active_user: "ActiveUser") -> User:
    from app.models.enums import UserRole  # noqa: PLC0415
    if active_user.role not in (UserRole.admin, UserRole.operator):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operator role or higher required.",
        )
    return active_user


async def _require_admin(active_user: "ActiveUser") -> User:
    from app.models.enums import UserRole  # noqa: PLC0415
    if active_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )
    return active_user


# ─── Type aliases ──────────────────────────────────────────────────────────────

CurrentUser = Annotated[User, Depends(get_current_user)]
ActiveUser = Annotated[User, Depends(get_active_user)]
OperatorUser = Annotated[User, Depends(_require_operator)]
AdminUser = Annotated[User, Depends(_require_admin)]
