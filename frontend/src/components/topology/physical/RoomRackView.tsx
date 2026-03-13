/**
 * RoomRackView — "Rack view" mode of the floor plan.
 *
 * Shows every rack in the datacenter as a side-by-side column of U-slot
 * elevations, grouped by room. Useful for a corridor-level overview where
 * you want to see all racks at once without drilling into a single one.
 *
 * Features:
 * - Horizontal scrolling within each room row
 * - Same drag-to-reposition mechanic as RackDiagram (per-column drag state)
 * - Conflict highlighting (dragged device + overlapping device both turn red)
 * - Click device → onDeviceClick callback (opens DeviceDetailPanel)
 * - Click chassis → onChassisClick callback
 * - Click rack header → onRackClick callback (drill into single rack view)
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useFloorPlan, useRackElevation } from '@/api/topology';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/index';
import type { FloorPlanCorridor, FloorPlanRack, FloorPlanRoom, RackElevationDevice } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from '@/components/topology/icons';
import type { DevicePanelInfo } from './DeviceDetailPanel';

// ─── Layout constants ─────────────────────────────────────────────────────────

const U_HEIGHT = 22;       // px per U — slightly tighter than the full rack view (28)
const COL_W = 200;         // px width of each rack column
const U_LABEL_W = 30;      // px for U-number label strip

// ─── Types ────────────────────────────────────────────────────────────────────

interface DragState {
  deviceId: string;
  originalUnit: number;
  currentUnit: number;
  deviceHeight: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function hasConflict(
  devices: RackElevationDevice[],
  draggingId: string,
  newStart: number,
  height: number,
): boolean {
  const newEnd = newStart + height - 1;
  for (const d of devices) {
    if (d.id === draggingId || d.rack_unit_start == null) continue;
    const dEnd = d.rack_unit_start + d.rack_unit_height - 1;
    if (newStart <= dEnd && newEnd >= d.rack_unit_start) return true;
  }
  return false;
}

function deviceToPanel(d: RackElevationDevice): DevicePanelInfo {
  return {
    id: d.id,
    name: d.name,
    device_type: d.device_type,
    status: d.status,
    rack_unit_start: d.rack_unit_start,
    rack_unit_height: d.rack_unit_height,
    power_rated_w: d.power_rated_w,
    power_actual_w: d.power_actual_w,
    model: d.model,
    vendor: d.vendor,
  };
}

// ─── Single rack column ────────────────────────────────────────────────────────

interface RackColumnProps {
  rack: FloorPlanRack;
  onDeviceClick: (d: DevicePanelInfo) => void;
  onChassisClick: (d: DevicePanelInfo) => void;
  onRackHeaderClick: (rack: FloorPlanRack) => void;
}

function RackColumn({ rack, onDeviceClick, onChassisClick, onRackHeaderClick }: RackColumnProps) {
  const { data: elevation, isLoading } = useRackElevation(rack.id);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const devices = useMemo(() => elevation?.devices ?? [], [elevation?.devices]);
  const totalU = elevation?.total_units ?? rack.total_units;

  // ─── Drag handlers ──────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !rackRef.current) return;
      const rect = rackRef.current.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const rawUnit = Math.round(relY / U_HEIGHT) + 1;
      const clamped = Math.max(1, Math.min(rawUnit, totalU - dragState.deviceHeight + 1));
      setDragState((prev) => (prev ? { ...prev, currentUnit: clamped } : null));
    },
    [dragState, totalU],
  );

  const handleMouseUp = useCallback(async () => {
    if (!dragState) return;
    const { deviceId, originalUnit, currentUnit, deviceHeight } = dragState;
    setDragState(null);
    document.body.style.userSelect = '';

    if (currentUnit === originalUnit) return;
    if (hasConflict(devices, deviceId, currentUnit, deviceHeight)) return;

    try {
      await api.patch(`/devices/${deviceId}`, { rack_unit_start: currentUnit });
      qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rack.id] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    } catch {
      qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rack.id] });
    }
  }, [dragState, devices, rack.id, qc]);

  useEffect(() => {
    if (!dragState) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  function startDrag(e: React.MouseEvent, device: RackElevationDevice) {
    if (device.rack_unit_start == null) return;
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setDragState({
      deviceId: device.id,
      originalUnit: device.rack_unit_start,
      currentUnit: device.rack_unit_start,
      deviceHeight: device.rack_unit_height,
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col shrink-0" style={{ width: COL_W + U_LABEL_W }}>
      {/* Rack name header — clickable to drill in */}
      <button
        type="button"
        onClick={() => onRackHeaderClick(rack)}
        className="w-full text-left px-2 py-1.5 bg-slate-800 dark:bg-slate-950 border border-slate-700 rounded-t-md hover:bg-slate-700 transition-colors"
        title="Click to view this rack in detail"
      >
        <p className="text-xs font-bold text-slate-100 truncate">{rack.name}</p>
        <p className="text-[10px] text-slate-400">
          {rack.used_units}U / {rack.total_units}U
        </p>
      </button>

      {/* Elevation body */}
      <div className="flex border border-t-0 border-slate-700 rounded-b-md overflow-hidden">
        {/* U-number strip */}
        <div
          className="bg-slate-900 dark:bg-black shrink-0 flex flex-col"
          style={{ width: U_LABEL_W, minHeight: totalU * U_HEIGHT }}
        >
          {Array.from({ length: totalU }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center border-b border-slate-800 text-slate-500 font-mono shrink-0"
              style={{ height: U_HEIGHT, fontSize: 8 }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Device slots */}
        <div
          ref={rackRef}
          className="relative bg-slate-800 dark:bg-slate-900 flex-1"
          style={{ height: totalU * U_HEIGHT }}
        >
          {/* Grid lines */}
          {Array.from({ length: totalU }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-b border-slate-700/40"
              style={{ top: i * U_HEIGHT, height: U_HEIGHT }}
            />
          ))}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          )}

          {!isLoading && devices.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-[10px] text-center px-2">
              Empty
            </div>
          )}

          {devices.map((device) => {
            if (device.rack_unit_start == null) return null;

            const isDragging = dragState?.deviceId === device.id;
            const displayUnit = isDragging ? dragState!.currentUnit : device.rack_unit_start;
            const isConflict =
              isDragging &&
              hasConflict(devices, device.id, dragState!.currentUnit, device.rack_unit_height);

            const isConflictTarget =
              !isDragging &&
              dragState != null &&
              device.rack_unit_start != null &&
              (() => {
                const ns = dragState.currentUnit;
                const ne = ns + dragState.deviceHeight - 1;
                const de = device.rack_unit_start! + device.rack_unit_height - 1;
                return ns <= de && ne >= device.rack_unit_start!;
              })();

            return (
              <InlineTile
                key={device.id}
                device={device}
                displayUnit={displayUnit}
                uHeight={U_HEIGHT}
                isDragging={isDragging}
                isConflict={isConflict}
                isConflictTarget={isConflictTarget}
                onMouseDown={(e) => startDrag(e, device)}
                onClick={() => {
                  if (dragState) return;
                  if (device.device_type === 'blade_chassis') {
                    onChassisClick(deviceToPanel(device));
                  } else {
                    onDeviceClick(deviceToPanel(device));
                  }
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Inline device tile ───────────────────────────────────────────────────────

interface InlineTileProps {
  device: RackElevationDevice;
  displayUnit: number;
  uHeight: number;
  isDragging: boolean;
  isConflict: boolean;
  isConflictTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function InlineTile({
  device,
  displayUnit,
  uHeight,
  isDragging,
  isConflict,
  isConflictTarget,
  onMouseDown,
  onClick,
}: InlineTileProps) {
  const knownTypes = [
    'server', 'switch', 'router', 'firewall', 'storage',
    'pdu', 'patch_panel', 'blade_chassis', 'blade', 'generic',
  ] as const;
  type KT = typeof knownTypes[number];
  const dtKey: KT = knownTypes.includes(device.device_type as KT)
    ? (device.device_type as KT)
    : 'generic';
  const colors = DEVICE_COLORS[dtKey] ?? DEVICE_COLORS.generic;
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  const top = (displayUnit - 1) * uHeight;
  const height = device.rack_unit_height * uHeight;

  return (
    <div
      className={[
        'absolute left-0 right-0 flex items-center gap-1 px-1 cursor-pointer select-none border-y transition-all duration-75',
        isDragging ? 'z-20 opacity-90 shadow-2xl scale-x-[0.97]' : 'z-10',
        isConflict
          ? 'bg-red-900/80 border-red-500'
          : isConflictTarget
          ? 'bg-red-950/60 border-red-600 ring-1 ring-red-500/50'
          : `bg-slate-600 hover:bg-slate-500 border-slate-500 hover:border-slate-400`,
      ].join(' ')}
      style={{ top, height }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      title={device.name}
    >
      {/* Color strip */}
      <div className={`w-1 self-stretch shrink-0 rounded-sm ${colors.bg}`} />

      {/* Icon */}
      {height >= uHeight && (
        <span className={`shrink-0 ${colors.text}`}>
          <DeviceIcon deviceType={dtKey} size={11} />
        </span>
      )}

      {/* Name */}
      <span className="text-[10px] font-medium text-slate-100 truncate flex-1 leading-tight">
        {device.name}
      </span>

      {/* Status dot */}
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${statusDot}`} />

      {/* Drag position hint */}
      {isDragging && (
        <span className="absolute right-1 text-[9px] text-slate-300 font-mono">
          U{displayUnit}
          {isConflict && <span className="text-red-400 ml-0.5">!</span>}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  datacenterId?: string;
  onDeviceClick: (d: DevicePanelInfo) => void;
  onChassisClick: (d: DevicePanelInfo) => void;
  onRackHeaderClick: (room: FloorPlanRoom, rack: FloorPlanRack) => void;
}

export function RoomRackView({ datacenterId, onDeviceClick, onChassisClick, onRackHeaderClick }: Props) {
  const { data: floorPlan, isLoading, isError } = useFloorPlan(datacenterId);

  if (!datacenterId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Select a datacenter to view rack elevations.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading racks…</span>
      </div>
    );
  }

  if (isError || !floorPlan) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load floor plan.</span>
      </div>
    );
  }

  if (floorPlan.rooms.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No rooms in this datacenter.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-100 dark:bg-slate-950 p-4 space-y-6">
      {floorPlan.rooms.map((room) => (
        <RoomSection
          key={room.id}
          room={room}
          onDeviceClick={onDeviceClick}
          onChassisClick={onChassisClick}
          onRackHeaderClick={onRackHeaderClick}
        />
      ))}
    </div>
  );
}

// ─── Room section ─────────────────────────────────────────────────────────────

interface RoomSectionProps {
  room: FloorPlanRoom;
  onDeviceClick: (d: DevicePanelInfo) => void;
  onChassisClick: (d: DevicePanelInfo) => void;
  onRackHeaderClick: (room: FloorPlanRoom, rack: FloorPlanRack) => void;
}

function RoomSection({ room, onDeviceClick, onChassisClick, onRackHeaderClick }: RoomSectionProps) {
  const allRacks = room.corridors.flatMap((c: FloorPlanCorridor) => c.racks);

  return (
    <div>
      {/* Room header */}
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{room.name}</h3>
        <span className="text-xs text-slate-400">
          {allRacks.length} rack{allRacks.length !== 1 ? 's' : ''}
          {room.corridors.length > 0 && (
            <span className="ml-1">· {room.corridors.length} corridor{room.corridors.length !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {room.corridors.map((corridor: FloorPlanCorridor) => (
        <div key={corridor.id} className="mb-4">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
            {corridor.name}
          </p>
          {corridor.racks.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No racks in this corridor.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {corridor.racks.map((rack) => (
                <RackColumn
                  key={rack.id}
                  rack={rack}
                  onDeviceClick={onDeviceClick}
                  onChassisClick={onChassisClick}
                  onRackHeaderClick={(r) => onRackHeaderClick(room, r)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {room.corridors.length === 0 && (
        <p className="text-xs text-slate-400 italic">No corridors in this room.</p>
      )}
    </div>
  );
}
