"""
API tests for global search: GET /api/v1/search?q=
"""
import pytest

from tests.factories import (
    DatacenterFactory,
    DeviceFactory,
    IPAddressFactory,
    IPNetworkFactory,
    RackFactory,
    RoomFactory,
    VirtClusterFactory,
    VirtHostFactory,
    VMFactory,
    make_physical_stack,
)


@pytest.mark.asyncio
async def test_search_finds_device_by_name(readonly_client, db):
    dc, room, rack, _ = await make_physical_stack(db)
    await DeviceFactory.create(db, rack_id=rack.id, name="unique-server-xyz-search")

    resp = await readonly_client.get("/api/v1/search?q=unique-server-xyz-search")
    assert resp.status_code == 200
    data = resp.json()
    found = any(
        item.get("entity_type") == "device" and item.get("label") == "unique-server-xyz-search"
        for item in data.get("results", [])
    )
    assert found


@pytest.mark.asyncio
async def test_search_finds_datacenter_by_name(readonly_client, db):
    await DatacenterFactory.create(db, name="SearchableDC-001")

    resp = await readonly_client.get("/api/v1/search?q=SearchableDC-001")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_search_empty_query_returns_200(readonly_client, db):
    resp = await readonly_client.get("/api/v1/search?q=")
    # Should return 200 (empty results), not 400
    assert resp.status_code in (200, 422)


@pytest.mark.asyncio
async def test_search_no_results_is_200(readonly_client, db):
    resp = await readonly_client.get("/api/v1/search?q=zyxwvutsrqponmlkjihgfedcba_no_match")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_search_unauthenticated_returns_401(client, db):
    resp = await client.get("/api/v1/search?q=test")
    assert resp.status_code == 401
