# Import all models so that Base.metadata has the full schema.
# This file must be imported before calling Base.metadata.create_all()
# or generating Alembic migrations.

from app.models.user import User  # noqa: F401
from app.models.datacenter import DataCenter  # noqa: F401
from app.models.room import Room  # noqa: F401
from app.models.corridor import Corridor  # noqa: F401
from app.models.rack import Rack  # noqa: F401
from app.models.vlan import VLAN  # noqa: F401
from app.models.san_fabric import SANFabric  # noqa: F401
from app.models.ip_network import IPNetwork  # noqa: F401
from app.models.device import Device, DeviceServer, DeviceNetwork, DevicePDU  # noqa: F401
from app.models.license import License  # noqa: F401
from app.models.network_interface import NetworkInterface  # noqa: F401
from app.models.network_link import LAGGroup, NetworkLink  # noqa: F401
from app.models.virt_cluster import VirtualizationCluster  # noqa: F401
from app.models.virt_host import VirtualizationHost  # noqa: F401
from app.models.virtual_machine import VirtualMachine  # noqa: F401
from app.models.datastore import Datastore  # noqa: F401
from app.models.ip_address import IPAddress  # noqa: F401
from app.models.integration import Integration, SyncLog  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.power_reading import PowerReading  # noqa: F401
from app.models.alert import Alert  # noqa: F401
from app.models.token_revocation import TokenRevocation  # noqa: F401

__all__ = [
    "User",
    "DataCenter",
    "Room",
    "Corridor",
    "Rack",
    "VLAN",
    "SANFabric",
    "IPNetwork",
    "Device",
    "DeviceServer",
    "DeviceNetwork",
    "DevicePDU",
    "License",
    "NetworkInterface",
    "LAGGroup",
    "NetworkLink",
    "VirtualizationCluster",
    "VirtualizationHost",
    "VirtualMachine",
    "Datastore",
    "IPAddress",
    "Integration",
    "SyncLog",
    "AuditLog",
    "PowerReading",
    "Alert",
    "TokenRevocation",
]
