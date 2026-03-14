/**
 * RoomRackView — "Rack view" mode of the floor plan.
 *
 * Shows every rack in the datacenter as a side-by-side column of U-slot
 * elevations, grouped by room. Useful for a corridor-level overview where
 * you want to see all racks at once without drilling into a single one.
 *
 * Features:
 * - Horizontal scrolling within each room row
 * - Drag device vertically → live conflict preview → PUT /devices/{id} on drop
 * - Drag bottom-edge resize handle → change rack_unit_height live → PUT /devices/{id} on release
 * - Click empty U-slot → AddDeviceModal pre-filled to that U
 * - "Add Device" (+) button per rack header
 * - Click rack header label → onRackHeaderClick callback (opens side panel)
 * - Click chassis → onChassisClick callback
 * - Click device → onDeviceClick callback
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Plus } from 'lucide-react';
import { useFloorPlan, useRackElevation } from '@/api/topology';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/index';
import type { FloorPlanCorridor, FloorPlanRack, FloorPlanRoom, RackElevationDevice } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from '@/components/topology/icons';
import type { DevicePanelInfo } from './DeviceDetailPanel';
import { AddDeviceModal } from './AddDeviceModal';

// ─── Layout constants ─────────────────────────────────────────────────────────

const U_HEIGHT = 22;          // px per U
const COL_W = 200;            // px width of each rack column
const U_LABEL_W = 30;         // px for U-number label strip
const RESIZE_HANDLE_H = 5;    // px — bottom-edge hit area

// ─── Interaction state types ──────────────────────────────────────────────────

interface DragState {
  deviceId: string;
  originalUnit: number;
  currentUnit: number;
  deviceHeight: number;
}

interface ResizeState {
  deviceId: string;
  unitStart: number;
  originalHeight: number;
  currentHeight: number;
  startMouseY: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function hasConflict(
  devices: RackElevationDevice[],
  movingId: string,
  newStart: number,
  height: number,
): boolean {
  const newEnd = newStart + height - 1;
  for (const d of devices) {
    if (d.id === movingId || d.rack_unit_start == null) continue;
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
  const { data: elevation, isLoading, refetch } = useRackElevation(rack.id);
  const [dragState, setDragState]     = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [showAddDevice, setShowAddDevice]     = useState(false);
  const [addDeviceAtUnit, setAddDeviceAtUnit] = useState<number | null>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const devices = useMemo(() => elevation?.devices ?? [], [elevation?.devices]);
  const totalU  = elevation?.total_units ?? rack.total_units;

  const occupiedSlots = useMemo(() => {
    const s = new Set<number>();
    for (const d of devices) {
      if (d.rack_unit_start != null) {
        for (let u = d.rack_unit_start; u < d.rack_unit_start + d.rack_unit_height; u++) {
          s.add(u);
        }
      }
    }
    return s;
  }, [devices]);

  // ─── Mouse move — drag and resize ──────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragState && rackRef.current) {
        const rect = rackRef.current.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const rawUnit = Math.round(relY / U_HEIGHT) + 1;
        const clamped = Math.max(1, Math.min(rawUnit, totalU - dragState.deviceHeight + 1));
        setDragState((prev) => (prev ? { ...prev, currentUnit: clamped } : null));
      } else if (resizeState) {
        const deltaY     = e.clientY - resizeState.startMouseY;
        const deltaUnits = Math.round(deltaY / U_HEIGHT);
        const raw        = resizeState.originalHeight + deltaUnits;
        const maxH       = totalU - resizeState.unitStart + 1;
        setResizeState((prev) => prev ? { ...prev, currentHeight: Math.max(1, Math.min(raw, maxH)) } : null);
      }
    },
    [dragState, resizeState, totalU],
  );

  // ─── Mouse up — commit drag or resize ──────────────────────────────────────

  const handleMouseUp = useCallback(async () => {
    document.body.style.userSelect = '';

    if (dragState) {
      const { deviceId, originalUnit, currentUnit, deviceHeight } = dragState;
      setDragState(null);
      if (currentUnit === originalUnit) return;
      if (hasConflict(devices, deviceId, currentUnit, deviceHeight)) return;
      try {
        await api.put(`/devices/${deviceId}`, { rack_unit_start: currentUnit });
        qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rack.id] });
        qc.invalidateQueries({ queryKey: ['devices'] });
      } catch {
        refetch();
      }
      return;
    }

    if (resizeState) {
      const { deviceId, unitStart, originalHeight, currentHeight } = resizeState;
      setResizeState(null);
      if (currentHeight === originalHeight) return;
      if (hasConflict(devices, deviceId, unitStart, currentHeight)) return;
      try {
        await api.put(`/devices/${deviceId}`, { rack_unit_size: currentHeight });
        qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rack.id] });
        qc.invalidateQueries({ queryKey: ['devices'] });
      } catch {
        refetch();
      }
    }
  }, [dragState, resizeState, devices, rack.id, qc, refetch]);

  useEffect(() => {
    if (!dragState && !resizeState) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, resizeState, handleMouseMove, handleMouseUp]);

  // ─── Interaction starters ───────────────────────────────────────────────────

  function startDrag(e: React.MouseEvent, device: RackElevationDevice) {
    if (device.rack_unit_start == null) return;
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setDragState({
      deviceId:     device.id,
      originalUnit: device.rack_unit_start,
      currentUnit:  device.rack_unit_start,
      deviceHeight: device.rack_unit_height,
    });
  }

  function startResize(e: React.MouseEvent, device: RackElevationDevice) {
    if (device.rack_unit_start == null) return;
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setResizeState({
      deviceId:       device.id,
      unitStart:      device.rack_unit_start,
      originalHeight: device.rack_unit_height,
      currentHeight:  device.rack_unit_height,
      startMouseY:    e.clientY,
    });
  }

  function openAddDeviceAt(u: number) {
    setAddDeviceAtUnit(u);
    setShowAddDevice(true);
  }

  const isInteracting = dragState != null || resizeState != null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col shrink-0" style={{ width: COL_W + U_LABEL_W }}>
      {/* Rack name header */}
      <div className="flex items-start bg-slate-800 dark:bg-slate-950 border border-slate-700 rounded-t-md">
        <button
          type="button"
          onClick={() => onRackHeaderClick(rack)}
          className="flex-1 text-left px-2 py-1.5 hover:bg-slate-700 transition-colors rounded-tl-md min-w-0"
          title="Click to view this rack in detail panel"
        >
          <p className="text-xs font-bold text-slate-100 truncate">{rack.name}</p>
          <p className="text-[10px] text-slate-400">
            {rack.used_units}U / {rack.total_units}U
          </p>
        </button>
        <button
          type="button"
          onClick={() => { setAddDeviceAtUnit(null); setShowAddDevice(true); }}
          title="Add device to this rack"
          className="shrink-0 flex items-center justify-center w-7 h-full border-l border-slate-700 text-slate-400 hover:text-white hover:bg-sky-600 transition-colors rounded-tr-md"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

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
          {/* Grid rows — empty ones are clickable to add a device */}
          {Array.from({ length: totalU }).map((_, i) => {
            const u = i + 1;
            const isEmpty = !occupiedSlots.has(u);
            const interactive = isEmpty && !isInteracting;
            return (
              <div
                key={i}
                className={[
                  'absolute left-0 right-0 border-b border-slate-700/40',
                  interactive ? 'cursor-pointer group hover:bg-slate-600/40' : '',
                ].join(' ')}
                style={{ top: i * U_HEIGHT, height: U_HEIGHT }}
                onClick={interactive ? () => openAddDeviceAt(u) : undefined}
              >
                {interactive && (
                  <div className="hidden group-hover:flex items-center justify-center h-full gap-0.5 text-[9px] text-slate-400 pointer-events-none select-none">
                    <Plus className="w-2.5 h-2.5" />
                    U{u}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          )}

          {!isLoading && devices.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-[10px] text-center px-2">
              Empty — click slot to add
            </div>
          )}

          {devices.map((device) => {
            if (device.rack_unit_start == null) return null;

            const isDragging = dragState?.deviceId === device.id;
            const isResizing = resizeState?.deviceId === device.id;

            const displayUnit   = isDragging ? dragState!.currentUnit   : device.rack_unit_start;
            const displayHeight = isResizing ? resizeState!.currentHeight : device.rack_unit_height;

            const isConflict =
              (isDragging && hasConflict(devices, device.id, dragState!.currentUnit, device.rack_unit_height)) ||
              (isResizing && hasConflict(devices, device.id, device.rack_unit_start!, resizeState!.currentHeight));

            const isConflictTarget =
              !isDragging && !isResizing && device.rack_unit_start != null &&
              (() => {
                if (dragState) {
                  const newEnd = dragState.currentUnit + dragState.deviceHeight - 1;
                  const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                  return dragState.currentUnit <= dEnd && newEnd >= device.rack_unit_start!;
                }
                if (resizeState) {
                  const rd = devices.find((d) => d.id === resizeState.deviceId);
                  if (!rd || rd.rack_unit_start == null) return false;
                  const newEnd = rd.rack_unit_start + resizeState.currentHeight - 1;
                  const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                  return rd.rack_unit_start <= dEnd && newEnd >= device.rack_unit_start!;
                }
                return false;
              })();

            return (
              <InlineTile
                key={device.id}
                device={device}
                displayUnit={displayUnit}
                displayHeight={displayHeight}
                uHeight={U_HEIGHT}
                isDragging={isDragging}
                isResizing={isResizing}
                isConflict={isConflict}
                isConflictTarget={isConflictTarget}
                onMouseDown={(e) => startDrag(e, device)}
                onResizeStart={(e) => startResize(e, device)}
                onClick={() => {
                  if (isInteracting) return;
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

      {showAddDevice && elevation && (
        <AddDeviceModal
          rackId={rack.id}
          rackName={rack.name}
          totalUnits={totalU}
          existingDevices={devices}
          initialUnit={addDeviceAtUnit ?? undefined}
          onClose={() => { setShowAddDevice(false); setAddDeviceAtUnit(null); }}
        />
      )}
    </div>
  );
}

// ─── Inline device tile ───────────────────────────────────────────────────────

interface InlineTileProps {
  device: RackElevationDevice;
  displayUnit: number;
  displayHeight: number;
  uHeight: number;
  isDragging: boolean;
  isResizing: boolean;
  isConflict: boolean;
  isConflictTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function InlineTile({
  device,
  displayUnit,
  displayHeight,
  uHeight,
  isDragging,
  isResizing,
  isConflict,
  isConflictTarget,
  onMouseDown,
  onResizeStart,
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
  const colors    = DEVICE_COLORS[dtKey] ?? DEVICE_COLORS.generic;
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  const top    = (displayUnit - 1) * uHeight;
  const height = displayHeight * uHeight;

  return (
    <div
      className={[
        'absolute left-0 right-0 flex items-center gap-1 px-1 select-none border-y transition-all duration-75 group',
        isDragging || isResizing ? 'z-20 cursor-grabbing' : 'z-10 cursor-pointer hover:brightness-110',
        isDragging ? 'opacity-90 shadow-2xl scale-x-[0.97]' : '',
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

      {/* Live feedback during drag */}
      {isDragging && (
        <span className="absolute right-1 text-[9px] text-slate-300 font-mono">
          U{displayUnit}
          {isConflict && <span className="text-red-400 ml-0.5">!</span>}
        </span>
      )}

      {/* Live feedback during resize */}
      {isResizing && (
        <span className="absolute right-1 text-[9px] text-slate-300 font-mono">
          {displayHeight}U
          {isConflict && <span className="text-red-400 ml-0.5">!</span>}
        </span>
      )}

      {/* Resize handle — bottom edge, visible on hover */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize"
        style={{ height: RESIZE_HANDLE_H }}
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-8 h-px bg-slate-300/70 rounded-full" />
      </div>
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
