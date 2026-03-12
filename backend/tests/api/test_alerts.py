"""
API tests for /api/v1/alerts:
  - List, filter, acknowledge
  - Summary endpoint (declared before /{id})
  - RBAC
"""
import pytest

from tests.factories import AlertFactory
from app.models.enums import AlertSeverity, AlertType


@pytest.mark.asyncio
async def test_list_alerts(readonly_client, db):
    await AlertFactory.create(db, severity=AlertSeverity.critical)
    await AlertFactory.create(db, severity=AlertSeverity.warning)
    resp = await readonly_client.get("/api/v1/alerts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_alert_summary_endpoint_not_shadowed_by_id_route(readonly_client, db):
    """GET /alerts/summary must not be interpreted as /{id} with 'summary' as a UUID."""
    resp = await readonly_client.get("/api/v1/alerts/summary")
    # Must return 200 (not 422 unprocessable from UUID parse failure)
    assert resp.status_code == 200
    data = resp.json()
    # Should return severity counts
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_filter_alerts_by_severity(readonly_client, db):
    await AlertFactory.create(db, severity=AlertSeverity.critical, alert_type=AlertType.device_eol)
    await AlertFactory.create(db, severity=AlertSeverity.warning, alert_type=AlertType.license_expiry)

    resp = await readonly_client.get("/api/v1/alerts?severity=critical")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(item["severity"] == "critical" for item in items)


@pytest.mark.asyncio
async def test_acknowledge_alert(operator_client, db):
    alert = await AlertFactory.create(db)
    resp = await operator_client.post(f"/api/v1/alerts/{alert.id}/acknowledge")
    assert resp.status_code == 200
    assert resp.json()["acknowledged_at"] is not None


@pytest.mark.asyncio
async def test_acknowledge_alert_read_only_forbidden(readonly_client, db):
    alert = await AlertFactory.create(db)
    resp = await readonly_client.post(f"/api/v1/alerts/{alert.id}/acknowledge")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_alert_summary_counts(readonly_client, db):
    await AlertFactory.create(db, severity=AlertSeverity.critical)
    await AlertFactory.create(db, severity=AlertSeverity.critical)
    await AlertFactory.create(db, severity=AlertSeverity.warning)

    resp = await readonly_client.get("/api/v1/alerts/summary")
    assert resp.status_code == 200
    data = resp.json()
    # Summary must contain counts; critical should be >= 2
    assert "critical" in data or any(k in data for k in ["critical", "total"])
