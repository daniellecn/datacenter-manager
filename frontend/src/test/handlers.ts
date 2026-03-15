/**
 * MSW (Mock Service Worker) request handlers for unit tests.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const BASE = "/api/v1";

export const authHandlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    if (body.username === "admin" && body.password === "admin123") {
      return HttpResponse.json({ access_token: "mock-access-token", refresh_token: "mock-refresh-token", must_change_password: false });
    }
    if (body.username === "forced" && body.password === "forced123") {
      return HttpResponse.json({ access_token: "mock-forced-token", refresh_token: "mock-forced-refresh", must_change_password: true });
    }
    return HttpResponse.json({ detail: "Incorrect username or password." }, { status: 401 });
  }),
  http.get(`${BASE}/auth/me`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return HttpResponse.json({ detail: "Not authenticated." }, { status: 401 });
    return HttpResponse.json({ id: "user-uuid-001", username: "admin", email: "admin@test.local", role: "admin", is_active: true, must_change_password: false });
  }),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as { refresh_token: string };
    if (body.refresh_token === "mock-refresh-token") return HttpResponse.json({ access_token: "mock-new-access-token", refresh_token: "mock-new-refresh-token", must_change_password: false });
    return HttpResponse.json({ detail: "Refresh token has been revoked." }, { status: 401 });
  }),
];

export const datacenterHandlers = [
  http.get(`${BASE}/datacenters`, () => HttpResponse.json({ items: [{ id: "dc-001", name: "Main DC", city: "Testville", country: "US" }], total: 1, page: 1, size: 50 })),
];

// ── Shared null fields for DeviceRead ────────────────────────────────────────
const DEVICE_NULL_FIELDS = {
  part_number: null, asset_tag: null, face: null, weight_kg: null,
  snmp_community: null, snmp_version: null, ssh_username: null,
  purchase_date: null, warranty_expiry: null, end_of_support_date: null,
  end_of_life_date: null, notes: null, custom_fields: null,
  last_synced_at: null, last_seen_at: "2026-03-12T10:30:00Z",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-03-12T10:30:00Z",
};

// ── Server fixture ────────────────────────────────────────────────────────────
const DEFAULT_SERVER = {
  id: "dev-001", name: "server-001", device_type: "server", status: "active",
  manufacturer: "Lenovo", model: "SR650", serial_number: "SN0001",
  rack_id: "rack-001", rack_unit_start: 1, rack_unit_size: 2,
  power_rated_w: 500, power_actual_w: 350, management_ip: "10.0.0.1",
  management_protocol: "ssh",
  ...DEVICE_NULL_FIELDS,
};
const DEFAULT_SERVER_DETAIL = {
  ...DEFAULT_SERVER,
  server_detail: {
    device_id: "dev-001", form_factor: "2u", blade_chassis_id: null, blade_slot: null,
    cpu_model: "Intel Xeon Gold 6338", cpu_socket_count: 2, cpu_cores_per_socket: 32,
    cpu_threads_per_core: 2, ram_gb: 256, ram_max_gb: 512,
    ram_slots_total: 32, ram_slots_used: 16,
    nic_count: 4, hba_count: 2, bios_version: "3.40", bmc_firmware_version: "8.88",
    xclarity_uuid: null, storage_drives: null,
    total_blade_slots: null, ethernet_switch_modules: null, fc_switch_modules: null,
  },
  network_detail: null,
  pdu_detail: null,
};

// ── Blade chassis fixture ─────────────────────────────────────────────────────
const DEFAULT_CHASSIS = {
  id: "dev-chassis-001", name: "chassis-001", device_type: "blade_chassis", status: "active",
  manufacturer: "HP", model: "BladeSystem c7000", serial_number: "CH0001",
  rack_id: "rack-001", rack_unit_start: 5, rack_unit_size: 10,
  power_rated_w: 4800, power_actual_w: 2100, management_ip: "10.0.0.10",
  management_protocol: "ilo",
  ...DEVICE_NULL_FIELDS,
};
const DEFAULT_CHASSIS_DETAIL = {
  ...DEFAULT_CHASSIS,
  server_detail: {
    device_id: "dev-chassis-001", form_factor: null, blade_chassis_id: null, blade_slot: null,
    cpu_model: null, cpu_socket_count: null, cpu_cores_per_socket: null,
    cpu_threads_per_core: null, ram_gb: null, ram_max_gb: null,
    ram_slots_total: null, ram_slots_used: null, storage_drives: null,
    nic_count: null, hba_count: null, bios_version: "4.10", bmc_firmware_version: "5.00",
    xclarity_uuid: null,
    total_blade_slots: 16, ethernet_switch_modules: 2, fc_switch_modules: 1,
  },
  network_detail: null,
  pdu_detail: null,
};

// ── Blade fixtures ────────────────────────────────────────────────────────────
// Blades are NOT racked directly — they live inside a chassis
const DEFAULT_BLADE_1 = {
  id: "blade-001", name: "blade-001", device_type: "blade", status: "active",
  manufacturer: "HP", model: "BL460c Gen10", serial_number: "BL0001",
  rack_id: null, rack_unit_start: null, rack_unit_size: null,
  power_rated_w: 300, power_actual_w: 180, management_ip: "10.0.0.11",
  management_protocol: "ilo",
  ...DEVICE_NULL_FIELDS,
};
const DEFAULT_BLADE_1_DETAIL = {
  ...DEFAULT_BLADE_1,
  server_detail: {
    device_id: "blade-001", form_factor: "blade",
    blade_chassis_id: "dev-chassis-001", blade_slot: 1,
    cpu_model: "Intel Xeon Silver 4310", cpu_socket_count: 2, cpu_cores_per_socket: 12,
    cpu_threads_per_core: 2, ram_gb: 64, ram_max_gb: 256,
    ram_slots_total: 16, ram_slots_used: 8, storage_drives: null,
    nic_count: 2, hba_count: 1, bios_version: "U30", bmc_firmware_version: "2.70",
    xclarity_uuid: null,
    total_blade_slots: null, ethernet_switch_modules: null, fc_switch_modules: null,
  },
  network_detail: null,
  pdu_detail: null,
};

const DEFAULT_BLADE_2 = {
  id: "blade-002", name: "blade-002", device_type: "blade", status: "active",
  manufacturer: "HP", model: "BL460c Gen10", serial_number: "BL0002",
  rack_id: null, rack_unit_start: null, rack_unit_size: null,
  power_rated_w: 300, power_actual_w: 210, management_ip: "10.0.0.12",
  management_protocol: "ilo",
  ...DEVICE_NULL_FIELDS,
};
const DEFAULT_BLADE_2_DETAIL = {
  ...DEFAULT_BLADE_2,
  server_detail: {
    device_id: "blade-002", form_factor: "blade",
    blade_chassis_id: "dev-chassis-001", blade_slot: 3,
    cpu_model: "Intel Xeon Silver 4310", cpu_socket_count: 2, cpu_cores_per_socket: 12,
    cpu_threads_per_core: 2, ram_gb: 128, ram_max_gb: 256,
    ram_slots_total: 16, ram_slots_used: 16, storage_drives: null,
    nic_count: 2, hba_count: 1, bios_version: "U30", bmc_firmware_version: "2.70",
    xclarity_uuid: null,
    total_blade_slots: null, ethernet_switch_modules: null, fc_switch_modules: null,
  },
  network_detail: null,
  pdu_detail: null,
};

// ── Device ID → detail map ────────────────────────────────────────────────────
const DEVICE_DETAIL_MAP: Record<string, object> = {
  "dev-001": DEFAULT_SERVER_DETAIL,
  "dev-chassis-001": DEFAULT_CHASSIS_DETAIL,
  "blade-001": DEFAULT_BLADE_1_DETAIL,
  "blade-002": DEFAULT_BLADE_2_DETAIL,
};

export const deviceHandlers = [
  http.get(`${BASE}/devices`, ({ request }) => {
    const p = new URL(request.url).searchParams;
    if (p.get("rack_id") === "rack-001")
      return HttpResponse.json({ items: [DEFAULT_SERVER, DEFAULT_CHASSIS], total: 2, page: 1, size: 50 });
    if (p.get("blade_chassis_id") === "dev-chassis-001")
      return HttpResponse.json({ items: [DEFAULT_BLADE_1, DEFAULT_BLADE_2], total: 2, page: 1, size: 50 });
    if (p.get("device_type") === "blade_chassis")
      return HttpResponse.json({ items: [DEFAULT_CHASSIS], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [DEFAULT_SERVER], total: 1, page: 1, size: 50 });
  }),
  http.post(`${BASE}/devices`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: "dev-new-001", ...DEVICE_NULL_FIELDS, ...body, status: body.status ?? "active" }, { status: 201 });
  }),
  http.get(`${BASE}/devices/:id`, ({ params }) => {
    const detail = DEVICE_DETAIL_MAP[params.id as string];
    if (detail) return HttpResponse.json(detail);
    // fallback for dynamically created devices
    return HttpResponse.json({ ...DEFAULT_SERVER_DETAIL, id: params.id });
  }),
  http.put(`${BASE}/devices/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: params.id, ...body });
  }),
  http.patch(`${BASE}/devices/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: params.id, ...body });
  }),
  http.delete(`${BASE}/devices/:id`, () => HttpResponse.json({ id: "dev-001", status: "inactive" })),
  http.put(`${BASE}/devices/:id/server-detail`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ device_id: params.id, ...body });
  }),
  http.put(`${BASE}/devices/:id/network-detail`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ device_id: params.id, ...body });
  }),
  http.put(`${BASE}/devices/:id/pdu-detail`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ device_id: params.id, ...body });
  }),
];

export const roomHandlers = [
  http.get(`${BASE}/rooms`, ({ request }) => {
    const dcId = new URL(request.url).searchParams.get("datacenter_id");
    if (dcId === "dc-001") return HttpResponse.json({ items: [{ id: "room-001", datacenter_id: "dc-001", name: "Server Room A", floor: 1, cooling_type: "cold_aisle", raised_floor: true, width_m: "10.0", depth_m: "20.0", height_m: "3.0", max_power_kw: "100.0", notes: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" }], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
  }),
];

export const rackHandlers = [
  http.get(`${BASE}/racks`, ({ request }) => {
    const roomId = new URL(request.url).searchParams.get("room_id");
    const item = { id: "rack-001", room_id: "room-001", name: "Rack-A01", row: "A", column: "01", total_u: 42, max_power_w: 10000, status: "active", manufacturer: "APC", model: "AR3100", serial_number: "RACK-001", notes: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" };
    if (roomId === "room-001") return HttpResponse.json({ items: [item], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [item], total: 1, page: 1, size: 50 });
  }),
  http.post(`${BASE}/racks`, async ({ request }) => { const body = (await request.json()) as Record<string, unknown>; return HttpResponse.json({ id: "rack-new-001", ...body, status: "active" }, { status: 201 }); }),
  // Correct path: /racks/:id/elevation  (was incorrectly /topology/rack/:id before)
  http.get(`${BASE}/racks/:id/elevation`, ({ params }) => HttpResponse.json({ id: params.id, name: "Rack-01", total_units: 42, devices: [{ id: "dev-001", name: "server-001", device_type: "server", status: "active", rack_unit_start: 1, rack_unit_height: 2, power_rated_w: 500, power_actual_w: 350, model: "SR650", vendor: "Lenovo" }] })),
];

export const interfaceHandlers = [
  http.get(`${BASE}/interfaces`, ({ request }) => {
    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId === "dev-001") return HttpResponse.json({ items: [{ id: "iface-001", device_id: "dev-001", name: "eth0", media_type: "copper_rj45", speed_mbps: 1000, mac_address: "aa:bb:cc:dd:ee:ff", wwn: null, is_management: true, is_uplink: false, duplex: "full", mtu: 1500, status: "up", last_polled_status: null }], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
  }),
];

export const virtHandlers = [
  http.get(`${BASE}/virt/hosts`, ({ request }) => {
    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId === "dev-001") return HttpResponse.json({ items: [{ id: "vhost-001", device_id: "dev-001", cluster_id: "cluster-001", platform_version: "8.0", platform_uuid: "uuid-001", platform_data: null, vcpu_allocated: 32, ram_allocated_gb: 128, is_in_maintenance: false, last_synced_at: null }], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
  }),
  http.get(`${BASE}/virt/vms`, ({ request }) => {
    const hostId = new URL(request.url).searchParams.get("host_id");
    if (hostId === "vhost-001") return HttpResponse.json({ items: [{ id: "vm-001", host_id: "vhost-001", name: "vm-webserver-01", platform_vm_id: "vm-001", status: "powered_on", os_type: "linux", os_version: "Ubuntu 22.04", vcpu_count: 4, ram_gb: 16, storage_gb: 100, tools_version: "12.0", is_template: false, snapshot_count: 2, platform_data: null, notes: null, last_seen_at: null, last_synced_at: null }], total: 1, page: 1, size: 50 });
    return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
  }),
];

export const topologyHandlers = [
  http.get(`${BASE}/topology/floor-plan`, () => HttpResponse.json({ id: "dc-001", name: "Main DC", rooms: [{ id: "room-001", name: "Room A", notes: null, corridors: [{ id: "corridor-001", name: "Corridor A", racks: [{ id: "rack-001", name: "Rack-01", total_units: 42, used_units: 2, power_max_w: 20000, power_actual_w: 350, power_utilization_pct: 1.75, device_count: 1 }] }] }] })),
  http.get(`${BASE}/topology/physical`, () => HttpResponse.json({ nodes: [], edges: [] })),
  http.get(`${BASE}/topology/network`, () => HttpResponse.json({ nodes: [], edges: [], vlans: [] })),
  http.get(`${BASE}/topology/path`, () => HttpResponse.json({ reachable: false, path_device_ids: [], path_link_ids: [], hop_count: 0 })),
];

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/summary`, () => HttpResponse.json({ device_count: 42, active_device_count: 38, rack_count: 10, vm_count: 120, alert_count: 3 })),
];

export const handlers = [
  ...authHandlers,
  ...datacenterHandlers,
  ...roomHandlers,
  ...rackHandlers,
  ...deviceHandlers,
  ...interfaceHandlers,
  ...virtHandlers,
  ...topologyHandlers,
  ...dashboardHandlers,
];

export const server = setupServer(...handlers);
