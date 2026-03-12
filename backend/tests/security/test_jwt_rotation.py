"""
Security tests for JWT refresh token rotation and access token revocation.

Covers:
  - Refresh issues new access + refresh tokens
  - Old refresh token is rejected after rotation (cannot reuse)
  - Stolen refresh token detected on second use
  - Logout revokes access token (jti written to token_revocations)
  - Revoked token rejected on subsequent request
  - Token revocation denylist: jti inserted on logout blocks subsequent requests
  - Refresh token sent as access token is rejected
"""
from datetime import timedelta

import pytest

from app.core.security import create_access_token, create_refresh_token
from tests.conftest import _make_user
from app.models.enums import UserRole


# ── Helper ────────────────────────────────────────────────────────────────────

async def _login(client, username: str, password: str) -> dict:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── Token rotation ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_produces_new_tokens(client, db):
    await _make_user(db, UserRole.operator, username="rot_user1", password="Pass123!")
    tokens = await _login(client, "rot_user1", "Pass123!")

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert resp.status_code == 200
    new_tokens = resp.json()
    assert new_tokens["access_token"] != tokens["access_token"]
    assert new_tokens["refresh_token"] != tokens["refresh_token"]


@pytest.mark.asyncio
async def test_old_refresh_token_rejected_after_rotation(client, db):
    await _make_user(db, UserRole.operator, username="rot_user2", password="Pass123!")
    tokens = await _login(client, "rot_user2", "Pass123!")
    old_refresh = tokens["refresh_token"]

    # First use: success
    resp1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert resp1.status_code == 200

    # Reuse: should be rejected
    resp2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert resp2.status_code == 401
    assert "revoked" in resp2.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_stolen_refresh_token_detected_on_second_use(client, db):
    """Simulates a stolen token: the legitimate user rotates it, attacker's reuse is blocked."""
    await _make_user(db, UserRole.operator, username="stolen_rt_user", password="Pass123!")
    tokens = await _login(client, "stolen_rt_user", "Pass123!")
    stolen_refresh = tokens["refresh_token"]

    # Legitimate rotation
    legit_resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": stolen_refresh})
    assert legit_resp.status_code == 200

    # Attacker reuse
    attacker_resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": stolen_refresh})
    assert attacker_resp.status_code == 401


# ── Logout and access token revocation ───────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_revokes_access_token_jti(client, db):
    await _make_user(db, UserRole.operator, username="logout_jti_user", password="Pass123!")
    tokens = await _login(client, "logout_jti_user", "Pass123!")
    access = tokens["access_token"]
    headers = {"Authorization": f"Bearer {access}"}

    # Confirm token works before logout
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200

    # Logout
    logout = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204

    # Access token must now be rejected
    blocked = await client.get("/api/v1/auth/me", headers=headers)
    assert blocked.status_code == 401
    assert "revoked" in blocked.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_token_revocation_denylist_blocks_subsequent_requests(client, db):
    """After logout, all subsequent requests with the same access token are rejected."""
    await _make_user(db, UserRole.operator, username="denylist_user", password="Pass123!")
    tokens = await _login(client, "denylist_user", "Pass123!")
    access = tokens["access_token"]
    headers = {"Authorization": f"Bearer {access}"}

    await client.post("/api/v1/auth/logout", headers=headers)

    # Multiple attempts — all must fail
    for _ in range(3):
        resp = await client.get("/api/v1/auth/me", headers=headers)
        assert resp.status_code == 401


# ── Token type validation ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token_cannot_be_used_as_access_token(client, db):
    """Sending a refresh token to /auth/me (which expects access) must be rejected."""
    await _make_user(db, UserRole.operator, username="type_check_user", password="Pass123!")
    tokens = await _login(client, "type_check_user", "Pass123!")
    refresh = tokens["refresh_token"]

    resp = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_access_token_cannot_be_used_as_refresh_token(client, db):
    """Sending an access token to /auth/refresh must be rejected."""
    await _make_user(db, UserRole.operator, username="type_check_user2", password="Pass123!")
    tokens = await _login(client, "type_check_user2", "Pass123!")
    access = tokens["access_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401
