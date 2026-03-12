"""
API tests for virtual layer endpoints:
  - Clusters, Hosts, VMs, Datastores
  - RBAC
"""
import pytest

from tests.factories import (
    DatastoreFactory,
    DeviceFactory,
    DatacenterFactory,
    RackFactory,
    RoomFactory,
    VirtClusterFactory,
    VirtHostFactory,
    VMFactory,
)


# ── Clusters ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_cluster(operator_client, db):
    resp = await operator_client.post(
        "/api/v1/virt/clusters",
        json={"name": "prod-cluster", "platform": "vmware_vsphere"},
    )
    assert resp.status_code == 201
    assert resp.json()["platform"] == "vmware_vsphere"


@pytest.mark.asyncio
async def test_list_clusters(readonly_client, db):
    await VirtClusterFactory.create(db, name="list-cluster-test")
    resp = await readonly_client.get("/api/v1/virt/clusters")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_cluster_read_only_cannot_create(readonly_client):
    resp = await readonly_client.post(
        "/api/v1/virt/clusters",
        json={"name": "hack-cluster", "platform": "proxmox"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cluster_platform_variants(operator_client, db):
    """All four supported platforms must be accepted."""
    platforms = ["vmware_vsphere", "hyper_v", "proxmox", "citrix_xenserver", "xcp_ng"]
    for i, platform in enumerate(platforms):
        resp = await operator_client.post(
            "/api/v1/virt/clusters",
            json={"name": f"cluster-{platform}-{i}", "platform": platform},
        )
        assert resp.status_code == 201, f"Platform {platform} failed: {resp.text}"


# ── Hosts ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_host(operator_client, db):
    cluster = await VirtClusterFactory.create(db)
    resp = await operator_client.post(
        "/api/v1/virt/hosts",
        json={
            "cluster_id": str(cluster.id),
            "platform_uuid": "uuid-esxi-001",
            "vcpu_allocated": 48,
            "ram_allocated_gb": 256,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["cluster_id"] == str(cluster.id)


@pytest.mark.asyncio
async def test_list_hosts_filter_by_cluster(readonly_client, db):
    cluster1 = await VirtClusterFactory.create(db)
    cluster2 = await VirtClusterFactory.create(db)
    host1 = await VirtHostFactory.create(db, cluster_id=cluster1.id)
    host2 = await VirtHostFactory.create(db, cluster_id=cluster2.id)

    resp = await readonly_client.get(f"/api/v1/virt/hosts?cluster_id={cluster1.id}")
    assert resp.status_code == 200
    ids = [h["id"] for h in resp.json()["items"]]
    assert str(host1.id) in ids
    assert str(host2.id) not in ids


# ── VMs ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_vm(operator_client, db):
    cluster = await VirtClusterFactory.create(db)
    host = await VirtHostFactory.create(db, cluster_id=cluster.id)
    resp = await operator_client.post(
        "/api/v1/virt/vms",
        json={
            "host_id": str(host.id),
            "name": "test-vm-001",
            "platform_vm_id": "vm-12345",
            "vcpu_count": 4,
            "ram_gb": 8,
            "status": "running",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["name"] == "test-vm-001"


@pytest.mark.asyncio
async def test_list_vms_by_host(readonly_client, db):
    cluster = await VirtClusterFactory.create(db)
    host1 = await VirtHostFactory.create(db, cluster_id=cluster.id)
    host2 = await VirtHostFactory.create(db, cluster_id=cluster.id)
    vm1 = await VMFactory.create(db, host_id=host1.id)
    vm2 = await VMFactory.create(db, host_id=host2.id)

    resp = await readonly_client.get(f"/api/v1/virt/vms?host_id={host1.id}")
    assert resp.status_code == 200
    ids = [v["id"] for v in resp.json()["items"]]
    assert str(vm1.id) in ids
    assert str(vm2.id) not in ids


@pytest.mark.asyncio
async def test_vm_platform_data_stored(operator_client, db):
    cluster = await VirtClusterFactory.create(db)
    host = await VirtHostFactory.create(db, cluster_id=cluster.id)
    resp = await operator_client.post(
        "/api/v1/virt/vms",
        json={
            "host_id": str(host.id),
            "name": "vm-with-platform-data",
            "platform_vm_id": "pve-100",
            "vcpu_count": 2,
            "ram_gb": 4,
            "status": "stopped",
            "platform_data": {"vmid": 100, "node": "pve01"},
        },
    )
    assert resp.status_code == 201
    assert resp.json()["platform_data"]["vmid"] == 100


# ── Datastores ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_datastore(operator_client, db):
    cluster = await VirtClusterFactory.create(db)
    resp = await operator_client.post(
        "/api/v1/virt/datastores",
        json={
            "cluster_id": str(cluster.id),
            "name": "datastore-001",
            "datastore_type": "vmfs",
            "total_gb": 5000,
            "free_gb": 2500,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["datastore_type"] == "vmfs"


@pytest.mark.asyncio
async def test_datastore_types(operator_client, db):
    cluster = await VirtClusterFactory.create(db)
    for i, ds_type in enumerate(["vmfs", "nfs", "vsan", "iscsi", "fc", "smb"]):
        resp = await operator_client.post(
            "/api/v1/virt/datastores",
            json={
                "cluster_id": str(cluster.id),
                "name": f"ds-{ds_type}-{i}",
                "datastore_type": ds_type,
                "total_gb": 1000,
                "free_gb": 500,
            },
        )
        assert resp.status_code == 201, f"Datastore type {ds_type} failed: {resp.text}"
