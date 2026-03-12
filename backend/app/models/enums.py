import enum


# ─── Physical Layer ───────────────────────────────────────────────────────────

class DeviceType(str, enum.Enum):
    server = "server"
    switch = "switch"
    router = "router"
    firewall = "firewall"
    storage = "storage"
    pdu = "pdu"
    patch_panel = "patch_panel"
    kvm = "kvm"
    load_balancer = "load_balancer"
    cable_manager = "cable_manager"
    other = "other"


class DeviceStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    maintenance = "maintenance"
    decommissioned = "decommissioned"
    spare = "spare"


class AirflowDirection(str, enum.Enum):
    front_to_back = "front_to_back"
    back_to_front = "back_to_front"
    top_exhaust = "top_exhaust"


class CoolingType(str, enum.Enum):
    crac = "crac"
    crah = "crah"
    row_based = "row_based"
    in_row = "in_row"
    free_cooling = "free_cooling"


class RackStatus(str, enum.Enum):
    active = "active"
    reserved = "reserved"
    decommissioned = "decommissioned"


class DeviceFace(str, enum.Enum):
    front = "front"
    rear = "rear"


class ManagementProtocol(str, enum.Enum):
    ipmi = "ipmi"
    idrac = "idrac"
    ilo = "ilo"
    xcc = "xcc"
    snmp = "snmp"
    ssh = "ssh"
    api = "api"


class SNMPVersion(str, enum.Enum):
    v1 = "v1"
    v2c = "v2c"
    v3 = "v3"


class FormFactor(str, enum.Enum):
    one_u = "1u"
    two_u = "2u"
    four_u = "4u"
    blade = "blade"
    tower = "tower"


class LicenseType(str, enum.Enum):
    perpetual = "perpetual"
    subscription = "subscription"
    per_socket = "per_socket"
    per_core = "per_core"
    per_vm = "per_vm"
    site = "site"


# ─── Network Layer ────────────────────────────────────────────────────────────

class MediaType(str, enum.Enum):
    copper_rj45 = "copper_rj45"
    sfp = "sfp"
    sfp_plus = "sfp_plus"
    sfp28 = "sfp28"
    qsfp = "qsfp"
    qsfp_plus = "qsfp_plus"
    qsfp28 = "qsfp28"
    fc = "fc"
    iscsi = "iscsi"
    dac = "dac"


class InterfaceStatus(str, enum.Enum):
    up = "up"
    down = "down"
    admin_down = "admin_down"
    unknown = "unknown"


class Duplex(str, enum.Enum):
    full = "full"
    half = "half"
    auto = "auto"


class LinkType(str, enum.Enum):
    ethernet = "ethernet"
    fiber_sm = "fiber_sm"
    fiber_mm = "fiber_mm"
    dac = "dac"
    fc = "fc"
    iscsi = "iscsi"
    lacp_member = "lacp_member"
    virtual = "virtual"


class LinkStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    planned = "planned"


class LAGMode(str, enum.Enum):
    lacp = "lacp"
    static = "static"
    active_backup = "active_backup"


class NetworkPurpose(str, enum.Enum):
    management = "management"
    production = "production"
    storage = "storage"
    backup = "backup"
    dmz = "dmz"
    oob = "oob"
    replication = "replication"
    vmotion = "vmotion"


class IPAssignmentType(str, enum.Enum):
    static = "static"
    dhcp = "dhcp"
    reserved = "reserved"
    anycast = "anycast"


class IPStatus(str, enum.Enum):
    in_use = "in_use"
    available = "available"
    reserved = "reserved"
    deprecated = "deprecated"


class SANFabricType(str, enum.Enum):
    fc = "fc"
    iscsi = "iscsi"
    fcoe = "fcoe"
    nvme_of = "nvme_of"


# ─── Virtual Layer ────────────────────────────────────────────────────────────

class VirtPlatform(str, enum.Enum):
    vmware_vsphere = "vmware_vsphere"
    hyper_v = "hyper_v"
    proxmox = "proxmox"
    citrix_xenserver = "citrix_xenserver"
    xcp_ng = "xcp_ng"


class VMStatus(str, enum.Enum):
    running = "running"
    stopped = "stopped"
    suspended = "suspended"
    migrating = "migrating"
    error = "error"


class OSType(str, enum.Enum):
    windows = "windows"
    linux = "linux"
    freebsd = "freebsd"
    other = "other"


class DatastoreType(str, enum.Enum):
    vmfs = "vmfs"
    nfs = "nfs"
    vsan = "vsan"
    iscsi = "iscsi"
    fc = "fc"
    smb = "smb"


# ─── Integrations ─────────────────────────────────────────────────────────────

class IntegrationType(str, enum.Enum):
    xclarity = "xclarity"
    snmp = "snmp"
    ssh = "ssh"
    vcenter = "vcenter"
    scvmm = "scvmm"
    proxmox_api = "proxmox_api"
    xenserver_api = "xenserver_api"


class IntegrationStatus(str, enum.Enum):
    ok = "ok"
    error = "error"
    warning = "warning"
    disabled = "disabled"


class SyncStatus(str, enum.Enum):
    success = "success"
    partial = "partial"
    failed = "failed"


# ─── Alerts ───────────────────────────────────────────────────────────────────

class AlertSeverity(str, enum.Enum):
    critical = "critical"
    warning = "warning"
    info = "info"


class AlertType(str, enum.Enum):
    device_eol = "device_eol"
    device_eos = "device_eos"
    license_expiry = "license_expiry"
    warranty_expiry = "warranty_expiry"
    power_capacity = "power_capacity"
    sync_failure = "sync_failure"
    device_unreachable = "device_unreachable"
    other = "other"


# ─── Users & Audit ────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    read_only = "read_only"


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"
    sync = "sync"
    login = "login"
