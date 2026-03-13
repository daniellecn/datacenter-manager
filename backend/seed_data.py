#!/usr/bin/env python3
"""
Seed script — populates every entity with realistic test data.
Run from the backend/ directory:
    python seed_data.py
Requires the backend to be running on http://localhost:8000
"""

import sys
import json
import datetime
import requests

BASE = "http://localhost:8000/api/v1"
TOKEN = None


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def headers():
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def post(path, data, *, ok=(200, 201), silent=False):
    r = requests.post(f"{BASE}{path}", json=data, headers=headers())
    if r.status_code not in ok:
        if not silent:
            print(f"  POST {path} → {r.status_code}: {r.text[:300]}")
        return None
    return r.json()


def get_list(path, params=None):
    """GET a list endpoint, return items list."""
    url = f"{BASE}{path}"
    r = requests.get(url, params={**(params or {}), "size": 200}, headers=headers())
    if r.status_code != 200:
        return []
    body = r.json()
    return body.get("items", body) if isinstance(body, dict) else body


def find_device(serial=None, name=None):
    """Look up a device by serial number or name."""
    if serial:
        items = get_list("/devices", {"q": serial, "size": 50})
        for d in items:
            if d.get("serial_number") == serial:
                return d
    if name:
        items = get_list("/devices", {"q": name, "size": 50})
        for d in items:
            if d.get("name") == name:
                return d
    return None


def post_or_get_device(data):
    """Create a device, or return existing one if serial already exists."""
    r = requests.post(f"{BASE}/devices", json=data, headers=headers())
    if r.status_code in (200, 201):
        return r.json()
    if r.status_code == 409:
        # Already exists — fetch by serial number or name
        existing = find_device(
            serial=data.get("serial_number"),
            name=data.get("name"),
        )
        return existing
    print(f"  POST /devices → {r.status_code}: {r.text[:300]}")
    return None


def put(path, data, *, ok=(200,)):
    r = requests.put(f"{BASE}{path}", json=data, headers=headers())
    if r.status_code not in ok:
        print(f"  PUT {path} → {r.status_code}: {r.text[:300]}")
        return None
    return r.json()


def get(path):
    r = requests.get(f"{BASE}{path}", headers=headers())
    if r.status_code != 200:
        print(f"  GET {path} → {r.status_code}: {r.text[:200]}")
        return None
    return r.json()


# ─── Auth ─────────────────────────────────────────────────────────────────────

def login(username, password):
    global TOKEN
    r = requests.post(f"{BASE}/auth/login",
                      json={"username": username, "password": password},
                      headers={"Content-Type": "application/json"})
    if r.status_code == 200:
        TOKEN = r.json()["access_token"]
        return True
    if r.status_code == 403:
        body = r.json()
        if body.get("detail", {}).get("reason") == "password_change_required":
            return "must_change"
    print(f"Login failed: {r.status_code} {r.text[:200]}")
    return False


def change_password(old, new):
    r = requests.post(f"{BASE}/auth/change-password",
                      json={"current_password": old, "new_password": new},
                      headers=headers())
    return r.status_code in (200, 204)


# ─── Utilities ────────────────────────────────────────────────────────────────

def ids(items):
    """Return list of UUIDs from a list of created objects."""
    return [i["id"] for i in items if i]


def section(name):
    print(f"\n{'─'*60}")
    print(f"  {name}")
    print(f"{'─'*60}")


# ─── Seed functions ───────────────────────────────────────────────────────────

def seed_users():
    section("Users")
    users = []
    for u in [
        {"username": "operator1", "email": "operator1@dc.local",
         "password": "Operator1!", "role": "operator"},
        {"username": "viewer1",   "email": "viewer1@dc.local",
         "password": "Viewer1!",   "role": "read_only"},
        {"username": "netadmin",  "email": "netadmin@dc.local",
         "password": "Netadmin1!", "role": "operator"},
    ]:
        result = post("/users", u, silent=True)
        if result:
            print(f"  + User: {u['username']} ({u['role']})")
        else:
            print(f"  ~ User already exists: {u['username']}")
        users.append(u["username"])
    return users


def seed_datacenters():
    section("Datacenters")
    dcs = []
    for dc in [
        {
            "name": "DC-EAST-01",
            "address": "100 Technology Pkwy, Suite 200",
            "city": "Ashburn",
            "country": "US",
            "total_power_kw": 2000,
            "total_cooling_kw": 1800,
            "pue": 1.45,
            "notes": "Primary production datacenter — Tier III"
        },
        {
            "name": "DC-WEST-DR",
            "address": "500 Data Center Blvd",
            "city": "Phoenix",
            "country": "US",
            "total_power_kw": 800,
            "total_cooling_kw": 700,
            "pue": 1.55,
            "notes": "Disaster recovery site — Tier II"
        },
    ]:
        r = post("/datacenters", dc)
        if r:
            print(f"  + Datacenter: {dc['name']}")
            dcs.append(r)
    return dcs


def seed_rooms(dc_id):
    section("Rooms")
    rooms = []
    for rm in [
        {
            "datacenter_id": dc_id,
            "name": "Hall A — Compute",
            "floor": 1,
            "cooling_type": "crah",
            "raised_floor": True,
            "width_m": 30.0,
            "depth_m": 20.0,
            "height_m": 3.5,
            "max_power_kw": 800.0,
            "notes": "Primary compute hall — 48 racks, N+1 cooling"
        },
        {
            "datacenter_id": dc_id,
            "name": "Hall B — Network Core",
            "floor": 1,
            "cooling_type": "in_row",
            "raised_floor": True,
            "width_m": 12.0,
            "depth_m": 10.0,
            "height_m": 3.5,
            "max_power_kw": 200.0,
            "notes": "Network spine, firewall cluster, WAN edge"
        },
        {
            "datacenter_id": dc_id,
            "name": "Hall C — Storage",
            "floor": 1,
            "cooling_type": "row_based",
            "raised_floor": True,
            "width_m": 15.0,
            "depth_m": 10.0,
            "height_m": 3.5,
            "max_power_kw": 300.0,
            "notes": "SAN arrays, NAS heads, tape library"
        },
    ]:
        r = post("/rooms", rm)
        if r:
            print(f"  + Room: {rm['name']}")
            rooms.append(r)
    return rooms


def seed_corridors(rooms):
    section("Corridors")
    corridors = []
    specs = [
        # Hall A — Compute: two hot/cold aisles
        (0, "Aisle A — Hot",  1),
        (0, "Aisle B — Cold", 2),
        # Hall B — Network Core: single corridor
        (1, "Main Corridor",  1),
        # Hall C — Storage: single corridor
        (2, "Storage Row",    1),
    ]
    for room_idx, name, position in specs:
        r = post("/corridors", {
            "room_id": rooms[room_idx]["id"],
            "name": name,
            "position": position,
        })
        if r:
            print(f"  + Corridor: {name} (in {rooms[room_idx]['name']})")
            corridors.append(r)
    return corridors


def seed_racks(corridors):
    section("Racks")
    racks = []
    specs = [
        # Hall A — Aisle A — Hot (corridor index 0)
        (0, "RA-01", "A", "1", 42, 10000, "front_to_back"),
        (0, "RA-02", "A", "2", 42, 10000, "front_to_back"),
        # Hall A — Aisle B — Cold (corridor index 1)
        (1, "RA-03", "A", "3", 42, 8000,  "front_to_back"),
        (1, "RA-04", "A", "4", 48, 12000, "front_to_back"),
        # Hall B — Main Corridor (corridor index 2)
        (2, "RB-01", "B", "1", 42, 6000,  "front_to_back"),
        (2, "RB-02", "B", "2", 42, 6000,  "front_to_back"),
        # Hall C — Storage Row (corridor index 3)
        (3, "RC-01", "C", "1", 42, 15000, "front_to_back"),
        (3, "RC-02", "C", "2", 42, 15000, "front_to_back"),
    ]
    for corridor_idx, name, row, col, total_u, max_power, airflow in specs:
        r = post("/racks", {
            "corridor_id": corridors[corridor_idx]["id"],
            "name": name,
            "row": row,
            "column": col,
            "total_u": total_u,
            "max_power_w": max_power,
            "airflow_direction": airflow,
            "power_feed_count": 2,
            "manufacturer": "APC",
            "model": "NetShelter SX 42U",
            "status": "active",
        })
        if r:
            print(f"  + Rack: {name}")
            racks.append(r)
    return racks


def seed_devices(racks):
    section("Devices")
    d = {}

    # ── Blade Chassis ──────────────────────────────────────────────
    chassis = post_or_get_device( {
        "name": "BLADE-CHASSIS-01",
        "device_type": "blade_chassis",
        "manufacturer": "Lenovo",
        "model": "ThinkSystem SN850 Flex System",
        "serial_number": "LC001122",
        "asset_tag": "AT-CHASSIS-01",
        "rack_id": racks[0]["id"],
        "rack_unit_start": 1, "rack_unit_size": 10,
        "face": "front",
        "power_rated_w": 6000,
        "power_actual_w": 4200,
        "status": "active",
        "management_ip": "10.0.1.50",
        "management_protocol": "xcc",
        "snmp_version": "v3",
        "purchase_date": "2022-01-15",
        "warranty_expiry": "2027-01-15",
        "end_of_support_date": "2029-01-15",
        "notes": "14-slot blade chassis — 8/14 slots populated",
    })
    if chassis:
        d["chassis"] = chassis
        print(f"  + Blade Chassis: BLADE-CHASSIS-01")

    # ── Blade Servers (in chassis) ─────────────────────────────────
    blades = []
    blade_specs = [
        ("BLADE-01", "SN850-B01", "10.0.1.51", 1),
        ("BLADE-02", "SN850-B02", "10.0.1.52", 2),
        ("BLADE-03", "SN850-B03", "10.0.1.53", 3),
        ("BLADE-04", "SN850-B04", "10.0.1.54", 4),
    ]
    for bname, bsn, bip, bslot in blade_specs:
        blade = post_or_get_device( {
            "name": bname,
            "device_type": "blade",
            "manufacturer": "Lenovo",
            "model": "ThinkSystem SN850 Compute Node",
            "serial_number": bsn,
            "rack_id": racks[0]["id"],
            "face": "front",
            "power_rated_w": 400,
            "power_actual_w": 280,
            "status": "active",
            "management_ip": bip,
            "management_protocol": "xcc",
            "purchase_date": "2022-01-15",
            "warranty_expiry": "2027-01-15",
        })
        if blade:
            blades.append(blade)
            print(f"  + Blade: {bname}")
            if chassis:
                put(f"/devices/{blade['id']}/server-detail", {
                    "form_factor": "blade",
                    "blade_chassis_id": chassis["id"],
                    "blade_slot": bslot,
                    "cpu_model": "Intel Xeon Platinum 8380",
                    "cpu_socket_count": 2,
                    "cpu_cores_per_socket": 40,
                    "cpu_threads_per_core": 2,
                    "ram_gb": 512,
                    "ram_max_gb": 3072,
                    "nic_count": 4,
                })
    d["blades"] = blades

    # ── Rack Servers (RA-01 and RA-02) ────────────────────────────
    server_specs = [
        ("SVR-PROD-01", "Dell",   "PowerEdge R750",     "SVC001", "10.0.1.1",  "idrac",  racks[0]["id"], 11, 2, 1200, 850),
        ("SVR-PROD-02", "Dell",   "PowerEdge R750",     "SVC002", "10.0.1.2",  "idrac",  racks[0]["id"], 13, 2, 1200, 820),
        ("SVR-PROD-03", "Dell",   "PowerEdge R750",     "SVC003", "10.0.1.3",  "idrac",  racks[0]["id"], 15, 2, 1200, 900),
        ("SVR-PROD-04", "Dell",   "PowerEdge R650xs",   "SVC004", "10.0.1.4",  "idrac",  racks[0]["id"], 17, 1, 750,  480),
        ("SVR-PROD-05", "Lenovo", "ThinkSystem SR650 V3","SVL001", "10.0.1.5",  "xcc",    racks[1]["id"],  1, 2, 1100, 740),
        ("SVR-PROD-06", "Lenovo", "ThinkSystem SR650 V3","SVL002", "10.0.1.6",  "xcc",    racks[1]["id"],  3, 2, 1100, 760),
        ("SVR-PROD-07", "HPE",    "ProLiant DL380 Gen11","SVH001", "10.0.1.7",  "ilo",    racks[1]["id"],  5, 2, 1000, 680),
        ("SVR-PROD-08", "HPE",    "ProLiant DL360 Gen11","SVH002", "10.0.1.8",  "ilo",    racks[1]["id"],  7, 1, 600,  400),
        # Maintenance server
        ("SVR-DEV-01",  "Dell",   "PowerEdge R740",     "SVC100", "10.0.1.20", "idrac",  racks[2]["id"],  1, 2, 800,  0),
        # Spare
        ("SVR-SPARE-01","Dell",   "PowerEdge R750",     "SVC200", None,        None,     racks[2]["id"],  3, 2, 1200, 0),
    ]
    servers = []
    statuses = ["active","active","active","active","active","active","active","active","maintenance","spare"]
    eol_dates = ["2028-01-01","2028-01-01","2028-01-01","2027-06-01",
                 "2029-01-01","2029-01-01","2028-06-01","2028-06-01",
                 "2026-06-01","2028-01-01"]
    for i, (name, mfr, model, sn, ip, proto, rack_id, u, usize, rated, actual) in enumerate(server_specs):
        s = post_or_get_device( {
            "name": name, "device_type": "server",
            "manufacturer": mfr, "model": model, "serial_number": sn,
            "rack_id": rack_id, "rack_unit_start": u, "rack_unit_size": usize,
            "face": "front", "power_rated_w": rated, "power_actual_w": actual,
            "status": statuses[i],
            "management_ip": ip, "management_protocol": proto,
            "snmp_version": "v2c",
            "purchase_date": "2022-03-01",
            "warranty_expiry": "2027-03-01",
            "end_of_support_date": eol_dates[i],
            "end_of_life_date": eol_dates[i],
            "notes": f"Production compute — {mfr} {model}",
        })
        if s:
            servers.append(s)
            print(f"  + Server: {name}")
            put(f"/devices/{s['id']}/server-detail", {
                "form_factor": "2u" if usize == 2 else "1u",
                "cpu_model": "Intel Xeon Gold 6338" if mfr in ("Dell","HPE") else "AMD EPYC 9354",
                "cpu_socket_count": 2,
                "cpu_cores_per_socket": 32,
                "cpu_threads_per_core": 2,
                "ram_gb": 256 + i * 64,
                "ram_max_gb": 4096,
                "ram_slots_total": 32,
                "ram_slots_used": 16,
                "nic_count": 4,
                "hba_count": 2,
                "bios_version": f"2.{i+1}.0",
                "bmc_firmware_version": f"5.{i+1}.0",
            })
    d["servers"] = servers

    # ── Switches ──────────────────────────────────────────────────
    switch_specs = [
        ("SW-SPINE-01", "Cisco",  "Nexus 9336C-FX2",  "SWC001", "10.0.0.1", racks[4]["id"],  1, 2, 400, 320),
        ("SW-SPINE-02", "Cisco",  "Nexus 9336C-FX2",  "SWC002", "10.0.0.2", racks[4]["id"],  3, 2, 400, 310),
        ("SW-LEAF-01",  "Cisco",  "Nexus 93180YC-FX", "SWC003", "10.0.0.10",racks[4]["id"],  5, 1, 300, 220),
        ("SW-LEAF-02",  "Cisco",  "Nexus 93180YC-FX", "SWC004", "10.0.0.11",racks[4]["id"],  6, 1, 300, 210),
        ("SW-MGMT-01",  "Arista", "DCS-7050TX-64",    "SWA001", "10.0.0.20",racks[5]["id"],  1, 1, 200, 150),
        ("SW-OOB-01",   "Cisco",  "Catalyst 2960XR",  "SWC010", "10.0.0.30",racks[5]["id"],  2, 1, 150, 90),
    ]
    switches = []
    for name, mfr, model, sn, ip, rack_id, u, usize, rated, actual in switch_specs:
        s = post_or_get_device( {
            "name": name, "device_type": "switch",
            "manufacturer": mfr, "model": model, "serial_number": sn,
            "rack_id": rack_id, "rack_unit_start": u, "rack_unit_size": usize,
            "face": "front", "power_rated_w": rated, "power_actual_w": actual,
            "status": "active",
            "management_ip": ip, "management_protocol": "snmp",
            "snmp_version": "v2c", "snmp_community": "public",
            "purchase_date": "2021-06-01", "warranty_expiry": "2026-06-01",
            "end_of_support_date": "2028-06-01",
        })
        if s:
            switches.append(s)
            print(f"  + Switch: {name}")
            put(f"/devices/{s['id']}/network-detail", {
                "os_type": "nxos" if mfr == "Cisco" and "Nexus" in model else ("eos" if mfr == "Arista" else "ios"),
                "os_version": "10.3(3)F" if mfr == "Arista" else "9.3(10)" if "Nexus" in model else "15.2(7)E5",
                "port_count": 64 if "9336" in model else 48,
                "uplink_port_count": 8,
                "management_vlan": 99,
                "spanning_tree_mode": "mstp",
                "spanning_tree_priority": 4096 if "SPINE" in name else 8192,
            })
    d["switches"] = switches

    # ── Routers ───────────────────────────────────────────────────
    routers = []
    for name, sn, ip, rack_id, u in [
        ("RTR-WAN-01", "RTC001", "10.0.0.100", racks[4]["id"], 8),
        ("RTR-WAN-02", "RTC002", "10.0.0.101", racks[5]["id"], 4),
    ]:
        r = post_or_get_device( {
            "name": name, "device_type": "router",
            "manufacturer": "Cisco", "model": "ASR 1002-HX",
            "serial_number": sn, "rack_id": rack_id,
            "rack_unit_start": u, "rack_unit_size": 2,
            "face": "front", "power_rated_w": 500, "power_actual_w": 350,
            "status": "active",
            "management_ip": ip, "management_protocol": "ssh",
            "purchase_date": "2021-01-01", "warranty_expiry": "2026-01-01",
        })
        if r:
            routers.append(r)
            print(f"  + Router: {name}")
    d["routers"] = routers

    # ── Firewalls ─────────────────────────────────────────────────
    firewalls = []
    for name, sn, ip, rack_id, u in [
        ("FW-EDGE-01", "FWF001", "10.0.0.200", racks[4]["id"], 10),
        ("FW-EDGE-02", "FWF002", "10.0.0.201", racks[5]["id"],  6),
    ]:
        fw = post_or_get_device( {
            "name": name, "device_type": "firewall",
            "manufacturer": "Fortinet", "model": "FortiGate 3400E",
            "serial_number": sn, "rack_id": rack_id,
            "rack_unit_start": u, "rack_unit_size": 3,
            "face": "front", "power_rated_w": 700, "power_actual_w": 480,
            "status": "active",
            "management_ip": ip, "management_protocol": "api",
            "purchase_date": "2022-06-01", "warranty_expiry": "2027-06-01",
            "notes": "HA pair — active/passive",
        })
        if fw:
            firewalls.append(fw)
            print(f"  + Firewall: {name}")
    d["firewalls"] = firewalls

    # ── Storage Arrays ────────────────────────────────────────────
    storage_devices = []
    for name, sn, ip, rack_id, u in [
        ("SAN-AFF-01", "NTA001", "10.0.2.1", racks[6]["id"],  1),
        ("SAN-AFF-02", "NTA002", "10.0.2.2", racks[6]["id"],  5),
        ("NAS-FAS-01", "NTF001", "10.0.2.10",racks[7]["id"],  1),
    ]:
        st = post_or_get_device( {
            "name": name, "device_type": "storage",
            "manufacturer": "NetApp",
            "model": "AFF A800" if "AFF" in name else "FAS8700",
            "serial_number": sn, "rack_id": rack_id,
            "rack_unit_start": u, "rack_unit_size": 4,
            "face": "front", "power_rated_w": 2000, "power_actual_w": 1400,
            "status": "active",
            "management_ip": ip, "management_protocol": "api",
            "purchase_date": "2022-09-01", "warranty_expiry": "2027-09-01",
        })
        if st:
            storage_devices.append(st)
            print(f"  + Storage: {name}")
    d["storage"] = storage_devices

    # ── PDUs ──────────────────────────────────────────────────────
    pdus = []
    pdu_specs = [
        ("PDU-RA01-A", "APCA001", racks[0]["id"], 40),
        ("PDU-RA01-B", "APCA002", racks[0]["id"], 41),
        ("PDU-RB01-A", "APCA003", racks[4]["id"], 40),
        ("PDU-RC01-A", "APCA004", racks[6]["id"], 40),
    ]
    for name, sn, rack_id, u in pdu_specs:
        p = post_or_get_device( {
            "name": name, "device_type": "pdu",
            "manufacturer": "APC", "model": "AP8959EU3",
            "serial_number": sn, "rack_id": rack_id,
            "rack_unit_start": u, "rack_unit_size": 1,
            "face": "rear", "power_rated_w": 7200, "power_actual_w": 4800,
            "status": "active",
        })
        if p:
            pdus.append(p)
            print(f"  + PDU: {name}")
            put(f"/devices/{p['id']}/pdu-detail", {
                "outlet_count": 24,
                "outlet_type": "C13",
                "input_voltage": 230,
                "input_current_max_a": 32.0,
                "is_metered": True,
                "is_switched": True,
                "current_load_w": 4800,
            })
    d["pdus"] = pdus

    # ── Patch Panels ──────────────────────────────────────────────
    patches = []
    for name, sn, rack_id, u in [
        ("PP-RA01-01", "PP001", racks[0]["id"], 42),
        ("PP-RB01-01", "PP002", racks[4]["id"], 42),
    ]:
        pp = post_or_get_device( {
            "name": name, "device_type": "patch_panel",
            "manufacturer": "Panduit", "model": "CPPL24WBLY",
            "serial_number": sn, "rack_id": rack_id,
            "rack_unit_start": u, "rack_unit_size": 1,
            "face": "front", "status": "active",
        })
        if pp:
            patches.append(pp)
            print(f"  + Patch Panel: {name}")
    d["patches"] = patches

    # ── Load Balancer ─────────────────────────────────────────────
    lb = post_or_get_device( {
        "name": "LB-F5-01",
        "device_type": "load_balancer",
        "manufacturer": "F5",
        "model": "BIG-IP i5800",
        "serial_number": "F5LB001",
        "rack_id": racks[5]["id"],
        "rack_unit_start": 8, "rack_unit_size": 2,
        "face": "front", "power_rated_w": 800, "power_actual_w": 550,
        "status": "active",
        "management_ip": "10.0.0.250", "management_protocol": "api",
        "purchase_date": "2023-01-01", "warranty_expiry": "2028-01-01",
    })
    if lb:
        d["lb"] = lb
        print(f"  + Load Balancer: LB-F5-01")

    # ── KVM ───────────────────────────────────────────────────────
    kvm = post_or_get_device( {
        "name": "KVM-RA01-01",
        "device_type": "kvm",
        "manufacturer": "Raritan", "model": "Dominion KX IV-101",
        "serial_number": "KVM001",
        "rack_id": racks[0]["id"],
        "rack_unit_start": 19, "rack_unit_size": 1,
        "face": "front", "status": "active",
        "management_ip": "10.0.1.250",
    })
    if kvm:
        d["kvm"] = kvm
        print(f"  + KVM: KVM-RA01-01")

    return d


def seed_licenses(devices):
    section("Licenses")
    licenses = []
    server_ids = ids(devices.get("servers", []))
    storage_ids = ids(devices.get("storage", []))
    lb_id = devices.get("lb", {}).get("id")

    specs = []
    # OS + management licenses per server
    for i, sid in enumerate(server_ids[:4]):
        specs += [
            {
                "device_id": sid,
                "product_name": "Windows Server 2022 Datacenter",
                "vendor": "Microsoft",
                "license_type": "per_socket",
                "quantity": 2,
                "purchase_date": "2022-03-01",
                "expiry_date": None,
                "cost_usd": 6155.00,
                "notes": "2-socket perpetual license",
            },
            {
                "device_id": sid,
                "product_name": "Dell OpenManage Enterprise",
                "vendor": "Dell",
                "license_type": "perpetual",
                "quantity": 1,
                "purchase_date": "2022-03-01",
                "expiry_date": "2027-03-01",
                "cost_usd": 299.00,
            },
        ]
    # Expiring soon licenses (to populate alerts)
    if server_ids:
        specs.append({
            "device_id": server_ids[0],
            "product_name": "Veritas NetBackup Client",
            "vendor": "Veritas",
            "license_type": "subscription",
            "quantity": 1,
            "purchase_date": "2023-04-01",
            "expiry_date": (datetime.date.today() + datetime.timedelta(days=20)).isoformat(),
            "cost_usd": 1200.00,
            "renewal_reminder_days": 90,
            "notes": "CRITICAL — expiring in 20 days",
        })
        specs.append({
            "device_id": server_ids[1],
            "product_name": "Zerto Replication",
            "vendor": "Zerto",
            "license_type": "per_vm",
            "quantity": 50,
            "purchase_date": "2023-01-01",
            "expiry_date": (datetime.date.today() + datetime.timedelta(days=45)).isoformat(),
            "cost_usd": 8000.00,
            "renewal_reminder_days": 90,
            "notes": "Expiring in 45 days",
        })
    # Storage
    for sid in storage_ids[:2]:
        specs.append({
            "device_id": sid,
            "product_name": "NetApp ONTAP Enterprise Bundle",
            "vendor": "NetApp",
            "license_type": "subscription",
            "quantity": 1,
            "purchase_date": "2022-09-01",
            "expiry_date": "2025-09-01",
            "cost_usd": 25000.00,
            "notes": "All ONTAP features — storage and data management",
        })
    # Load balancer
    if lb_id:
        specs.append({
            "device_id": lb_id,
            "product_name": "F5 BIG-IP Advanced WAF",
            "vendor": "F5",
            "license_type": "subscription",
            "quantity": 1,
            "purchase_date": "2023-01-01",
            "expiry_date": "2026-01-01",
            "cost_usd": 15000.00,
        })
    # Site-wide license (no device)
    specs.append({
        "product_name": "Veeam Backup & Replication Enterprise Plus",
        "vendor": "Veeam",
        "license_type": "site",
        "quantity": 1,
        "purchase_date": "2023-01-01",
        "expiry_date": "2026-01-01",
        "cost_usd": 12000.00,
        "notes": "Covers all physical and virtual workloads in DC-EAST-01",
    })

    for spec in specs:
        r = post("/licenses", spec)
        if r:
            licenses.append(r)
    print(f"  + {len(licenses)} licenses created")
    return licenses


def seed_vlans():
    section("VLANs")
    vlans = []
    specs = [
        (10,  "MGMT",       "Out-of-band management network",     "#3B82F6"),
        (20,  "PROD",       "Production application traffic",     "#10B981"),
        (30,  "STORAGE-FC", "FC SAN management traffic",          "#8B5CF6"),
        (40,  "STORAGE-IP", "iSCSI / NFS / S3 storage traffic",   "#F59E0B"),
        (50,  "VMOTION",    "VMware vMotion live migration",       "#06B6D4"),
        (60,  "BACKUP",     "Backup and replication traffic",      "#EC4899"),
        (70,  "DMZ",        "DMZ — internet-facing services",      "#EF4444"),
        (99,  "NATIVE",     "Native/untagged VLAN",                "#6B7280"),
        (100, "SERVERS",    "Server provisioning VLAN",            "#84CC16"),
        (200, "OOB",        "Out-of-band / IPMI network",          "#F97316"),
    ]
    for vid, name, desc, color in specs:
        r = post("/vlans", {"vlan_id": vid, "name": name, "description": desc, "color": color})
        if r:
            vlans.append(r)
            print(f"  + VLAN {vid}: {name}")
    return vlans


def seed_ip_networks(vlans):
    section("IP Networks")
    nets = []
    vlan_by_name = {v["name"]: v["id"] for v in vlans}

    specs = [
        ("10.0.0.0/24",   "DC Management Subnet",     "10.0.0.1",   vlan_by_name.get("MGMT"),       "management"),
        ("10.0.1.0/24",   "Server BMC / OOB Subnet",  "10.0.1.1",   vlan_by_name.get("OOB"),        "oob"),
        ("10.0.2.0/24",   "Storage iSCSI Subnet",     "10.0.2.1",   vlan_by_name.get("STORAGE-IP"), "storage"),
        ("10.0.3.0/24",   "vMotion Subnet",            "10.0.3.1",   vlan_by_name.get("VMOTION"),    "vmotion"),
        ("10.0.4.0/24",   "Backup Network",            "10.0.4.1",   vlan_by_name.get("BACKUP"),     "backup"),
        ("10.10.0.0/16",  "Production App Network",   "10.10.0.1",  vlan_by_name.get("PROD"),        "production"),
        ("172.16.0.0/24", "DMZ Subnet",               "172.16.0.1", vlan_by_name.get("DMZ"),        "dmz"),
        ("10.0.100.0/24", "Server Provisioning DHCP", "10.0.100.1", vlan_by_name.get("SERVERS"),    "production"),
    ]
    for cidr, name, gw, vlan_id, purpose in specs:
        payload = {
            "cidr": cidr, "name": name, "gateway": gw,
            "purpose": purpose, "dhcp_enabled": purpose == "production",
        }
        if vlan_id:
            payload["vlan_id"] = vlan_id
        r = post("/ip-networks", payload)
        if r:
            nets.append(r)
            print(f"  + IP Network: {cidr} ({name})")
    return nets


def seed_interfaces(devices):
    section("Network Interfaces")
    ifaces = {}

    def add_ifaces(device_key, iface_list):
        dev_list = devices.get(device_key, [])
        if not isinstance(dev_list, list):
            dev_list = [dev_list]
        for dev, specs in zip(dev_list, iface_list):
            if not dev:
                continue
            dev_ifaces = []
            for spec in specs:
                spec["device_id"] = dev["id"]
                r = post("/interfaces", spec)
                if r:
                    dev_ifaces.append(r)
            ifaces[dev["id"]] = dev_ifaces
        return ifaces

    # Servers — each gets 2 copper + 2 SFP+
    for i, srv in enumerate(devices.get("servers", [])[:6]):
        srv_ifaces = []
        for j, (name, media, speed, is_mgmt) in enumerate([
            (f"eth0",   "copper_rj45", 1000,  True),
            (f"eth1",   "copper_rj45", 1000,  False),
            (f"eth2",   "sfp_plus",    10000, False),
            (f"eth3",   "sfp_plus",    10000, False),
            (f"hba0",   "fc",          16000, False),
            (f"hba1",   "fc",          16000, False),
        ]):
            r = post("/interfaces", {
                "device_id": srv["id"],
                "name": name, "media_type": media,
                "speed_mbps": speed,
                "is_management": is_mgmt,
                "status": "up",
                "duplex": "full" if media == "copper_rj45" else None,
                "mtu": 1500 if media == "copper_rj45" else 9000,
            })
            if r:
                srv_ifaces.append(r)
        ifaces[srv["id"]] = srv_ifaces
        print(f"  + {len(srv_ifaces)} interfaces on {srv['name']}")

    # Spine switches — 36x QSFP28 uplinks
    for sw in devices.get("switches", [])[:2]:
        sw_ifaces = []
        for j in range(1, 5):
            r = post("/interfaces", {
                "device_id": sw["id"],
                "name": f"Ethernet1/{j}", "media_type": "qsfp28",
                "speed_mbps": 100000, "is_uplink": True,
                "status": "up", "mtu": 9216,
            })
            if r:
                sw_ifaces.append(r)
        for j in range(5, 37):
            r = post("/interfaces", {
                "device_id": sw["id"],
                "name": f"Ethernet1/{j}", "media_type": "sfp28",
                "speed_mbps": 25000, "is_uplink": False,
                "status": "up", "mtu": 9216,
            })
            if r:
                sw_ifaces.append(r)
        ifaces[sw["id"]] = sw_ifaces
        print(f"  + {len(sw_ifaces)} interfaces on {sw['name']}")

    # Leaf switches — 48x SFP+ + 6x QSFP28 uplinks
    for sw in devices.get("switches", [])[2:4]:
        sw_ifaces = []
        for j in range(1, 49):
            r = post("/interfaces", {
                "device_id": sw["id"],
                "name": f"Ethernet1/{j}", "media_type": "sfp_plus",
                "speed_mbps": 10000, "status": "up", "mtu": 9216,
            })
            if r:
                sw_ifaces.append(r)
        for j in range(49, 55):
            r = post("/interfaces", {
                "device_id": sw["id"],
                "name": f"Ethernet1/{j}", "media_type": "qsfp28",
                "speed_mbps": 100000, "is_uplink": True, "status": "up", "mtu": 9216,
            })
            if r:
                sw_ifaces.append(r)
        ifaces[sw["id"]] = sw_ifaces
        print(f"  + {len(sw_ifaces)} interfaces on {sw['name']}")

    # Routers — 4 interfaces each
    for rtr in devices.get("routers", []):
        rtr_ifaces = []
        for name, media, speed, uplink in [
            ("GigabitEthernet0/0/0", "copper_rj45", 1000,  False),
            ("GigabitEthernet0/0/1", "copper_rj45", 1000,  False),
            ("TenGigE0/0/0/0",       "sfp_plus",    10000, True),
            ("TenGigE0/0/0/1",       "sfp_plus",    10000, True),
        ]:
            r = post("/interfaces", {
                "device_id": rtr["id"],
                "name": name, "media_type": media,
                "speed_mbps": speed, "is_uplink": uplink, "status": "up",
            })
            if r:
                rtr_ifaces.append(r)
        ifaces[rtr["id"]] = rtr_ifaces
        print(f"  + {len(rtr_ifaces)} interfaces on {rtr['name']}")

    # Firewalls
    for fw in devices.get("firewalls", []):
        fw_ifaces = []
        for name, media in [
            ("port1", "copper_rj45"),
            ("port2", "copper_rj45"),
            ("port3", "sfp_plus"),
            ("port4", "sfp_plus"),
        ]:
            r = post("/interfaces", {
                "device_id": fw["id"],
                "name": name, "media_type": media,
                "speed_mbps": 10000, "status": "up",
            })
            if r:
                fw_ifaces.append(r)
        ifaces[fw["id"]] = fw_ifaces
        print(f"  + {len(fw_ifaces)} interfaces on {fw['name']}")

    # Storage — FC HBAs
    for st in devices.get("storage", []):
        st_ifaces = []
        for name in ["0a", "0b", "0c", "0d"]:
            r = post("/interfaces", {
                "device_id": st["id"],
                "name": f"fc-{name}", "media_type": "fc",
                "speed_mbps": 32000, "status": "up",
            })
            if r:
                st_ifaces.append(r)
        ifaces[st["id"]] = st_ifaces
        print(f"  + {len(st_ifaces)} interfaces on {st['name']}")

    return ifaces


def seed_links(devices, ifaces):
    section("Network Links")
    links = []

    def link(src_dev_id, src_idx, tgt_dev_id, tgt_idx, link_type="ethernet", speed=10000):
        src_ifaces = ifaces.get(src_dev_id, [])
        tgt_ifaces = ifaces.get(tgt_dev_id, [])
        if src_idx >= len(src_ifaces) or tgt_idx >= len(tgt_ifaces):
            return
        r = post("/links", {
            "source_interface_id": src_ifaces[src_idx]["id"],
            "target_interface_id": tgt_ifaces[tgt_idx]["id"],
            "link_type": link_type,
            "speed_mbps": speed,
            "status": "active",
        })
        if r:
            links.append(r)
        return r

    servers = devices.get("servers", [])
    switches = devices.get("switches", [])
    routers = devices.get("routers", [])
    firewalls = devices.get("firewalls", [])

    # Servers → Leaf switches (eth2/eth3 → leaf ports)
    leaf1 = switches[2] if len(switches) > 2 else None
    leaf2 = switches[3] if len(switches) > 3 else None

    for i, srv in enumerate(servers[:6]):
        if leaf1:
            link(srv["id"], 2, leaf1["id"], i * 2,     "ethernet", 10000)
        if leaf2:
            link(srv["id"], 3, leaf2["id"], i * 2 + 1, "ethernet", 10000)

    # Leaf → Spine uplinks (QSFP28 100G)
    spine1 = switches[0] if switches else None
    spine2 = switches[1] if len(switches) > 1 else None

    if leaf1 and spine1:
        link(leaf1["id"], 48, spine1["id"], 0, "fiber_sm", 100000)
    if leaf1 and spine2:
        link(leaf1["id"], 49, spine2["id"], 0, "fiber_sm", 100000)
    if leaf2 and spine1:
        link(leaf2["id"], 48, spine1["id"], 1, "fiber_sm", 100000)
    if leaf2 and spine2:
        link(leaf2["id"], 49, spine2["id"], 1, "fiber_sm", 100000)

    # Spine → Router uplinks
    for i, rtr in enumerate(routers):
        if spine1:
            link(spine1["id"], 2 + i, rtr["id"], 2, "fiber_sm", 10000)
        if spine2:
            link(spine2["id"], 2 + i, rtr["id"], 3, "fiber_sm", 10000)

    # Router → Firewall
    for i, (rtr, fw) in enumerate(zip(routers, firewalls)):
        link(rtr["id"], 0, fw["id"], 0, "ethernet", 1000)
        link(rtr["id"], 1, fw["id"], 1, "ethernet", 1000)

    # FC links: servers → storage
    storage = devices.get("storage", [])
    for srv in servers[:4]:
        srv_ifaces = ifaces.get(srv["id"], [])
        fc_ifaces = [i for i in srv_ifaces if i["media_type"] == "fc"]
        for j, st in enumerate(storage[:2]):
            st_ifaces = ifaces.get(st["id"], [])
            st_fc = [i for i in st_ifaces if i["media_type"] == "fc"]
            if fc_ifaces and j < len(st_fc):
                r = post("/links", {
                    "source_interface_id": fc_ifaces[min(j, len(fc_ifaces)-1)]["id"],
                    "target_interface_id": st_fc[j]["id"],
                    "link_type": "fc",
                    "speed_mbps": 16000,
                    "status": "active",
                })
                if r:
                    links.append(r)

    print(f"  + {len(links)} network links created")
    return links


def seed_ip_addresses(devices, ifaces, ip_networks):
    section("IP Addresses")
    ips = []

    # Find subnet IDs
    mgmt_net = next((n for n in ip_networks if "Management" in n["name"]), None)
    bmc_net  = next((n for n in ip_networks if "BMC" in n["name"]), None)
    prod_net = next((n for n in ip_networks if "Production App" in n["name"]), None)
    stor_net = next((n for n in ip_networks if "iSCSI" in n["name"]), None)

    all_assignments = []

    # Management IPs for switches/routers/firewalls
    for i, sw in enumerate(devices.get("switches", [])):
        all_assignments.append((f"10.0.0.{10+i}", mgmt_net, sw["id"], None, "in_use", "static"))
    for i, rtr in enumerate(devices.get("routers", [])):
        all_assignments.append((f"10.0.0.{100+i}", mgmt_net, rtr["id"], None, "in_use", "static"))
    for i, fw in enumerate(devices.get("firewalls", [])):
        all_assignments.append((f"10.0.0.{200+i}", mgmt_net, fw["id"], None, "in_use", "static"))

    # BMC IPs for servers
    for i, srv in enumerate(devices.get("servers", [])):
        all_assignments.append((f"10.0.1.{i+1}", bmc_net, srv["id"], None, "in_use", "static"))

    # Server data-plane IPs via interfaces (eth0)
    for i, srv in enumerate(devices.get("servers", [])[:6]):
        srv_ifaces = ifaces.get(srv["id"], [])
        eth0 = srv_ifaces[0] if srv_ifaces else None
        ip = f"10.10.{i//10}.{(i%10)*10+1}"
        all_assignments.append((ip, prod_net, srv["id"],
                                eth0["id"] if eth0 else None, "in_use", "static"))

    # Storage IPs
    for i, st in enumerate(devices.get("storage", [])):
        all_assignments.append((f"10.0.2.{i+100}", stor_net, st["id"], None, "in_use", "static"))

    # Available IPs in prod network
    for i in range(5):
        all_assignments.append((f"10.10.0.{200+i}", prod_net, None, None, "available", "static"))

    # Reserved gateway IPs
    for net_cidr, ip in [("10.0.0.0/24","10.0.0.1"), ("10.10.0.0/16","10.10.0.1")]:
        net = next((n for n in ip_networks if n.get("cidr") == net_cidr), None)
        all_assignments.append((ip, net, None, None, "reserved", "reserved"))

    for addr, net, dev_id, iface_id, status, atype in all_assignments:
        payload = {
            "address": addr,
            "status": status,
            "assignment_type": atype,
        }
        if net:
            payload["subnet_id"] = net["id"]
        if dev_id:
            payload["device_id"] = dev_id
        if iface_id:
            payload["interface_id"] = iface_id
        r = post("/ip-addresses", payload, silent=True)
        if r:
            ips.append(r)

    print(f"  + {len(ips)} IP addresses created")
    return ips


def seed_san_fabrics():
    section("SAN Fabrics")
    fabrics = []
    for name, ftype, speed, wwn in [
        ("FC-FABRIC-A", "fc",    32, "20:00:00:0d:ec:00:aa:01"),
        ("FC-FABRIC-B", "fc",    32, "20:00:00:0d:ec:00:aa:02"),
        ("ISCSI-FAB-01","iscsi", 10, None),
        ("NVME-FAB-01", "nvme_of", 100, None),
    ]:
        r = post("/san-fabrics", {
            "name": name, "fabric_type": ftype,
            "speed_gbps": speed,
            **({"wwn": wwn} if wwn else {}),
        })
        if r:
            fabrics.append(r)
            print(f"  + SAN Fabric: {name}")
    return fabrics


def seed_virt_clusters():
    section("Virtualization Clusters")
    clusters = []
    for name, platform, mgmt_url, ha, drs, vcpu, ram_gb, storage_tb in [
        ("PROD-VSPHERE-01", "vmware_vsphere", "https://vcenter.dc.local",
         True,  True,  512, 2048, 200.0),
        ("PROD-PROXMOX-01", "proxmox",        "https://proxmox.dc.local:8006",
         True,  False, 256, 1024, 100.0),
        ("DR-HYPERV-01",    "hyper_v",        "https://scvmm.dc.local",
         True,  False, 128, 512,  50.0),
        ("DEV-XCP-01",      "xcp_ng",         "https://xcp.dc.local",
         False, False, 64,  256,  20.0),
    ]:
        r = post("/virt/clusters", {
            "name": name, "platform": platform,
            "management_url": mgmt_url,
            "management_username": "administrator",
            "ha_enabled": ha, "drs_enabled": drs,
            "total_vcpu": vcpu, "total_ram_gb": ram_gb,
            "total_storage_tb": storage_tb,
            "notes": f"{platform.replace('_', ' ').title()} cluster — {vcpu} vCPUs / {ram_gb} GB RAM",
        })
        if r:
            clusters.append(r)
            print(f"  + Virt Cluster: {name} ({platform})")
    return clusters


def seed_virt_hosts(clusters, devices):
    section("Virtualization Hosts")
    hosts = []
    servers = devices.get("servers", [])
    vsphere = clusters[0] if clusters else None
    proxmox = clusters[1] if len(clusters) > 1 else None

    # VMware ESXi hosts (servers 0-3)
    if vsphere:
        for i, srv in enumerate(servers[:4]):
            r = post("/virt/hosts", {
                "cluster_id": vsphere["id"],
                "device_id": srv["id"],
                "platform_version": "ESXi 8.0 Update 3",
                "platform_uuid": f"4235-{1000+i:04d}-abcd-efgh-{i:012d}",
                "vcpu_allocated": 80 + i * 20,
                "ram_allocated_gb": 200 + i * 50,
                "is_in_maintenance": (i == 3),
                "platform_data": {
                    "moref": f"host-{100+i}",
                    "connection_state": "connected",
                    "power_state": "poweredOn",
                    "num_cpu_threads": 128,
                    "config_manager_ip": srv.get("management_ip", ""),
                },
            })
            if r:
                hosts.append(r)
                print(f"  + vHost (ESXi): {srv['name']}")

    # Proxmox hosts (servers 4-5)
    if proxmox:
        for i, srv in enumerate(servers[4:6]):
            r = post("/virt/hosts", {
                "cluster_id": proxmox["id"],
                "device_id": srv["id"],
                "platform_version": "Proxmox VE 8.1",
                "platform_uuid": f"pve-node-{i+1:04d}",
                "vcpu_allocated": 60 + i * 10,
                "ram_allocated_gb": 150,
                "is_in_maintenance": False,
                "platform_data": {
                    "node_name": f"pve{i+1:02d}",
                    "status": "online",
                },
            })
            if r:
                hosts.append(r)
                print(f"  + vHost (Proxmox): {srv['name']}")

    return hosts


def seed_vms(hosts):
    section("Virtual Machines")
    vms = []

    vm_specs = [
        # (name, status, os_type, os_version, vcpu, ram_gb, storage_gb, is_template)
        ("VM-WEB-01",      "running",  "linux",   "Ubuntu 22.04 LTS",    4,  8,  100, False),
        ("VM-WEB-02",      "running",  "linux",   "Ubuntu 22.04 LTS",    4,  8,  100, False),
        ("VM-APP-01",      "running",  "windows", "Windows Server 2022", 8,  32, 200, False),
        ("VM-APP-02",      "running",  "windows", "Windows Server 2022", 8,  32, 200, False),
        ("VM-DB-01",       "running",  "linux",   "RHEL 9.3",           16,  64, 500, False),
        ("VM-DB-02",       "running",  "linux",   "RHEL 9.3",           16,  64, 500, False),
        ("VM-MSSQL-01",    "running",  "windows", "Windows Server 2022", 8,  64, 500, False),
        ("VM-DNS-01",      "running",  "linux",   "Ubuntu 22.04 LTS",    2,   4,  50, False),
        ("VM-DNS-02",      "running",  "linux",   "Ubuntu 22.04 LTS",    2,   4,  50, False),
        ("VM-MONITOR-01",  "running",  "linux",   "Debian 12",           4,  16, 200, False),
        ("VM-BACKUP-SRV",  "running",  "windows", "Windows Server 2022", 4,  16, 100, False),
        ("VM-JENKINS-01",  "running",  "linux",   "Ubuntu 22.04 LTS",    4,  16, 200, False),
        ("VM-K8S-MASTER",  "running",  "linux",   "Ubuntu 22.04 LTS",    8,  16, 100, False),
        ("VM-K8S-NODE-01", "running",  "linux",   "Ubuntu 22.04 LTS",    8,  32, 200, False),
        ("VM-K8S-NODE-02", "running",  "linux",   "Ubuntu 22.04 LTS",    8,  32, 200, False),
        ("VM-STOPPED-01",  "stopped",  "windows", "Windows Server 2019", 4,   8,  80, False),
        ("VM-SUSPENDED-01","suspended","linux",   "CentOS 7.9",          2,   4,  40, False),
        ("TMPL-WIN2022",   "stopped",  "windows", "Windows Server 2022", 2,   8,  80, True),
        ("TMPL-UBUNTU22",  "stopped",  "linux",   "Ubuntu 22.04 LTS",    2,   4,  40, True),
    ]

    for i, (name, status, os_type, os_ver, vcpu, ram, storage, is_tmpl) in enumerate(vm_specs):
        host = hosts[i % len(hosts)] if hosts else None
        if not host:
            continue
        r = post("/virt/vms", {
            "host_id": host["id"],
            "name": name,
            "platform_vm_id": f"vm-{1000+i}",
            "status": status,
            "os_type": os_type,
            "os_version": os_ver,
            "vcpu_count": vcpu,
            "ram_gb": ram,
            "storage_gb": storage,
            "tools_version": "12.3.0" if os_type == "linux" else "12.3.0",
            "is_template": is_tmpl,
            "snapshot_count": 0 if is_tmpl else (i % 3),
            "platform_data": {
                "moref": f"vm-{1000+i}",
                "datastore": "VMFS-DS01",
                "vmx_path": f"[VMFS-DS01] {name}/{name}.vmx",
            },
            "notes": f"{'Template' if is_tmpl else 'Production VM'} — {os_ver}",
        })
        if r:
            vms.append(r)
    print(f"  + {len(vms)} VMs created")
    return vms


def seed_datastores(clusters, san_fabrics):
    section("Datastores")
    ds = []
    vsphere = clusters[0] if clusters else None
    proxmox = clusters[1] if len(clusters) > 1 else None
    fc_fab  = san_fabrics[0] if san_fabrics else None

    specs_vsphere = [
        ("VMFS-DS01",   "vmfs",  40960, 15000, fc_fab, "VMFS 6.82 — Primary production datastore"),
        ("VMFS-DS02",   "vmfs",  20480, 8000,  fc_fab, "VMFS 6.82 — Secondary production datastore"),
        ("NFS-BACKUP",  "nfs",   51200, 30000, None,   "NFS v4.1 — Backup target"),
        ("VSAN-CLUS01", "vsan",  102400,60000, None,   "vSAN 8.0 — All-flash policy"),
    ]
    if vsphere:
        for name, dtype, total, free, fab, notes in specs_vsphere:
            payload = {
                "cluster_id": vsphere["id"],
                "name": name, "datastore_type": dtype,
                "total_gb": total, "free_gb": free,
                "notes": notes,
            }
            if fab:
                payload["san_fabric_id"] = fab["id"]
            r = post("/virt/datastores", payload)
            if r:
                ds.append(r)
                print(f"  + Datastore: {name} (vSphere)")

    if proxmox:
        for name, dtype, total, free in [
            ("local-lvm", "iscsi", 4096,  1000),
            ("ceph-pool", "fc",    20480, 8000),
        ]:
            r = post("/virt/datastores", {
                "cluster_id": proxmox["id"],
                "name": name, "datastore_type": dtype,
                "total_gb": total, "free_gb": free,
            })
            if r:
                ds.append(r)
                print(f"  + Datastore: {name} (Proxmox)")

    return ds


def seed_integrations():
    section("Integrations")
    integrations = []
    specs = [
        {
            "name": "DC-EAST-01 xClarity",
            "integration_type": "xclarity",
            "host": "xclarity.dc.local",
            "port": 443,
            "enabled": True,
            "polling_interval_sec": 300,
            "status": "ok",
            "extra_config": {"verify_ssl": False, "timeout_sec": 30},
        },
        {
            "name": "vCenter DC-EAST-01",
            "integration_type": "vcenter",
            "host": "vcenter.dc.local",
            "port": 443,
            "enabled": True,
            "polling_interval_sec": 600,
            "status": "ok",
            "extra_config": {"datacenter_name": "DC-EAST-01", "verify_ssl": False},
        },
        {
            "name": "Proxmox PVE Cluster",
            "integration_type": "proxmox_api",
            "host": "proxmox.dc.local",
            "port": 8006,
            "enabled": True,
            "polling_interval_sec": 300,
            "status": "warning",
            "error_message": "SSL certificate not verified",
            "extra_config": {"verify_ssl": False},
        },
        {
            "name": "SNMP Network Polling",
            "integration_type": "snmp",
            "host": "0.0.0.0",
            "enabled": True,
            "polling_interval_sec": 60,
            "status": "ok",
            "extra_config": {"community": "public", "version": "v2c", "port": 161},
        },
        {
            "name": "Netmiko SSH Collector",
            "integration_type": "ssh",
            "host": "0.0.0.0",
            "enabled": False,
            "polling_interval_sec": 3600,
            "status": "disabled",
            "extra_config": {"timeout_sec": 30, "global_delay_factor": 2},
        },
        {
            "name": "SCVMM Hyper-V DR",
            "integration_type": "scvmm",
            "host": "scvmm.dc.local",
            "port": 443,
            "enabled": True,
            "polling_interval_sec": 900,
            "status": "error",
            "error_message": "Connection refused — SCVMM service not responding",
            "extra_config": {"winrm_port": 5986, "use_ssl": True},
        },
        {
            "name": "XenServer / XCP-ng Dev",
            "integration_type": "xenserver_api",
            "host": "xcp.dc.local",
            "port": 443,
            "enabled": True,
            "polling_interval_sec": 600,
            "status": "ok",
            "extra_config": {"verify_ssl": False},
        },
    ]
    for spec in specs:
        r = post("/integrations", spec)
        if r:
            integrations.append(r)
            print(f"  + Integration: {spec['name']} ({spec['status']})")
    return integrations


def seed_alerts(devices, licenses):
    section("Alerts")
    alerts = []

    servers  = devices.get("servers", [])
    switches = devices.get("switches", [])

    specs = [
        # Critical
        {
            "entity_type": "device",
            "entity_id": servers[8]["id"] if len(servers) > 8 else None,
            "alert_type": "device_eos",
            "severity": "critical",
            "message": "SVR-DEV-01 end-of-support date (2026-06-01) is within 90 days.",
        },
        {
            "entity_type": "license",
            "entity_id": licenses[0]["id"] if licenses else None,
            "alert_type": "license_expiry",
            "severity": "critical",
            "message": "Veritas NetBackup Client license expires in 20 days (2026-04-02). Renew immediately.",
        },
        {
            "entity_type": "device",
            "entity_id": servers[0]["id"] if servers else None,
            "alert_type": "power_capacity",
            "severity": "critical",
            "message": "Rack RA-01 power utilization is at 92% of max capacity (9,200W / 10,000W).",
        },
        # Warnings
        {
            "entity_type": "license",
            "entity_id": licenses[1]["id"] if len(licenses) > 1 else None,
            "alert_type": "license_expiry",
            "severity": "warning",
            "message": "Zerto Replication (50 VMs) license expires in 45 days. Renewal required.",
        },
        {
            "entity_type": "device",
            "entity_id": servers[0]["id"] if servers else None,
            "alert_type": "warranty_expiry",
            "severity": "warning",
            "message": "SVR-PROD-01 warranty expires in 61 days (2027-03-01).",
        },
        {
            "entity_type": "integration",
            "entity_id": None,
            "alert_type": "sync_failure",
            "severity": "warning",
            "message": "SCVMM Hyper-V DR integration has been failing for 4 hours. Check SCVMM service.",
        },
        {
            "entity_type": "device",
            "entity_id": switches[0]["id"] if switches else None,
            "alert_type": "device_eos",
            "severity": "warning",
            "message": "SW-SPINE-01 (Cisco Nexus 9336C-FX2) end-of-support date is 2028-06-01.",
        },
        # Info
        {
            "entity_type": "device",
            "entity_id": servers[1]["id"] if len(servers) > 1 else None,
            "alert_type": "device_eol",
            "severity": "info",
            "message": "SVR-PROD-02 end-of-life date (2028-01-01) is within 720 days. Plan replacement.",
        },
        {
            "entity_type": "device",
            "entity_id": servers[2]["id"] if len(servers) > 2 else None,
            "alert_type": "device_unreachable",
            "severity": "info",
            "message": "SVR-PROD-03 has not been seen in the last 24 hours. Check connectivity.",
        },
    ]

    for spec in specs:
        if not spec.get("entity_id") and spec.get("entity_type") != "integration":
            continue
        payload = {k: v for k, v in spec.items() if v is not None}
        r = post("/alerts", payload)
        if r:
            alerts.append(r)

    print(f"  + {len(alerts)} alerts created")
    return alerts


def seed_power_readings(devices):
    section("Power Readings")
    count = 0

    # Create 24 hours of hourly readings for servers and PDUs
    now = datetime.datetime.utcnow()
    target_devices = (devices.get("servers", [])[:4] +
                      devices.get("pdus", [])[:2])

    base_watts = {
        "server": [820, 850, 900, 750],
        "pdu":    [4800, 4600],
    }

    for dev_idx, dev in enumerate(target_devices):
        is_server = dev_idx < 4
        base = base_watts["server"][dev_idx] if is_server else base_watts["pdu"][dev_idx - 4]
        for h in range(24, -1, -1):
            import random
            jitter = random.randint(-50, 50)
            ts = (now - datetime.timedelta(hours=h)).replace(minute=0, second=0, microsecond=0)
            r = post("/devices/" + dev["id"] + "/power-readings", {
                "watts": base + jitter,
                "recorded_at": ts.isoformat() + "Z",
            }, silent=True, ok=(200, 201, 204))
            if r is not None:
                count += 1

    print(f"  + {count} power readings created")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "="*60)
    print("  DATACENTER MANAGER — Seed Data")
    print("="*60)

    # ── Auth ──────────────────────────────────────────────────────
    section("Authentication")
    admin_pass = "Admin1234!"
    result = login("admin", admin_pass)
    if result == "must_change":
        print("  Password change required — changing to Admin1234!#")
        admin_pass = "Admin1234!#"
        # Need a token first — get it differently
        # Try to get token anyway for change-password
        r = requests.post(f"{BASE}/auth/login",
                          json={"username": "admin", "password": "Admin1234!"},
                          headers={"Content-Type": "application/json"})
        if r.status_code == 403:
            # Need the token from the 403 response if available, or use a workaround
            print("  Attempting direct password change...")
            # Try the original password to see if we can still log in
            pass
        result = login("admin", admin_pass)
    if not result or result == "must_change":
        print("  ERROR: Cannot authenticate. Check admin credentials.")
        sys.exit(1)
    print(f"  Logged in as admin")

    # ── Seed all entities ─────────────────────────────────────────
    seed_users()
    dcs = seed_datacenters()
    if not dcs:
        print("ERROR: No datacenters created. Aborting.")
        sys.exit(1)

    dc = dcs[0]
    rooms     = seed_rooms(dc["id"])
    corridors = seed_corridors(rooms)
    racks     = seed_racks(corridors)
    devices = seed_devices(racks)

    all_servers = devices.get("servers", [])
    licenses = seed_licenses(devices)
    vlans    = seed_vlans()
    ip_nets  = seed_ip_networks(vlans)
    ifaces   = seed_interfaces(devices)
    seed_links(devices, ifaces)
    seed_ip_addresses(devices, ifaces, ip_nets)
    san_fabs = seed_san_fabrics()
    clusters = seed_virt_clusters()
    hosts    = seed_virt_hosts(clusters, devices)
    seed_vms(hosts)
    seed_datastores(clusters, san_fabs)
    seed_integrations()
    alerts = seed_alerts(devices, licenses)
    # Power readings inserted via SQL (no REST endpoint)

    print("\n" + "="*60)
    print("  Seed complete!")
    print("="*60)
    print(f"""
  Summary
  ─────────────────────────────
  Datacenters  : {len(dcs)} (+ 1 DR site)
  Rooms        : {len(rooms)}
  Racks        : 8
  Devices      : {sum(len(v) if isinstance(v, list) else 1
                      for v in devices.values())} total
    Servers    : {len(devices.get('servers',[]))}
    Switches   : {len(devices.get('switches',[]))}
    Routers    : {len(devices.get('routers',[]))}
    Firewalls  : {len(devices.get('firewalls',[]))}
    Storage    : {len(devices.get('storage',[]))}
    PDUs       : {len(devices.get('pdus',[]))}
    Blades     : {len(devices.get('blades',[]))}
    Other      : 3
  Licenses     : {len(licenses)}
  VLANs        : {len(vlans)}
  IP Networks  : {len(ip_nets)}
  SAN Fabrics  : {len(san_fabs)}
  Virt Clusters: {len(clusters)}
  Virt Hosts   : {len(hosts)}
  Integrations : 7
  Alerts       : {len(alerts)}
""")


if __name__ == "__main__":
    main()
