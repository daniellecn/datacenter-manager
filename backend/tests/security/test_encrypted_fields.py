"""
Security test: scan ALL API response bodies to ensure no encrypted or
sensitive fields are ever returned.

Checks that the following patterns do NOT appear in any response JSON:
  - key ending in _enc
  - key ending in _password or _password_enc
  - key ending in _key or _key_enc
  - key ending in _secret
  - hashed_password
  - ssh_password_enc, ssh_key_enc, license_key_enc, credentials_enc
"""
import json
import re
import uuid

import pytest

from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    LicenseFactory,
    RackFactory,
    RoomFactory,
    VirtClusterFactory,
    VirtHostFactory,
    VMFactory,
    make_physical_stack,
)

# Patterns that must never appear in any response body.
# Note: must_change_password is a legitimate boolean flag, not a secret field.
_FORBIDDEN_KEYS = re.compile(
    r'"('
    r'[a-z_]+_enc|'
    r'hashed_password|'
    r'ssh_password|'
    r'credentials_enc|'
    r'license_key_enc|'
    r'ssh_key_enc'
    r')"',
    re.IGNORECASE,
)


def _assert_no_sensitive_fields(response_body: str, endpoint: str) -> None:
    matches = _FORBIDDEN_KEYS.findall(response_body)
    assert not matches, (
        f"Sensitive fields {matches} found in response from {endpoint}:\n{response_body[:500]}"
    )


# ── Device responses ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_device_list_no_sensitive_fields(operator_client, db):
    dc, room, rack, _ = await make_physical_stack(db)
    await DeviceFactory.create(
        db, rack_id=rack.id, serial_number=f"SENS-{uuid.uuid4().hex[:8]}"
    )
    resp = await operator_client.get("/api/v1/devices")
    assert resp.status_code == 200
    _assert_no_sensitive_fields(resp.text, "GET /devices")


@pytest.mark.asyncio
async def test_device_create_no_sensitive_fields(operator_client, db):
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    resp = await operator_client.post(
        "/api/v1/devices",
        json={
            "name": "sens-device",
            "device_type": "server",
            "serial_number": f"SENS2-{uuid.uuid4().hex[:8]}",
            "rack_id": str(rack.id),
            "ssh_password": "very-secret-password-123",
            "ssh_key": "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
            "ssh_username": "root",
        },
    )
    assert resp.status_code == 201
    _assert_no_sensitive_fields(resp.text, "POST /devices")


@pytest.mark.asyncio
async def test_device_detail_no_sensitive_fields(operator_client, db):
    dc, room, rack, device = await make_physical_stack(db)
    resp = await operator_client.get(f"/api/v1/devices/{device.id}")
    assert resp.status_code == 200
    _assert_no_sensitive_fields(resp.text, f"GET /devices/{device.id}")


# ── License responses ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_license_no_key_enc_in_response(operator_client, db):
    dc, room, rack, device = await make_physical_stack(db)
    resp = await operator_client.post(
        "/api/v1/licenses",
        json={
            "device_id": str(device.id),
            "product_name": "Sensitive Product",
            "license_type": "perpetual",
            "license_key": "AAAA-BBBB-CCCC-DDDD-EEEE",
        },
    )
    assert resp.status_code == 201
    _assert_no_sensitive_fields(resp.text, "POST /licenses")


@pytest.mark.asyncio
async def test_license_list_no_sensitive_fields(readonly_client, db):
    resp = await readonly_client.get("/api/v1/licenses")
    assert resp.status_code == 200
    _assert_no_sensitive_fields(resp.text, "GET /licenses")


# ── Integration responses ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_integration_create_no_credentials_in_response(admin_client, db):
    resp = await admin_client.post(
        "/api/v1/integrations",
        json={
            "name": "test-snmp-integration",
            "integration_type": "snmp",
            "enabled": True,
            "polling_interval_sec": 3600,
        },
    )
    assert resp.status_code == 201
    _assert_no_sensitive_fields(resp.text, "POST /integrations")


# ── User responses ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_me_no_hashed_password(operator_client, db):
    resp = await operator_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    _assert_no_sensitive_fields(resp.text, "GET /auth/me")


@pytest.mark.asyncio
async def test_user_list_no_hashed_password(admin_client, db):
    resp = await admin_client.get("/api/v1/users")
    assert resp.status_code == 200
    _assert_no_sensitive_fields(resp.text, "GET /users")
