/**
 * RackDiagram — Level 2 of the hierarchical physical view.
 *
 * Renders a U-slot rack elevation using custom div-based layout (not React Flow).
 * U1 is at the top; each U is U_HEIGHT_PX tall.
 *
 * Features:
 * - Click a device → onDeviceClick callback (opens DeviceDetailPanel)
 * - Click a blade_chassis → onChassisClick callback (drills into chassis level)
 * - Drag a device vertically → live preview, conflict highlighting, PATCH on drop
 * - "+" Add Device button → AddDeviceModal with rack pre-filled + next free U suggested
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useRackElevation } from '@/api/topology';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/index';
import type { RackElevationDevice } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from '@/components/topology/icons';
import type { DevicePanelInfo } from './DeviceDetailPanel';
import { AddDeviceModal } from './AddDeviceModal';

const U_HEIGHT = 28;   // px per rack unit
const LEFT_COL_W = 40; // px for U-number labels
const RIGHT_COL_W = 28; // px for the right U-number column

interface Props {
  rackId: string;
  rackName: string;
  totalUnits: number;
  onDeviceClick: (device: DevicePanelInfo) => void;
  onChassisClick: (chassis: DevicePanelInfo) => void;
}

// ─── Drag state ───────────────────────────────────────────────────────────────

interface DragState {
  deviceId: string;
  originalUnit: number;
  currentUnit: number;
  startMouseY: number;
  deviceHeight: number;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function RackDiagram({ rackId, rackName, totalUnits, onDeviceClick, onChassisClick }: Props) {
  const { data: elevation, isLoading, refetch } = useRackElevation(rackId);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const rackRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const devices = useMemo(() => elevation?.devices ?? [], [elevation?.devices]);
  const rackTotalU = elevation?.total_units ?? totalUnits;

  // ─── Drag handlers ─────────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState || !rackRef.current) return;
      const rect = rackRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const rawUnit = Math.round(relativeY / U_HEIGHT) + 1;
      const clamped = Math.max(
        1,
        Math.min(rawUnit, rackTotalU - dragState.deviceHeight + 1),
      );
      setDragState((prev) => prev ? { ...prev, currentUnit: clamped } : null);
    },
    [dragState, rackTotalU],
  );

  const handleMouseUp = useCallback(async () => {
    if (!dragState) return;
    const { deviceId, originalUnit, currentUnit, deviceHeight } = dragState;
    setDragState(null);
    document.body.style.userSelect = '';

    if (currentUnit === originalUnit) return;
    const conflict = hasConflict(devices, deviceId, currentUnit, deviceHeight);
    if (conflict) return; // don't save conflicting position

    try {
      await api.patch(`/devices/${deviceId}`, { rack_unit_start: currentUnit });
      qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
      qc.invalidateQueries({ queryKey: ['devices'] });
    } catch {
      // revert is automatic since we refetch on invalidate
      refetch();
    }
  }, [dragState, devices, rackId, qc, refetch]);

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
      startMouseY: e.clientY,
      deviceHeight: device.rack_unit_height,
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading rack…</span>
      </div>
    );
  }

  const usedU = devices.reduce((s, d) => s + d.rack_unit_height, 0);

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-100 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
            Rack
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {rackName}
            <span className="ml-2 text-xs text-slate-400 font-normal">
              {rackTotalU}U · {usedU}U used · {rackTotalU - usedU}U free
            </span>
          </p>
        </div>
        <button
          onClick={() => setShowAddDevice(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Device
        </button>
      </div>

      {/* Rack scroll area */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex justify-center p-6">
          <div
            className="flex shadow-xl"
            style={{ width: 520 }}
          >
            {/* Left U-number column */}
            <UNumberColumn total={rackTotalU} side="left" />

            {/* Main rack body */}
            <div
              ref={rackRef}
              className="relative bg-slate-800 dark:bg-slate-900 border-y-2 border-slate-700 flex-1"
              style={{ height: rackTotalU * U_HEIGHT }}
            >
              {/* U-slot grid lines */}
              {Array.from({ length: rackTotalU }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-b border-slate-700/50"
                  style={{ top: i * U_HEIGHT, height: U_HEIGHT }}
                />
              ))}

              {/* Devices */}
              {devices.map((device) => {
                if (device.rack_unit_start == null) return null;

                const isDragging = dragState?.deviceId === device.id;
                const displayUnit = isDragging ? dragState!.currentUnit : device.rack_unit_start;
                const conflict =
                  isDragging &&
                  hasConflict(devices, device.id, dragState!.currentUnit, device.rack_unit_height);

                return (
                  <DeviceTile
                    key={device.id}
                    device={device}
                    displayUnit={displayUnit}
                    isDragging={isDragging}
                    isConflict={conflict}
                    isChassisConflictTarget={
                      dragState != null &&
                      !isDragging &&
                      hasConflict(
                        devices.filter((d) => d.id !== dragState.deviceId),
                        device.id,
                        dragState.currentUnit,
                        dragState.deviceHeight,
                      )
                        ? false
                        : false
                    }
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

              {/* Empty rack message */}
              {devices.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                  Empty rack — click Add Device
                </div>
              )}
            </div>

            {/* Right U-number column */}
            <UNumberColumn total={rackTotalU} side="right" />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center gap-4 px-5 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <span className="text-xs text-slate-500">Legend:</span>
        {[
          { color: 'bg-emerald-400', label: 'Active' },
          { color: 'bg-amber-400', label: 'Maintenance' },
          { color: 'bg-gray-400', label: 'Inactive' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          Drag devices to reposition
        </span>
      </div>

      {showAddDevice && elevation && (
        <AddDeviceModal
          rackId={rackId}
          rackName={rackName}
          totalUnits={rackTotalU}
          existingDevices={devices}
          onClose={() => setShowAddDevice(false)}
        />
      )}
    </div>
  );
}

// ─── U-number column ──────────────────────────────────────────────────────────

function UNumberColumn({ total, side }: { total: number; side: 'left' | 'right' }) {
  return (
    <div
      className={[
        'bg-slate-900 dark:bg-black border-slate-700 border-y-2 flex flex-col shrink-0',
        side === 'left'
          ? 'border-l-2 rounded-l-md'
          : 'border-r-2 rounded-r-md',
      ].join(' ')}
      style={{ width: side === 'left' ? LEFT_COL_W : RIGHT_COL_W, height: total * U_HEIGHT }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-center border-b border-slate-800 text-slate-500 font-mono shrink-0"
          style={{ height: U_HEIGHT, fontSize: 9 }}
        >
          {side === 'left' ? i + 1 : ''}
        </div>
      ))}
    </div>
  );
}

// ─── Device tile ──────────────────────────────────────────────────────────────

interface DeviceTileProps {
  device: RackElevationDevice;
  displayUnit: number;
  isDragging: boolean;
  isConflict: boolean;
  isChassisConflictTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function DeviceTile({
  device,
  displayUnit,
  isDragging,
  isConflict,
  onMouseDown,
  onClick,
}: DeviceTileProps) {
  const isChassis = device.device_type === 'blade_chassis';
  const dtKey = (['server','switch','router','firewall','storage','pdu','patch_panel','blade_chassis','blade','generic'] as const)
    .includes(device.device_type as never)
    ? device.device_type as 'server'
    : 'generic';
  const colors = DEVICE_COLORS[dtKey] ?? DEVICE_COLORS.generic;
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  const top = (displayUnit - 1) * U_HEIGHT;
  const height = device.rack_unit_height * U_HEIGHT;

  return (
    <div
      className={[
        'absolute left-0 right-0 flex items-center gap-2 px-2 cursor-pointer select-none',
        'border-y transition-all duration-75',
        isDragging ? 'z-20 opacity-90 shadow-2xl scale-x-[0.98]' : 'z-10',
        isConflict
          ? 'bg-red-900/80 border-red-500'
          : isChassis
          ? `${colors.bg} border-slate-600 hover:brightness-110`
          : `bg-slate-600 hover:bg-slate-500 border-slate-500 hover:border-slate-400`,
      ].join(' ')}
      style={{ top, height }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* Left color strip */}
      <div className={`w-1.5 self-stretch shrink-0 rounded-sm ${colors.bg}`} />

      {/* Icon */}
      {height >= U_HEIGHT && (
        <span className={`shrink-0 ${colors.text}`}>
          <DeviceIcon deviceType={dtKey} size={14} />
        </span>
      )}

      {/* Name */}
      <span
        className="text-xs font-medium text-slate-100 truncate flex-1 leading-tight"
        title={device.name}
      >
        {device.name}
        {isChassis && (
          <span className="ml-1.5 text-[10px] text-slate-300 opacity-70">(chassis ▶)</span>
        )}
      </span>

      {/* Power */}
      {height >= U_HEIGHT * 2 && device.power_rated_w && (
        <span className="text-[10px] text-slate-400 shrink-0">{device.power_rated_w}W</span>
      )}

      {/* Status dot */}
      <span className={`shrink-0 w-2 h-2 rounded-full ${statusDot}`} title={device.status} />

      {/* Drag hint */}
      {isDragging && (
        <span className="absolute right-2 text-[10px] text-slate-300 font-mono">
          U{displayUnit}
          {isConflict && <span className="text-red-400 ml-1">conflict!</span>}
        </span>
      )}
    </div>
  );
}
