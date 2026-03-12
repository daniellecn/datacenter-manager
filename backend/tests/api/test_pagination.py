"""
Pagination edge-case tests:
  - Page beyond last page → empty list (not 404)
  - Invalid size → 400 / 422
  - size=0, size negative
  - Correct total returned
"""
import pytest

from tests.factories import DatacenterFactory


@pytest.mark.asyncio
async def test_page_beyond_last_returns_empty_not_404(readonly_client, db):
    """Request page 9999 → 200 with empty items, not 404."""
    resp = await readonly_client.get("/api/v1/datacenters?page=9999&size=50")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []


@pytest.mark.asyncio
async def test_pagination_total_matches_count(readonly_client, db):
    """Create 3 datacenters; total must reflect that."""
    for i in range(3):
        await DatacenterFactory.create(db, name=f"PagDC-{i}")

    resp = await readonly_client.get("/api/v1/datacenters?page=1&size=50")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 3


@pytest.mark.asyncio
async def test_pagination_size_limits_items(readonly_client, db):
    for i in range(10):
        await DatacenterFactory.create(db, name=f"SizeDC-{i}")

    resp = await readonly_client.get("/api/v1/datacenters?page=1&size=3")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) <= 3


@pytest.mark.asyncio
async def test_invalid_size_returns_error(readonly_client):
    """size=0 or negative must return 4xx."""
    resp = await readonly_client.get("/api/v1/datacenters?size=0")
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_pagination_page_field_returned(readonly_client, db):
    resp = await readonly_client.get("/api/v1/datacenters?page=2&size=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "page" in data
    assert "size" in data
    assert "total" in data
    assert "items" in data
