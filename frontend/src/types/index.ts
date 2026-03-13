// TypeScript interfaces mirroring backend Pydantic schemas.

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  must_change_password: boolean;
}

export interface UserRead {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "operator" | "read_only";
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

// ─── Physical ─────────────────────────────────────────────────────────────────

export interface DataCenterRead {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  total_power_kw: string | null;
  total_cooling_kw: string | null;
  pue: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomRead {
  id: string;
  datacenter_id: string;
  name: string;
  floor: number | null;
  cooling_type: string | null;
  raised_floor: boolean;
  width_m: string | null;
  depth_m: string | null;
  height_m: string | null;
  max_power_kw: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorridorRead {
  id: string;
  room_id: string;
  name: string;
  position: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RackRead {
  id: string;
  corridor_id: string;
  name: string;
  row: string | null;
  column: string | null;
  total_u: number;
  max_power_w: number | null;
  max_weight_kg: string | null;
  airflow_direction: string | null;
  power_feed_count: number;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: "active" | "reserved" | "decommissioned";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RackPowerSummary {
  rack_id: string;
  total_u: number;
  used_u: number;
  max_power_w: number | null;
  total_rated_w: number;
  total_actual_w: number;
  utilization_pct: number | null;
}

export interface DeviceServerRead {
  device_id: string;
  form_factor: string | null;
  blade_chassis_id: string | null;
  blade_slot: number | null;
  cpu_model: string | null;
  cpu_socket_count: number | null;
  cpu_cores_per_socket: number | null;
  cpu_threads_per_core: number | null;
  ram_gb: number | null;
  ram_max_gb: number | null;
  ram_slots_total: number | null;
  ram_slots_used: number | null;
  storage_drives: Record<string, unknown>[] | null;
  nic_count: number | null;
  hba_count: number | null;
  bios_version: string | null;
  bmc_firmware_version: string | null;
  xclarity_uuid: string | null;
}

export interface DeviceNetworkRead {
  device_id: string;
  os_type: string | null;
  os_version: string | null;
  port_count: number | null;
  uplink_port_count: number | null;
  management_vlan: number | null;
  spanning_tree_mode: string | null;
  spanning_tree_priority: number | null;
  stacking_enabled: boolean | null;
  stack_member_id: number | null;
  snmp_sysoid: string | null;
}

export interface DevicePDURead {
  device_id: string;
  outlet_count: number | null;
  outlet_type: string | null;
  input_voltage: number | null;
  input_current_max_a: string | null;
  is_metered: boolean | null;
  is_switched: boolean | null;
  current_load_w: number | null;
}

export interface DeviceRead {
  id: string;
  rack_id: string | null;
  name: string;
  device_type: string;
  manufacturer: string | null;
  model: string | null;
  part_number: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  rack_unit_start: number | null;
  rack_unit_size: number | null;
  face: string | null;
  power_rated_w: number | null;
  power_actual_w: number | null;
  weight_kg: string | null;
  status: string;
  management_ip: string | null;
  management_protocol: string | null;
  snmp_community: string | null;
  snmp_version: string | null;
  ssh_username: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  end_of_support_date: string | null;
  end_of_life_date: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown> | null;
  last_synced_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceDetailRead extends DeviceRead {
  server_detail: DeviceServerRead | null;
  network_detail: DeviceNetworkRead | null;
  pdu_detail: DevicePDURead | null;
}

export interface LicenseRead {
  id: string;
  device_id: string | null;
  product_name: string;
  vendor: string | null;
  license_type: string;
  quantity: number | null;
  purchase_date: string | null;
  expiry_date: string | null;
  cost_usd: string | null;
  renewal_reminder_days: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Network ──────────────────────────────────────────────────────────────────

export interface NetworkInterfaceRead {
  id: string;
  device_id: string;
  name: string;
  media_type: string;
  speed_mbps: number | null;
  mac_address: string | null;
  wwn: string | null;
  is_management: boolean;
  is_uplink: boolean;
  duplex: string | null;
  mtu: number | null;
  status: string;
  last_polled_status: string | null;
}

export interface LAGGroupRead {
  id: string;
  device_id: string;
  name: string;
  mode: string;
  combined_speed_mbps: number | null;
}

export interface NetworkLinkRead {
  id: string;
  source_interface_id: string;
  target_interface_id: string;
  link_type: string;
  speed_mbps: number | null;
  cable_label: string | null;
  cable_color: string | null;
  lag_group_id: string | null;
  patch_panel_port_a: string | null;
  patch_panel_port_b: string | null;
  status: string;
  notes: string | null;
}

export interface VLANRead {
  id: string;
  vlan_id: number;
  name: string;
  description: string | null;
  color: string | null;
}

export interface IPNetworkRead {
  id: string;
  cidr: string;
  name: string;
  gateway: string | null;
  vlan_id: string | null;
  purpose: string | null;
  dhcp_enabled: boolean;
  dhcp_range_start: string | null;
  dhcp_range_end: string | null;
  dns_servers: string[] | null;
  notes: string | null;
}

export interface IPAddressRead {
  id: string;
  address: string;
  subnet_id: string | null;
  device_id: string | null;
  interface_id: string | null;
  vm_id: string | null;
  fqdn: string | null;
  assignment_type: string;
  status: string;
  notes: string | null;
  last_seen_at: string | null;
}

export interface SANFabricRead {
  id: string;
  name: string;
  fabric_type: string;
  speed_gbps: number | null;
  wwn: string | null;
}

// ─── Virtual ──────────────────────────────────────────────────────────────────

export interface VirtClusterRead {
  id: string;
  name: string;
  platform: string;
  management_url: string | null;
  management_username: string | null;
  platform_config: Record<string, unknown> | null;
  ha_enabled: boolean;
  drs_enabled: boolean;
  total_vcpu: number | null;
  total_ram_gb: number | null;
  total_storage_tb: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VirtHostRead {
  id: string;
  device_id: string | null;
  cluster_id: string;
  platform_version: string | null;
  platform_uuid: string | null;
  platform_data: Record<string, unknown> | null;
  vcpu_allocated: number | null;
  ram_allocated_gb: number | null;
  is_in_maintenance: boolean;
  last_synced_at: string | null;
}

export interface VMRead {
  id: string;
  host_id: string;
  name: string;
  platform_vm_id: string | null;
  status: string;
  os_type: string | null;
  os_version: string | null;
  vcpu_count: number | null;
  ram_gb: number | null;
  storage_gb: number | null;
  tools_version: string | null;
  is_template: boolean;
  snapshot_count: number | null;
  platform_data: Record<string, unknown> | null;
  notes: string | null;
  last_seen_at: string | null;
  last_synced_at: string | null;
}

export interface DatastoreRead {
  id: string;
  cluster_id: string;
  name: string;
  datastore_type: string;
  total_gb: number | null;
  free_gb: number | null;
  san_fabric_id: string | null;
  platform_name: string | null;
  notes: string | null;
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface IntegrationRead {
  id: string;
  name: string;
  integration_type: string;
  host: string | null;
  port: number | null;
  extra_config: Record<string, unknown> | null;
  enabled: boolean;
  polling_interval_sec: number;
  status: string;
  last_polled_at: string | null;
  last_success_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLogRead {
  id: string;
  integration_id: string;
  started_at: string;
  completed_at: string | null;
  status: string | null;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  errors: Record<string, unknown>[] | null;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertRead {
  id: string;
  entity_type: string | null;
  entity_id: string | null;
  alert_type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditLogRead {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  diff: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  datacenters: number;
  rooms: number;
  racks: number;
  devices_active: number;
  devices_total: number;
  devices_by_type: {
    server: number;
    switch: number;
    router: number;
    firewall: number;
    storage: number;
    pdu: number;
    patch_panel: number;
    blade_chassis: number;
    blade: number;
    other: number;
  };
  vms_total: number;
  vms_running: number;
  virt_hosts: number;
  alerts: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  integrations: {
    ok: number;
    error: number;
    warning: number;
    disabled: number;
  };
}

export interface PowerReading {
  id: number;
  device_id: string;
  recorded_at: string;
  watts: number;
}
