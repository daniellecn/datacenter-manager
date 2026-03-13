// Topology types — mirrors backend /topology/* response schemas

export type DeviceType =
  | 'server'
  | 'switch'
  | 'router'
  | 'firewall'
  | 'storage'
  | 'pdu'
  | 'patch_panel'
  | 'blade_chassis'
  | 'blade'
  | 'generic';

export type DeviceStatus = 'active' | 'inactive' | 'maintenance' | 'unknown';

export type LinkType =
  | 'ethernet'
  | 'fiber'
  | 'dac'
  | 'lag'
  | 'console'
  | 'power'
  | 'other';

export type LinkStatus = 'active' | 'inactive';

// ─── Node / Edge data shapes ────────────────────────────────────────────────

export interface TopologyNodeData extends Record<string, unknown> {
  label: string;
  device_type: DeviceType;
  status: DeviceStatus;
  rack_id: string | null;
  rack_name: string | null;
  room_name: string | null;
  datacenter_name: string | null;
  power_rated_w: number | null;
  ip_addresses: string[];
  vlans?: number[];
}

export interface TopologyEdgeData extends Record<string, unknown> {
  link_type: LinkType;
  status: LinkStatus;
  speed_mbps: number | null;
  interface_a: string | null;
  interface_b: string | null;
  vlans?: number[];
}

// Raw shapes as returned by the backend (positions may all be 0,0; ELK overrides them)
export interface RawTopologyNode {
  id: string;
  type: string;
  data: TopologyNodeData;
  position: { x: number; y: number };
}

export interface RawTopologyEdge {
  id: string;
  source: string;
  target: string;
  data: TopologyEdgeData;
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface PhysicalTopologyResponse {
  nodes: RawTopologyNode[];
  edges: RawTopologyEdge[];
}

export interface VlanInfo {
  id: number;
  name: string;
}

export interface NetworkTopologyResponse {
  nodes: RawTopologyNode[];
  edges: RawTopologyEdge[];
  vlans: VlanInfo[];
}

// ─── Floor plan ──────────────────────────────────────────────────────────────

export interface FloorPlanRack {
  id: string;
  name: string;
  total_units: number;
  used_units: number;
  power_max_w: number | null;
  power_actual_w: number | null;
  power_utilization_pct: number | null;
  device_count: number;
}

export interface FloorPlanCorridor {
  id: string;
  name: string;
  position: number | null;
  racks: FloorPlanRack[];
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  notes: string | null;
  corridors: FloorPlanCorridor[];
}

export interface FloorPlanResponse {
  id: string;
  name: string;
  rooms: FloorPlanRoom[];
}

// ─── Rack elevation ──────────────────────────────────────────────────────────

export interface RackElevationDevice {
  id: string;
  name: string;
  device_type: DeviceType;
  status: DeviceStatus;
  rack_unit_start: number | null;
  rack_unit_height: number;
  power_rated_w: number | null;
  power_actual_w: number | null;
  model: string | null;
  vendor: string | null;
}

export interface RackElevationResponse {
  id: string;
  name: string;
  total_units: number;
  devices: RackElevationDevice[];
}

// ─── Hop-path trace ──────────────────────────────────────────────────────────

export interface HopPathResponse {
  from_device_id: string;
  to_device_id: string;
  reachable: boolean;
  path_device_ids: string[];
  hop_count: number;
  path_link_ids: string[];
}

// ─── Topology Zustand UI state ───────────────────────────────────────────────

export interface TopologyContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

export interface TopologyUIState {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  highlightedPath: string[];          // device IDs in highlighted hop-path
  highlightedLinkIds: string[];       // link IDs in highlighted hop-path
  highlightedVlanId: number | null;
  contextMenu: TopologyContextMenuState | null;
  sidePanelOpen: boolean;
  traceFromId: string | null;         // first device picked for Trace Route
}

// ─── Datacenter list (used in topology page selectors) ───────────────────────

export interface DatacenterOption {
  id: string;
  name: string;
}
