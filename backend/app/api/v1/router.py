from fastapi import APIRouter

from app.api.v1.endpoints import (
    alerts,
    audit,
    auth,
    corridors,
    dashboard,
    datacenters,
    datastores,
    devices,
    integrations,
    interfaces,
    ip_addresses,
    ip_networks,
    licenses,
    racks,
    rooms,
    san_fabrics,
    search,
    topology,
    users,
    virt_clusters,
    virt_hosts,
    virt_vms,
    vlans,
)
from app.api.v1.endpoints.links import router as links_router, lag_router

api_router = APIRouter()

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# User management (admin only)
api_router.include_router(users.router, prefix="/users", tags=["users"])

# Physical layer
api_router.include_router(datacenters.router, prefix="/datacenters", tags=["physical"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["physical"])
api_router.include_router(corridors.router, prefix="/corridors", tags=["physical"])
api_router.include_router(racks.router, prefix="/racks", tags=["physical"])
api_router.include_router(devices.router, prefix="/devices", tags=["physical"])
api_router.include_router(licenses.router, prefix="/licenses", tags=["physical"])

# Network layer
api_router.include_router(interfaces.router, prefix="/interfaces", tags=["network"])
api_router.include_router(links_router, prefix="/links", tags=["network"])
api_router.include_router(lag_router, prefix="/lag-groups", tags=["network"])
api_router.include_router(vlans.router, prefix="/vlans", tags=["network"])
api_router.include_router(ip_networks.router, prefix="/ip-networks", tags=["network"])
api_router.include_router(ip_addresses.router, prefix="/ip-addresses", tags=["network"])
api_router.include_router(san_fabrics.router, prefix="/san-fabrics", tags=["network"])

# Virtual layer
api_router.include_router(virt_clusters.router, prefix="/virt/clusters", tags=["virtual"])
api_router.include_router(virt_hosts.router, prefix="/virt/hosts", tags=["virtual"])
api_router.include_router(virt_vms.router, prefix="/virt/vms", tags=["virtual"])
api_router.include_router(datastores.router, prefix="/virt/datastores", tags=["virtual"])

# Integrations
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])

# Topology & analytics
api_router.include_router(topology.router, prefix="/topology", tags=["topology"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(audit.router, prefix="/audit-logs", tags=["audit"])
