"""
Test factory helpers — build and persist ORM objects.

Uses factory.Factory for attribute generation (pure Python, no DB) and
provides `create_async(db)` class methods for async session persistence.
"""
import uuid
from datetime import date, datetime, timezone
from typing import Any

import factory
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.datacenter import DataCenter
from app.models.device import Device, DeviceServer, DeviceNetwork
from app.models.enums import (
    AlertSeverity,
    AlertType,
    AuditAction,
    DatastoreType,
    DeviceStatus,
    DeviceType,
    IntegrationType,
    InterfaceStatus,
    IPStatus,
    LinkStatus,
    LinkType,
    MediaType,
    RackStatus,
    SANFabricType,
    UserRole,
    VirtPlatform,
    VMStatus,
)
from app.models.ip_address import IPAddress
from app.models.ip_network import IPNetwork
from app.models.license import License
from app.models.network_interface import NetworkInterface
from app.models.network_link import NetworkLink
from app.models.rack import Rack
from app.models.room import Room
from app.models.san_fabric import SANFabric
from app.models.virt_cluster import VirtualizationCluster
from app.models.virt_host import VirtualizationHost
from app.models.virtual_machine import VirtualMachine
from app.models.datastore import Datastore
from app.models.integration import Integration
from app.models.alert import Alert
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.vlan import VLAN


# ── Async persist helper ─────────────────────────────────────────────────────

async def _persist(db: AsyncSession, obj: Any) -> Any:
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


# ── User ─────────────────────────────────────────────────────────────────────

class UserFactory(factory.Factory):
    class Meta:
        model = User

    id = factory.LazyFunction(uuid.uuid4)
    username = factory.Sequence(lambda n: f"testuser_{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@test.local")
    hashed_password = factory.LazyFunction(lambda: hash_password("Testpass123!"))
    role = UserRole.operator
    is_active = True
    must_change_password = False

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> User:
        return await _persist(db, cls.build(**kwargs))


# ── DataCenter ───────────────────────────────────────────────────────────────

class DatacenterFactory(factory.Factory):
    class Meta:
        model = DataCenter

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"DC-{n:03d}")
    address = "123 Test Street"
    city = "Testville"
    country = "US"
    total_power_kw = 1000
    notes = None

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> DataCenter:
        return await _persist(db, cls.build(**kwargs))


# ── Room ─────────────────────────────────────────────────────────────────────

class RoomFactory(factory.Factory):
    class Meta:
        model = Room

    id = factory.LazyFunction(uuid.uuid4)
    datacenter_id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"Room-{n:03d}")
    notes = None

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Room:
        return await _persist(db, cls.build(**kwargs))


# ── Rack ─────────────────────────────────────────────────────────────────────

class RackFactory(factory.Factory):
    class Meta:
        model = Rack

    id = factory.LazyFunction(uuid.uuid4)
    room_id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"Rack-{n:03d}")
    total_u = 42
    max_power_w = 10000
    status = RackStatus.active

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Rack:
        return await _persist(db, cls.build(**kwargs))


# ── Device ───────────────────────────────────────────────────────────────────

class DeviceFactory(factory.Factory):
    class Meta:
        model = Device

    id = factory.LazyFunction(uuid.uuid4)
    rack_id = None
    name = factory.Sequence(lambda n: f"device-{n:04d}")
    device_type = DeviceType.server
    manufacturer = "Lenovo"
    model = "ThinkSystem SR650"
    serial_number = factory.Sequence(lambda n: f"SN{n:08d}")
    status = DeviceStatus.active
    rack_unit_start = factory.Sequence(lambda n: (n % 40) + 1)
    rack_unit_size = 2

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Device:
        return await _persist(db, cls.build(**kwargs))


# ── Network Interface ─────────────────────────────────────────────────────────

class NetworkInterfaceFactory(factory.Factory):
    class Meta:
        model = NetworkInterface

    id = factory.LazyFunction(uuid.uuid4)
    device_id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"eth{n}")          # column is `name` not `interface_name`
    media_type = MediaType.copper_rj45
    speed_mbps = 1000
    status = InterfaceStatus.up

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> NetworkInterface:
        return await _persist(db, cls.build(**kwargs))


# ── Network Link ─────────────────────────────────────────────────────────────

class NetworkLinkFactory(factory.Factory):
    class Meta:
        model = NetworkLink

    id = factory.LazyFunction(uuid.uuid4)
    source_interface_id = factory.LazyFunction(uuid.uuid4)
    target_interface_id = factory.LazyFunction(uuid.uuid4)
    link_type = LinkType.ethernet
    status = LinkStatus.active
    speed_mbps = 1000

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> NetworkLink:
        return await _persist(db, cls.build(**kwargs))


# ── VLAN ─────────────────────────────────────────────────────────────────────

class VLANFactory(factory.Factory):
    class Meta:
        model = VLAN

    id = factory.LazyFunction(uuid.uuid4)
    vlan_id = factory.Sequence(lambda n: 100 + n)
    name = factory.Sequence(lambda n: f"vlan-{100 + n}")
    description = None

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> VLAN:
        return await _persist(db, cls.build(**kwargs))


# ── IP Network ────────────────────────────────────────────────────────────────

class IPNetworkFactory(factory.Factory):
    class Meta:
        model = IPNetwork

    id = factory.LazyFunction(uuid.uuid4)
    cidr = factory.Sequence(lambda n: f"10.{(n // 256) % 256}.{n % 256}.0/24")
    name = factory.Sequence(lambda n: f"net-{n:03d}")
    vlan_id = None
    gateway = None           # column is `gateway` not `default_gateway`
    dhcp_enabled = False

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> IPNetwork:
        return await _persist(db, cls.build(**kwargs))


# ── IP Address ────────────────────────────────────────────────────────────────

class IPAddressFactory(factory.Factory):
    class Meta:
        model = IPAddress

    id = factory.LazyFunction(uuid.uuid4)
    address = factory.Sequence(lambda n: f"10.0.{(n // 254) % 254}.{(n % 254) + 1}")  # column is `address`
    subnet_id = None          # column is `subnet_id` not `network_id`
    interface_id = None
    status = IPStatus.in_use

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> IPAddress:
        return await _persist(db, cls.build(**kwargs))


# ── SAN Fabric ────────────────────────────────────────────────────────────────

class SANFabricFactory(factory.Factory):
    class Meta:
        model = SANFabric

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"fabric-{n:03d}")
    fabric_type = SANFabricType.fc

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> SANFabric:
        return await _persist(db, cls.build(**kwargs))


# ── License ───────────────────────────────────────────────────────────────────

class LicenseFactory(factory.Factory):
    class Meta:
        model = License

    id = factory.LazyFunction(uuid.uuid4)
    device_id = None
    product_name = factory.Sequence(lambda n: f"Product-{n}")
    license_type = "perpetual"
    quantity = 1
    expiry_date = None

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> License:
        return await _persist(db, cls.build(**kwargs))


# ── Virt Cluster ─────────────────────────────────────────────────────────────

class VirtClusterFactory(factory.Factory):
    class Meta:
        model = VirtualizationCluster

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"cluster-{n:03d}")
    platform = VirtPlatform.vmware_vsphere

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> VirtualizationCluster:
        return await _persist(db, cls.build(**kwargs))


# ── Virt Host ─────────────────────────────────────────────────────────────────

class VirtHostFactory(factory.Factory):
    class Meta:
        model = VirtualizationHost

    id = factory.LazyFunction(uuid.uuid4)
    cluster_id = factory.LazyFunction(uuid.uuid4)
    platform_uuid = factory.Sequence(lambda n: f"uuid-host-{n:08d}")
    vcpu_allocated = 20
    ram_allocated_gb = 256

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> VirtualizationHost:
        return await _persist(db, cls.build(**kwargs))


# ── Virtual Machine ───────────────────────────────────────────────────────────

class VMFactory(factory.Factory):
    class Meta:
        model = VirtualMachine

    id = factory.LazyFunction(uuid.uuid4)
    host_id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"vm-{n:04d}")
    platform_vm_id = factory.Sequence(lambda n: f"vm-{n:08d}")
    vcpu_count = 2          # column is `vcpu_count` not `vcpu`
    ram_gb = 4
    status = VMStatus.running

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> VirtualMachine:
        return await _persist(db, cls.build(**kwargs))


# ── Datastore ─────────────────────────────────────────────────────────────────

class DatastoreFactory(factory.Factory):
    class Meta:
        model = Datastore

    id = factory.LazyFunction(uuid.uuid4)
    cluster_id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"datastore-{n:03d}")
    datastore_type = DatastoreType.vmfs
    total_gb = 10000
    free_gb = 5000

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Datastore:
        return await _persist(db, cls.build(**kwargs))


# ── Integration ───────────────────────────────────────────────────────────────

class IntegrationFactory(factory.Factory):
    class Meta:
        model = Integration

    id = factory.LazyFunction(uuid.uuid4)
    name = factory.Sequence(lambda n: f"integration-{n:03d}")
    integration_type = IntegrationType.snmp
    host = "10.0.0.1"
    enabled = True
    polling_interval_sec = 3600   # column is `polling_interval_sec`

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Integration:
        return await _persist(db, cls.build(**kwargs))


# ── Alert ─────────────────────────────────────────────────────────────────────

class AlertFactory(factory.Factory):
    class Meta:
        model = Alert

    id = factory.LazyFunction(uuid.uuid4)
    entity_type = "device"
    entity_id = factory.LazyFunction(lambda: str(uuid.uuid4()))
    alert_type = AlertType.device_eol
    severity = AlertSeverity.warning
    message = "Test alert message"

    @classmethod
    async def create(cls, db: AsyncSession, **kwargs) -> Alert:
        return await _persist(db, cls.build(**kwargs))


# ── Convenience: full physical stack ─────────────────────────────────────────

async def make_physical_stack(db: AsyncSession) -> tuple[DataCenter, Room, Rack, Device]:
    """Create a minimal linked datacenter → room → rack → device."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)
    device = await DeviceFactory.create(db, rack_id=rack.id)
    return dc, room, rack, device


async def make_linked_devices(db: AsyncSession) -> tuple[Device, Device, Device, NetworkLink, NetworkLink]:
    """Create three devices connected A-B-C for path-tracing tests."""
    dc = await DatacenterFactory.create(db)
    room = await RoomFactory.create(db, datacenter_id=dc.id)
    rack = await RackFactory.create(db, room_id=room.id)

    dev_a = await DeviceFactory.create(db, rack_id=rack.id, name="dev-A", serial_number="SN-A001")
    dev_b = await DeviceFactory.create(db, rack_id=rack.id, name="dev-B", serial_number="SN-B001",
                                        device_type=DeviceType.switch)
    dev_c = await DeviceFactory.create(db, rack_id=rack.id, name="dev-C", serial_number="SN-C001")

    iface_a = await NetworkInterfaceFactory.create(db, device_id=dev_a.id)
    iface_b1 = await NetworkInterfaceFactory.create(db, device_id=dev_b.id, name="eth0")
    iface_b2 = await NetworkInterfaceFactory.create(db, device_id=dev_b.id, name="eth1")
    iface_c = await NetworkInterfaceFactory.create(db, device_id=dev_c.id)

    link_ab = await NetworkLinkFactory.create(
        db, source_interface_id=iface_a.id, target_interface_id=iface_b1.id
    )
    link_bc = await NetworkLinkFactory.create(
        db, source_interface_id=iface_b2.id, target_interface_id=iface_c.id
    )

    return dev_a, dev_b, dev_c, link_ab, link_bc
