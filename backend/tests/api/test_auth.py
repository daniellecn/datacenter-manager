"""
API tests for /api/v1/auth endpoints:
  - login success / failure
  - forced password change blocks /me
  - token refresh rotation
  - refresh token reuse rejected
  - logout revokes access token
  - revoked token rejected on subsequent request
  - audit log written for auth events
"""
import pytest
from sqlalchemy import select

from app.core.security import create_refresh_token, hash_password
from app.crud.token_revocation import crud_token_revocation
from app.models.audit_log import AuditLog
from app.models.enums import AuditAction, UserRole
from app.models.user import User
from tests.conftest import _make_user


# ── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(client, db):
    await _make_user(db, UserRole.operator, username="login_user", password="Correct123!")
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "login_user", "password": "Correct123!"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client, db):
    await _make_user(db, UserRole.operator, username="login_wp", password="RealPass123!")
    resp = await client.post(
        "/api/v1/auth/login", json={"username": "login_wp", "password": "WrongPass!"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user_returns_401(client):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "no_such_user_xyz", "password": "anything"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_failed_login_audit_logged(client, db):
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "phantom_user", "password": "wrong"},
    )
    assert resp.status_code == 401
    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.action == AuditAction.login,
            AuditLog.entity_id == "unknown",
        )
    )).scalars().all()
    assert len(audit_rows) >= 1


@pytest.mark.asyncio
async def test_successful_login_audit_logged(client, db):
    user = await _make_user(db, UserRole.operator, username="audit_login_user", password="Audit123!")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "audit_login_user", "password": "Audit123!"},
    )
    assert resp.status_code == 200
    audit_rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity_id == str(user.id),
            AuditLog.action == AuditAction.login,
        )
    )).scalars().all()
    assert any(row.diff.get("event") == "login_success" for row in audit_rows)


# ── Forced password change ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_must_change_password_blocks_me(client, db):
    """User with must_change_password=True cannot access /me."""
    user = await _make_user(
        db, UserRole.operator, username="forced_pw_user",
        password="Temp123!", must_change_password=True
    )
    # Login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "forced_pw_user", "password": "Temp123!"},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    # /me should return 403
    me_resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me_resp.status_code == 403
    assert me_resp.json()["detail"]["reason"] == "password_change_required"


@pytest.mark.asyncio
async def test_change_password_works_when_must_change(client, db):
    """Change-password endpoint must be accessible even with must_change_password=True."""
    await _make_user(
        db, UserRole.operator, username="change_pw_user",
        password="OldPass123!", must_change_password=True
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "change_pw_user", "password": "OldPass123!"},
    )
    token = resp.json()["access_token"]

    change_resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPass123!", "new_password": "NewPass456!"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert change_resp.status_code == 200


# ── Token refresh rotation ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_issues_new_tokens(client, db):
    user = await _make_user(db, UserRole.operator, username="refresh_user1", password="Pass123!")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "refresh_user1", "password": "Pass123!"},
    )
    refresh_token = login_resp.json()["refresh_token"]
    old_access = login_resp.json()["access_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["access_token"] != old_access
    assert data["refresh_token"] != refresh_token


@pytest.mark.asyncio
async def test_refresh_token_reuse_rejected(client, db):
    """After rotation, the old refresh token must be rejected."""
    await _make_user(db, UserRole.operator, username="refresh_reuse_user", password="Pass123!")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "refresh_reuse_user", "password": "Pass123!"},
    )
    original_refresh = login_resp.json()["refresh_token"]

    # First use — should succeed
    resp1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
    assert resp1.status_code == 200

    # Reuse — should fail
    resp2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
    assert resp2.status_code == 401


# ── Logout and token revocation ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_revokes_access_token(client, db):
    user = await _make_user(db, UserRole.operator, username="logout_user1", password="Pass123!")
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "logout_user1", "password": "Pass123!"},
    )
    access_token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # Logout
    logout_resp = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 204

    # Revoked token must be rejected
    me_resp = await client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_rejected(client):
    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": "Bearer not.a.valid.token"}
    )
    assert resp.status_code == 401
