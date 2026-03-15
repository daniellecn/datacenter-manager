// Tree View — hierarchical explorer of all datacenter infrastructure.
// Datacenter → Room → Rack → Device → (Interfaces | VMs | Blades)
// Lazy-loads each level on first expand.

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  HardDrive,
  LayoutGrid,
  Monitor,
  Network,
  Search,
  Server,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/api/index";
import { useDataCenters } from "@/api/datacenters";
import { Spinner } from "@/components/common/Spinner";
import { DeviceIcon, DEVICE_COLORS } from "@/components/topology/icons";
import type {
  DataCenterRead,
  DeviceRead,
  NetworkInterfaceRead,
  RackRead,
  RoomRead,
  VMRead,
  VirtHostRead,
} from "@/types";
import type { DeviceType } from "@/types/topology";

// ── Lazy-load query hooks ─────────────────────────────────────────────────────

function useTreeRooms(dcId: string, enabled: boolean) {
  return useQuery<RoomRead[]>({
    queryKey: ["tree-rooms", dcId],
    queryFn: async () => {
      const { data } = await api.get("/rooms", {
        params: { datacenter_id: dcId, size: 500 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeRacks(roomId: string, enabled: boolean) {
  return useQuery<RackRead[]>({
    queryKey: ["tree-racks", roomId],
    queryFn: async () => {
      const { data } = await api.get("/racks", {
        params: { room_id: roomId, size: 500 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeDevices(rackId: string, enabled: boolean) {
  return useQuery<DeviceRead[]>({
    queryKey: ["tree-devices-rack", rackId],
    queryFn: async () => {
      const { data } = await api.get("/devices", {
        params: { rack_id: rackId, size: 500 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeInterfaces(deviceId: string, enabled: boolean) {
  return useQuery<NetworkInterfaceRead[]>({
    queryKey: ["tree-ifaces", deviceId],
    queryFn: async () => {
      const { data } = await api.get("/interfaces", {
        params: { device_id: deviceId, size: 200 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeVirtHost(deviceId: string, enabled: boolean) {
  return useQuery<VirtHostRead | null>({
    queryKey: ["tree-vhost", deviceId],
    queryFn: async () => {
      const { data } = await api.get("/virt/hosts", {
        params: { device_id: deviceId, size: 5 },
      });
      return (data.items ?? [])[0] ?? null;
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeVMs(hostId: string, enabled: boolean) {
  return useQuery<VMRead[]>({
    queryKey: ["tree-vms", hostId],
    queryFn: async () => {
      const { data } = await api.get("/virt/vms", {
        params: { host_id: hostId, size: 500 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

function useTreeBlades(chassisId: string, enabled: boolean) {
  return useQuery<DeviceRead[]>({
    queryKey: ["tree-blades", chassisId],
    queryFn: async () => {
      const { data } = await api.get("/devices", {
        params: { blade_chassis_id: chassisId, size: 200 },
      });
      return data.items ?? [];
    },
    enabled,
    staleTime: 60_000,
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeKind = "datacenter" | "room" | "rack" | "device" | "interface" | "vm";

interface SelectedNode {
  kind: NodeKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  key: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  inactive:       "bg-gray-100 text-gray-500 border-gray-200",
  maintenance:    "bg-amber-100 text-amber-700 border-amber-200",
  reserved:       "bg-blue-100 text-blue-700 border-blue-200",
  decommissioned: "bg-red-100 text-red-600 border-red-200",
  up:             "bg-emerald-100 text-emerald-700 border-emerald-200",
  down:           "bg-red-100 text-red-600 border-red-200",
  powered_on:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  powered_off:    "bg-gray-100 text-gray-500 border-gray-200",
  suspended:      "bg-amber-100 text-amber-700 border-amber-200",
  unknown:        "bg-gray-100 text-gray-400 border-gray-200",
};

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cls = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-500 border-gray-200";
  return (
    <span className={cn("ml-2 px-1.5 py-0.5 rounded text-xs font-medium border shrink-0", cls)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Tree row ──────────────────────────────────────────────────────────────────

interface TreeRowProps {
  depth: number;
  label: string;
  status?: string | null;
  icon: React.ReactNode;
  isExpanded: boolean;
  hasChildren: boolean;
  isFetching?: boolean;
  isSelected: boolean;
  isMatch: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

function TreeRow({
  depth,
  label,
  status,
  icon,
  isExpanded,
  hasChildren,
  isFetching,
  isSelected,
  isMatch,
  onToggle,
  onSelect,
}: TreeRowProps) {
  return (
    <div
      className={cn(
        "flex items-center h-8 pr-3 cursor-pointer select-none transition-colors",
        "hover:bg-gray-50",
        isSelected
          ? "bg-blue-50 hover:bg-blue-50 border-l-2 border-blue-500"
          : isMatch
          ? "bg-yellow-50 hover:bg-yellow-100 border-l-2 border-yellow-400"
          : "border-l-2 border-transparent",
      )}
      style={{ paddingLeft: `${depth * 20 + 4}px` }}
      onClick={onSelect}
    >
      {/* Expand toggle */}
      <button
        className={cn(
          "flex items-center justify-center w-5 h-5 shrink-0 rounded transition-colors",
          "text-gray-400 hover:text-gray-600 hover:bg-gray-200",
          !hasChildren && "opacity-0 pointer-events-none",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isExpanded ? "Collapse" : "Expand"}
      >
        {isFetching ? (
          <Spinner size="sm" />
        ) : isExpanded ? (
          <ChevronDown size={13} />
        ) : (
          <ChevronRight size={13} />
        )}
      </button>

      {/* Type icon */}
      <span className="flex items-center justify-center w-5 h-5 shrink-0 ml-1">
        {icon}
      </span>

      {/* Label */}
      <span
        className={cn(
          "flex-1 text-sm truncate ml-1.5",
          isSelected ? "text-blue-700 font-medium" : "text-gray-800",
          isMatch && "font-semibold",
        )}
      >
        {label}
      </span>

      <StatusBadge status={status} />
    </div>
  );
}

// ── Empty child hint ──────────────────────────────────────────────────────────

function EmptyHint({ depth, message }: { depth: number; message: string }) {
  return (
    <div
      className="h-7 flex items-center text-xs text-gray-400 italic"
      style={{ paddingLeft: `${depth * 20 + 32}px` }}
    >
      {message}
    </div>
  );
}

// ── Device node (handles interfaces, VMs, blades recursively) ─────────────────

function DeviceNode({
  device,
  depth,
  expanded,
  selectedKey,
  search,
  onToggle,
  onSelect,
}: {
  device: DeviceRead;
  depth: number;
  expanded: Set<string>;
  selectedKey: string | null;
  search: string;
  onToggle: (id: string) => void;
  onSelect: (node: SelectedNode) => void;
}) {
  const nodeId = `device-${device.id}`;
  const isExpanded = expanded.has(nodeId);
  const isSelected = selectedKey === nodeId;
  const lc = search.toLowerCase();
  const isMatch = !!search && device.name.toLowerCase().includes(lc);

  const isBladeChassis = device.device_type === "blade_chassis";
  const isServerLike = ["server", "blade"].includes(device.device_type);

  const { data: interfaces, isFetching: fetchingIfaces } = useTreeInterfaces(
    device.id,
    isExpanded,
  );
  const { data: virtHost } = useTreeVirtHost(device.id, isExpanded && isServerLike);
  const { data: vms, isFetching: fetchingVMs } = useTreeVMs(
    virtHost?.id ?? "",
    isExpanded && !!virtHost?.id,
  );
  const { data: blades, isFetching: fetchingBlades } = useTreeBlades(
    device.id,
    isExpanded && isBladeChassis,
  );

  const isFetching = isExpanded && (fetchingIfaces || fetchingVMs || fetchingBlades);
  const devType = (device.device_type as DeviceType) ?? "generic";
  const colors = DEVICE_COLORS[devType] ?? DEVICE_COLORS.generic;

  const hasNoChildren =
    isExpanded &&
    !isFetching &&
    !interfaces?.length &&
    !vms?.length &&
    !blades?.length;

  return (
    <>
      <TreeRow
        depth={depth}
        label={device.name}
        status={device.status}
        icon={<DeviceIcon deviceType={devType} size={14} className={colors.text} />}
        isExpanded={isExpanded}
        hasChildren={true}
        isFetching={isFetching}
        isSelected={isSelected}
        isMatch={isMatch}
        onToggle={() => onToggle(nodeId)}
        onSelect={() => onSelect({ kind: "device", data: device, key: nodeId })}
      />

      {isExpanded && (
        <>
          {/* Blades inside a chassis */}
          {isBladeChassis &&
            blades?.map((blade) => (
              <DeviceNode
                key={blade.id}
                device={blade}
                depth={depth + 1}
                expanded={expanded}
                selectedKey={selectedKey}
                search={search}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}

          {/* Network interfaces */}
          {interfaces?.map((iface) => {
            const key = `interface-${iface.id}`;
            const speedStr = iface.speed_mbps
              ? iface.speed_mbps >= 1_000_000
                ? ` — ${iface.speed_mbps / 1_000_000}T`
                : iface.speed_mbps >= 1_000
                ? ` — ${iface.speed_mbps / 1_000}G`
                : ` — ${iface.speed_mbps}M`
              : "";
            return (
              <TreeRow
                key={iface.id}
                depth={depth + 1}
                label={`${iface.name}${speedStr}`}
                status={iface.status}
                icon={<Network size={13} className="text-teal-500" />}
                isExpanded={false}
                hasChildren={false}
                isSelected={selectedKey === key}
                isMatch={!!search && iface.name.toLowerCase().includes(lc)}
                onToggle={() => {}}
                onSelect={() =>
                  onSelect({ kind: "interface", data: iface, key })
                }
              />
            );
          })}

          {/* Virtual machines */}
          {vms?.map((vm) => {
            const key = `vm-${vm.id}`;
            return (
              <TreeRow
                key={vm.id}
                depth={depth + 1}
                label={vm.name}
                status={vm.status}
                icon={<Monitor size={13} className="text-sky-500" />}
                isExpanded={false}
                hasChildren={false}
                isSelected={selectedKey === key}
                isMatch={!!search && vm.name.toLowerCase().includes(lc)}
                onToggle={() => {}}
                onSelect={() => onSelect({ kind: "vm", data: vm, key })}
              />
            );
          })}

          {hasNoChildren && (
            <EmptyHint depth={depth} message="No interfaces or VMs" />
          )}
        </>
      )}
    </>
  );
}

// ── Rack node ─────────────────────────────────────────────────────────────────

function RackNode({
  rack,
  depth,
  expanded,
  selectedKey,
  search,
  onToggle,
  onSelect,
}: {
  rack: RackRead;
  depth: number;
  expanded: Set<string>;
  selectedKey: string | null;
  search: string;
  onToggle: (id: string) => void;
  onSelect: (node: SelectedNode) => void;
}) {
  const nodeId = `rack-${rack.id}`;
  const isExpanded = expanded.has(nodeId);
  const isSelected = selectedKey === nodeId;
  const isMatch =
    !!search && rack.name.toLowerCase().includes(search.toLowerCase());

  const { data: devices, isFetching } = useTreeDevices(rack.id, isExpanded);

  return (
    <>
      <TreeRow
        depth={depth}
        label={rack.name}
        status={rack.status}
        icon={<Server size={14} className="text-slate-500" />}
        isExpanded={isExpanded}
        hasChildren={true}
        isFetching={isFetching && isExpanded}
        isSelected={isSelected}
        isMatch={isMatch}
        onToggle={() => onToggle(nodeId)}
        onSelect={() => onSelect({ kind: "rack", data: rack, key: nodeId })}
      />

      {isExpanded && (
        <>
          {devices?.map((device) => (
            <DeviceNode
              key={device.id}
              device={device}
              depth={depth + 1}
              expanded={expanded}
              selectedKey={selectedKey}
              search={search}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {!isFetching && devices?.length === 0 && (
            <EmptyHint depth={depth} message="No devices" />
          )}
        </>
      )}
    </>
  );
}

// ── Room node ─────────────────────────────────────────────────────────────────

function RoomNode({
  room,
  depth,
  expanded,
  selectedKey,
  search,
  onToggle,
  onSelect,
}: {
  room: RoomRead;
  depth: number;
  expanded: Set<string>;
  selectedKey: string | null;
  search: string;
  onToggle: (id: string) => void;
  onSelect: (node: SelectedNode) => void;
}) {
  const nodeId = `room-${room.id}`;
  const isExpanded = expanded.has(nodeId);
  const isSelected = selectedKey === nodeId;
  const isMatch =
    !!search && room.name.toLowerCase().includes(search.toLowerCase());

  const { data: racks, isFetching } = useTreeRacks(room.id, isExpanded);

  return (
    <>
      <TreeRow
        depth={depth}
        label={room.name}
        status={null}
        icon={<LayoutGrid size={14} className="text-indigo-500" />}
        isExpanded={isExpanded}
        hasChildren={true}
        isFetching={isFetching && isExpanded}
        isSelected={isSelected}
        isMatch={isMatch}
        onToggle={() => onToggle(nodeId)}
        onSelect={() => onSelect({ kind: "room", data: room, key: nodeId })}
      />

      {isExpanded && (
        <>
          {racks?.map((rack) => (
            <RackNode
              key={rack.id}
              rack={rack}
              depth={depth + 1}
              expanded={expanded}
              selectedKey={selectedKey}
              search={search}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {!isFetching && racks?.length === 0 && (
            <EmptyHint depth={depth} message="No racks" />
          )}
        </>
      )}
    </>
  );
}

// ── Datacenter node ───────────────────────────────────────────────────────────

function DatacenterNode({
  dc,
  depth,
  expanded,
  selectedKey,
  search,
  onToggle,
  onSelect,
}: {
  dc: DataCenterRead;
  depth: number;
  expanded: Set<string>;
  selectedKey: string | null;
  search: string;
  onToggle: (id: string) => void;
  onSelect: (node: SelectedNode) => void;
}) {
  const nodeId = `datacenter-${dc.id}`;
  const isExpanded = expanded.has(nodeId);
  const isSelected = selectedKey === nodeId;
  const isMatch =
    !!search && dc.name.toLowerCase().includes(search.toLowerCase());

  const { data: rooms, isFetching } = useTreeRooms(dc.id, isExpanded);

  return (
    <>
      <TreeRow
        depth={depth}
        label={dc.name}
        status={null}
        icon={<Building2 size={14} className="text-blue-600" />}
        isExpanded={isExpanded}
        hasChildren={true}
        isFetching={isFetching && isExpanded}
        isSelected={isSelected}
        isMatch={isMatch}
        onToggle={() => onToggle(nodeId)}
        onSelect={() =>
          onSelect({ kind: "datacenter", data: dc, key: nodeId })
        }
      />

      {isExpanded && (
        <>
          {rooms?.map((room) => (
            <RoomNode
              key={room.id}
              room={room}
              depth={depth + 1}
              expanded={expanded}
              selectedKey={selectedKey}
              search={search}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {!isFetching && rooms?.length === 0 && (
            <EmptyHint depth={depth} message="No rooms" />
          )}
        </>
      )}
    </>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-28 shrink-0 pt-0.5 leading-4">
        {label}
      </span>
      <span className="text-sm text-gray-800 break-all leading-5">{value}</span>
    </div>
  );
}

function DetailPanel({
  node,
  onClose,
}: {
  node: SelectedNode;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { kind, data } = node;

  const title: string = data.name ?? "Detail";
  const subtitle = kind.charAt(0).toUpperCase() + kind.slice(1);

  function renderFields() {
    switch (kind) {
      case "datacenter": {
        const dc = data as DataCenterRead;
        return (
          <>
            <DetailField label="City" value={dc.city} />
            <DetailField label="Country" value={dc.country} />
            <DetailField label="Address" value={dc.address} />
            <DetailField
              label="Total Power"
              value={dc.total_power_kw ? `${dc.total_power_kw} kW` : null}
            />
            <DetailField
              label="Total Cooling"
              value={
                dc.total_cooling_kw ? `${dc.total_cooling_kw} kW` : null
              }
            />
            <DetailField label="PUE" value={dc.pue} />
            <DetailField label="Notes" value={dc.notes} />
          </>
        );
      }
      case "room": {
        const room = data as RoomRead;
        return (
          <>
            <DetailField label="Floor" value={room.floor} />
            <DetailField label="Cooling" value={room.cooling_type} />
            <DetailField
              label="Raised Floor"
              value={room.raised_floor ? "Yes" : "No"}
            />
            <DetailField
              label="Max Power"
              value={room.max_power_kw ? `${room.max_power_kw} kW` : null}
            />
            <DetailField
              label="Dimensions"
              value={
                room.width_m && room.depth_m
                  ? `${room.width_m} m × ${room.depth_m} m${
                      room.height_m ? ` × ${room.height_m} m` : ""
                    }`
                  : null
              }
            />
            <DetailField label="Notes" value={room.notes} />
          </>
        );
      }
      case "rack": {
        const rack = data as RackRead;
        return (
          <>
            <DetailField label="Status" value={rack.status} />
            <DetailField
              label="Row / Col"
              value={
                [rack.row, rack.column].filter(Boolean).join(" / ") || null
              }
            />
            <DetailField label="Size" value={`${rack.total_u} U`} />
            <DetailField
              label="Max Power"
              value={rack.max_power_w ? `${rack.max_power_w} W` : null}
            />
            <DetailField label="Manufacturer" value={rack.manufacturer} />
            <DetailField label="Model" value={rack.model} />
            <DetailField label="Serial No." value={rack.serial_number} />
            <DetailField label="Notes" value={rack.notes} />
          </>
        );
      }
      case "device": {
        const dev = data as DeviceRead;
        return (
          <>
            <DetailField
              label="Type"
              value={dev.device_type?.replace(/_/g, " ")}
            />
            <DetailField label="Status" value={dev.status} />
            <DetailField label="Manufacturer" value={dev.manufacturer} />
            <DetailField label="Model" value={dev.model} />
            <DetailField label="Serial No." value={dev.serial_number} />
            <DetailField label="Asset Tag" value={dev.asset_tag} />
            <DetailField
              label="Rack Position"
              value={
                dev.rack_unit_start ? `U${dev.rack_unit_start}` : null
              }
            />
            <DetailField
              label="Power (rated)"
              value={
                dev.power_rated_w ? `${dev.power_rated_w} W` : null
              }
            />
            <DetailField
              label="Power (actual)"
              value={
                dev.power_actual_w ? `${dev.power_actual_w} W` : null
              }
            />
            <DetailField label="Mgmt IP" value={dev.management_ip} />
            <DetailField label="Warranty" value={dev.warranty_expiry} />
            <DetailField label="End of Life" value={dev.end_of_life_date} />
          </>
        );
      }
      case "interface": {
        const iface = data as NetworkInterfaceRead;
        return (
          <>
            <DetailField label="Media Type" value={iface.media_type} />
            <DetailField label="Status" value={iface.status} />
            <DetailField
              label="Speed"
              value={iface.speed_mbps ? `${iface.speed_mbps} Mbps` : null}
            />
            <DetailField label="MAC" value={iface.mac_address} />
            <DetailField label="WWN" value={iface.wwn} />
            <DetailField
              label="Management"
              value={iface.is_management ? "Yes" : null}
            />
            <DetailField
              label="Uplink"
              value={iface.is_uplink ? "Yes" : null}
            />
            <DetailField label="Duplex" value={iface.duplex} />
            <DetailField
              label="MTU"
              value={iface.mtu ? `${iface.mtu}` : null}
            />
          </>
        );
      }
      case "vm": {
        const vm = data as VMRead;
        return (
          <>
            <DetailField label="Status" value={vm.status} />
            <DetailField label="OS Type" value={vm.os_type} />
            <DetailField label="OS Version" value={vm.os_version} />
            <DetailField label="vCPU" value={vm.vcpu_count} />
            <DetailField
              label="RAM"
              value={vm.ram_gb ? `${vm.ram_gb} GB` : null}
            />
            <DetailField
              label="Storage"
              value={vm.storage_gb ? `${vm.storage_gb} GB` : null}
            />
            <DetailField label="Snapshots" value={vm.snapshot_count} />
            <DetailField
              label="Template"
              value={vm.is_template ? "Yes" : null}
            />
            <DetailField label="Tools" value={vm.tools_version} />
            <DetailField label="Last Seen" value={vm.last_seen_at} />
          </>
        );
      }
      default:
        return null;
    }
  }

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">
            {subtitle}
          </p>
          <h3
            className="text-sm font-semibold text-gray-900 truncate"
            title={title}
          >
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
          aria-label="Close detail panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-2">{renderFields()}</div>

      {/* Footer nav */}
      {(kind === "device" || kind === "datacenter" || kind === "rack") && (
        <div className="p-3 border-t border-gray-100 shrink-0">
          <button
            className="w-full py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 rounded transition-colors"
            onClick={() => {
              if (kind === "device") navigate(`/devices/${data.id}`);
              else if (kind === "datacenter") navigate("/datacenters");
              else if (kind === "rack") navigate("/racks");
            }}
          >
            Open Full Page →
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TreeView() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [search, setSearch] = useState("");

  const { data: dcsPage, isLoading: loadingDCs } = useDataCenters(1, 200);
  const dcs: DataCenterRead[] = dcsPage?.items ?? [];

  // ── Toggle single node ───────────────────────────────────────────────────

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Expand all — reads from TanStack Query cache to avoid extra requests ─

  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);

      dcs.forEach((dc) => {
        next.add(`datacenter-${dc.id}`);

        const rooms = qc.getQueryData<RoomRead[]>(["tree-rooms", dc.id]);
        if (rooms) {
          rooms.forEach((room) => {
            next.add(`room-${room.id}`);

            const racks = qc.getQueryData<RackRead[]>(["tree-racks", room.id]);
            if (racks) {
              racks.forEach((rack) => {
                next.add(`rack-${rack.id}`);

                const devices = qc.getQueryData<DeviceRead[]>([
                  "tree-devices-rack",
                  rack.id,
                ]);
                if (devices) {
                  devices.forEach((dev) => {
                    next.add(`device-${dev.id}`);
                  });
                }
              });
            }
          });
        }
      });

      return next;
    });
  }, [dcs, qc]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  // ── Select / deselect ────────────────────────────────────────────────────

  const handleSelect = useCallback((node: SelectedNode) => {
    setSelectedNode((prev) => (prev?.key === node.key ? null : node));
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 shrink-0">
        <HardDrive size={16} className="text-gray-500 shrink-0" />
        <h1 className="text-sm font-semibold text-gray-800 mr-1">Tree View</h1>

        {/* Search */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {search && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
            Matching nodes highlighted in yellow
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={expandAll}
            title="Expand all loaded nodes (click again after data loads to go deeper)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronsDown size={14} />
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronsUp size={14} />
            Collapse All
          </button>
        </div>
      </div>

      {/* Body: tree + detail panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Tree */}
        <div className="flex-1 overflow-y-auto min-w-0 font-mono">
          {loadingDCs ? (
            <div className="flex items-center justify-center h-32">
              <Spinner size="lg" />
            </div>
          ) : dcs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              No datacenters found
            </div>
          ) : (
            <div className="py-1">
              {dcs.map((dc) => (
                <DatacenterNode
                  key={dc.id}
                  dc={dc}
                  depth={0}
                  expanded={expanded}
                  selectedKey={selectedNode?.key ?? null}
                  search={search}
                  onToggle={toggle}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
