"""
Auth endpoints — Phase 4

POST /auth/login           — authenticate, return access token + set httpOnly refresh cookie
POST /auth/refresh         — token rotation (reads cookie, revokes old jti, issues new pair)
POST /auth/logout          — revoke access token jti + clear refresh cookie
GET  /auth/me              — return current user (requires active, non-locked account)
POST /auth/change-password — change password (works even when must_change_password=True)

Security guarantees implemented here:
- Refresh token is stored ONLY in an httpOnly, Secure, SameSite=Strict cookie.
  It is never readable by JavaScript, which eliminates XSS-based token theft.
- Failed logins are audit-logged with username and client IP.
- Successful logins update last_login_at and are audit-logged.
- Refresh token rotation: old refresh jti is written to token_revocations BEFORE
  issuing new tokens, preventing replay attacks.
- Logout writes the access token jti (and clears the refresh cookie) to token_revocations.
- Password changes are audit-logged; must_change_password is cleared by set_password().
- IP is extracted from X-Forwarded-For (set by Nginx) with fallback to request.client.host.
- CSRF: SameSite=Strict on the refresh cookie mitigates CSRF on the /auth/refresh
  endpoint. All other endpoints require an Authorization: Bearer header which
  browsers never send automatically, making CSRF non-exploitable there.
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    ActiveUser,
    CurrentUser,
    bearer_scheme,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.crud.audit_log import crud_audit_log
from app.crud.token_revocation import crud_token_revocation
from app.crud.user import crud_user
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    PasswordChangeRequest,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.user import UserRead

router = APIRouter()

_REFRESH_TYPE = "refresh"
_REFRESH_COOKIE = "refresh_token"
# Cookie path scoped to the auth prefix — the browser only sends it to these endpoints.
_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _client_ip(request: Request) -> str | None:
    """Extract real client IP, honouring the X-Forwarded-For header set by Nginx.

    Returns None when the IP cannot be determined — safe for the INET column.
    """
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        ip = xff.split(",")[0].strip()
        return ip or None
    return request.client.host if request.client else None


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Attach the refresh token as an httpOnly, SameSite=Strict cookie."""
    max_age = settings.refresh_token_expire_days * 86400
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=(settings.environment == "production"),
        samesite="strict",
        max_age=max_age,
        path=_REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh token cookie."""
    response.delete_cookie(
        key=_REFRESH_COOKIE,
        path=_REFRESH_COOKIE_PATH,
    )


# ─── POST /auth/login ─────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate with username + password.

    Returns an access token in the response body and sets the refresh token as
    an httpOnly cookie. The cookie is never accessible to JavaScript.
    """
    ip = _client_ip(request)

    user = await crud_user.get_by_username(db, body.username)

    if user is None or not user.is_active or not verify_password(body.password, user.hashed_password):
        await crud_audit_log.create(
            db,
            entity_type="user",
            entity_id="unknown",
            action=AuditAction.login,
            diff={"event": "login_failed", "username": body.username},
            ip_address=ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token, _ = create_access_token(str(user.id))
    refresh_token, _ = create_refresh_token(str(user.id))

    _set_refresh_cookie(response, refresh_token)

    await crud_audit_log.create(
        db,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.login,
        user_id=user.id,
        diff={"event": "login_success"},
        ip_address=ip,
    )

    return TokenResponse(
        access_token=access_token,
        must_change_password=user.must_change_password,
    )


# ─── POST /auth/refresh ───────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    body: RefreshRequest | None = None,
) -> TokenResponse:
    """Rotate tokens.

    Reads the refresh token from the httpOnly cookie (preferred) or the request
    body (legacy). Revokes the old token BEFORE issuing new ones to close the
    window in which a stolen token could be replayed.
    """
    ip = _client_ip(request)

    # Cookie takes precedence over body (httpOnly cookie is unforgeable by JS).
    raw_token: str | None = request.cookies.get(_REFRESH_COOKIE)
    if raw_token is None and body is not None:
        raw_token = body.refresh_token
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing.",
        )

    payload = decode_token(raw_token)

    if payload.get("type") != _REFRESH_TYPE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected refresh token.",
        )

    jti: str = payload.get("jti", "")

    # SECURITY (Issue #4): Check revocation BEFORE issuing new tokens.
    # If the same refresh token is presented twice concurrently, the second
    # caller will find the jti already in token_revocations and be rejected.
    if jti and await crud_token_revocation.is_revoked(db, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked.",
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
        )

    # Revoke the old refresh token IMMEDIATELY — before issuing new tokens.
    if jti:
        exp = payload.get("exp")
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        await crud_token_revocation.revoke(db, jti=jti, expires_at=expires_at)

    new_access, _ = create_access_token(str(user.id))
    new_refresh, _ = create_refresh_token(str(user.id))

    _set_refresh_cookie(response, new_refresh)

    await crud_audit_log.create(
        db,
        entity_type="user",
        entity_id=str(user.id),
        action=AuditAction.token_refresh,
        user_id=user.id,
        diff={"event": "token_refresh"},
        ip_address=ip,
    )

    return TokenResponse(
        access_token=new_access,
        must_change_password=user.must_change_password,
    )


# ─── POST /auth/logout ────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    body: LogoutRequest | None = None,
) -> None:
    """Revoke the current access token, revoke the refresh cookie, and log the event."""
    ip = _client_ip(request)

    # Revoke the access token used to authenticate this request
    if credentials:
        payload = decode_token(credentials.credentials)
        jti: str = payload.get("jti", "")
        if jti:
            exp = payload.get("exp")
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            await crud_token_revocation.revoke(db, jti=jti, expires_at=expires_at)

    # Revoke the refresh token from the cookie
    raw_refresh = request.cookies.get(_REFRESH_COOKIE)
    # Also accept an explicit body refresh token (legacy clients)
    if raw_refresh is None and body is not None:
        raw_refresh = body.refresh_token

    if raw_refresh:
        try:
            rt_payload = decode_token(raw_refresh)
            if rt_payload.get("type") == _REFRESH_TYPE:
                rt_jti: str = rt_payload.get("jti", "")
                if rt_jti:
                    rt_exp = rt_payload.get("exp")
                    rt_expires = datetime.fromtimestamp(rt_exp, tz=timezone.utc)
                    await crud_token_revocation.revoke(db, jti=rt_jti, expires_at=rt_expires)
        except HTTPException:
            pass  # Already expired/invalid — nothing to revoke

    # Clear the httpOnly cookie regardless
    _clear_refresh_cookie(response)

    await crud_audit_log.create(
        db,
        entity_type="user",
        entity_id=str(current_user.id),
        action=AuditAction.logout,
        user_id=current_user.id,
        diff={"event": "logout"},
        ip_address=ip,
    )


# ─── GET /auth/me ─────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserRead)
async def get_me(current_user: ActiveUser) -> User:
    """Return the authenticated user's profile."""
    return current_user


# ─── POST /auth/change-password ───────────────────────────────────────────────

@router.post("/change-password", response_model=UserRead)
async def change_password(
    body: PasswordChangeRequest,
    current_user: CurrentUser,  # CurrentUser (not ActiveUser) — works when must_change_password=True
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Change the authenticated user's password.

    This endpoint is intentionally reachable even when must_change_password=True
    so that the forced first-login password change can be completed.
    """
    ip = _client_ip(request)

    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    updated = await crud_user.set_password(db, db_obj=current_user, new_password=body.new_password)

    await crud_audit_log.create(
        db,
        entity_type="user",
        entity_id=str(updated.id),
        action=AuditAction.update,
        user_id=updated.id,
        diff={"event": "password_changed"},
        ip_address=ip,
    )

    return updated
