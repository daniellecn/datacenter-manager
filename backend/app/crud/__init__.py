from app.crud.alert import crud_alert
from app.crud.audit_log import crud_audit_log
from app.crud.datacenter import crud_datacenter
from app.crud.datastore import crud_datastore
from app.crud.device import crud_device
from app.crud.integration import crud_integration
from app.crud.ip_address import crud_ip_address
from app.crud.ip_network import crud_ip_network
from app.crud.license import crud_license
from app.crud.network_interface import crud_network_interface
from app.crud.network_link import crud_lag_group, crud_network_link
from app.crud.power_reading import crud_power_reading
from app.crud.rack import crud_rack
from app.crud.room import crud_room
from app.crud.san_fabric import crud_san_fabric
from app.crud.token_revocation import crud_token_revocation
from app.crud.user import crud_user
from app.crud.virt_cluster import crud_virt_cluster
from app.crud.virt_host import crud_virt_host
from app.crud.virtual_machine import crud_virtual_machine
from app.crud.vlan import crud_vlan

__all__ = [
    "crud_alert",
    "crud_audit_log",
    "crud_datacenter",
    "crud_datastore",
    "crud_device",
    "crud_integration",
    "crud_ip_address",
    "crud_ip_network",
    "crud_lag_group",
    "crud_license",
    "crud_network_interface",
    "crud_network_link",
    "crud_power_reading",
    "crud_rack",
    "crud_room",
    "crud_san_fabric",
    "crud_token_revocation",
    "crud_user",
    "crud_virt_cluster",
    "crud_virt_host",
    "crud_virtual_machine",
    "crud_vlan",
]
