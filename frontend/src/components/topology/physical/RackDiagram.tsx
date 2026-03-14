/**
 * RackDiagram — Level 2 of the hierarchical physical view.
 *
 * Renders a U-slot rack elevation using custom div-based layout (not React Flow).
 * U1 is at the top; each U is U_HEIGHT_PX tall.
 *
 * Features:
 * - Click a device → onDeviceClick callback (opens DeviceDetailPanel)
 * - Click a blade_chassis → onChassisClick callback (drills into chassis level)
 * - Click an empty U-slot → opens AddDeviceModal pre-filled to that U
 * - Drag a device vertically → live preview, conflict highlighting, PATCH on drop
 * - Drag the bottom-edge resize handle → change rack_unit_height live, PATCH on release
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

const U_HEIGHT = 28;      // px per rack unit
const LEFT_COL_W = 40;    // px for U-number labels
const RIGHT_COL_W = 28;   // px for the right U-number column
const RESIZE_HANDLE_H = 6; // px — hit area at bottom of each device tile
const PDU_STRIP_W    = 24; // px per PDU in the side-rail strip

interface Props {
  rackId: string;
  rackName: string;
  totalUnits: number;
  onDeviceClick: (device: DevicePanelInfo) => void;
  onChassisClick: (chassis: DevicePanelInfo) => void;
}

// ─── Interaction state ────────────────────────────────────────────────────────

interface DragState {
  deviceId: string;
  originalUnit: number;
  currentUnit: number;
  startMouseY: number;
  deviceHeight: number;
}

interface ResizeState {
  deviceId: string;
  unitStart: number;      // rack_unit_start (stays fixed while resizing)
  originalHeight: number;
  currentHeight: number;
  startMouseY: number;
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

// ─── Main component ───────────────────────────────────────────────────────────

export function RackDiagram({ rackId, rackName, totalUnits, onDeviceClick, onChassisClick }: Props) {
  const { data: elevation, isLoading, refetch } = useRackElevation(rackId);
  const [dragState, setDragState]     = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [showAddDevice, setShowAddDevice]   = useState(false);
  const [addDeviceAtUnit, setAddDeviceAtUnit] = useState<number | null>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const devices     = useMemo(() => elevation?.devices ?? [], [elevation?.devices]);
  const rackTotalU  = elevation?.total_units ?? totalUnits;

  // PDUs mount on the side rails — all other devices occupy U-slots
  const rackDevices = useMemo(() => devices.filter((d) => d.device_type !== 'pdu'), [devices]);
  const pduDevices  = useMemo(() => devices.filter((d) => d.device_type === 'pdu'),  [devices]);
  // Even-indexed PDUs → left rail, odd-indexed → right rail
  const leftPdus  = useMemo(() => pduDevices.filter((_, i) => i % 2 === 0), [pduDevices]);
  const rightPdus = useMemo(() => pduDevices.filter((_, i) => i % 2 === 1), [pduDevices]);

  // Set of every U slot currently occupied by a rack-mounted device
  const occupiedSlots = useMemo(() => {
    const s = new Set<number>();
    for (const d of rackDevices) {
      if (d.rack_unit_start != null) {
        for (let u = d.rack_unit_start; u < d.rack_unit_start + d.rack_unit_height; u++) {
          s.add(u);
        }
      }
    }
    return s;
  }, [rackDevices]);

  // ─── Mouse move — handles both drag and resize ──────────────────────────────

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragState && rackRef.current) {
        const rect = rackRef.current.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const rawUnit = Math.round(relativeY / U_HEIGHT) + 1;
        const clamped = Math.max(1, Math.min(rawUnit, rackTotalU - dragState.deviceHeight + 1));
        setDragState((prev) => prev ? { ...prev, currentUnit: clamped } : null);
      } else if (resizeState) {
        const deltaY     = e.clientY - resizeState.startMouseY;
        const deltaUnits = Math.round(deltaY / U_HEIGHT);
        const raw        = resizeState.originalHeight + deltaUnits;
        const maxH       = rackTotalU - resizeState.unitStart + 1;
        setResizeState((prev) => prev ? { ...prev, currentHeight: Math.max(1, Math.min(raw, maxH)) } : null);
      }
    },
    [dragState, resizeState, rackTotalU],
  );

  // ─── Mouse up — commits drag or resize ─────────────────────────────────────

  const handleMouseUp = useCallback(async () => {
    document.body.style.userSelect = '';

    if (dragState) {
      const { deviceId, originalUnit, currentUnit, deviceHeight } = dragState;
      setDragState(null);
      if (currentUnit === originalUnit) return;
      if (hasConflict(rackDevices, deviceId, currentUnit, deviceHeight)) return;
      try {
        await api.put(`/devices/${deviceId}`, { rack_unit_start: currentUnit });
        qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
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
      if (hasConflict(rackDevices, deviceId, unitStart, currentHeight)) return;
      try {
        await api.put(`/devices/${deviceId}`, { rack_unit_size: currentHeight });
        qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
        qc.invalidateQueries({ queryKey: ['devices'] });
      } catch {
        refetch();
      }
    }
  }, [dragState, resizeState, rackDevices, rackId, qc, refetch]);

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
      startMouseY:  e.clientY,
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading rack…</span>
      </div>
    );
  }

  const usedU = rackDevices.reduce((s, d) => s + d.rack_unit_height, 0);
  const isInteracting = dragState != null || resizeState != null;

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
          onClick={() => { setAddDeviceAtUnit(null); setShowAddDevice(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Device
        </button>
      </div>

      {/* Rack scroll area */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex justify-center p-6">
          <div className="flex shadow-xl" style={{ width: 520 + pduDevices.length * PDU_STRIP_W }}>
            {/* Left U-number column */}
            <UNumberColumn total={rackTotalU} side="left" />

            {/* Left PDU rail */}
            {leftPdus.length > 0 && (
              <PduRail pdus={leftPdus} totalU={rackTotalU} uHeight={U_HEIGHT} stripW={PDU_STRIP_W} side="left" onClick={(pdu) => onDeviceClick(deviceToPanel(pdu))} />
            )}

            {/* Main rack body */}
            <div
              ref={rackRef}
              className="relative bg-slate-800 dark:bg-slate-900 border-y-2 border-slate-700 flex-1"
              style={{ height: rackTotalU * U_HEIGHT }}
            >
              {/* U-slot rows — empty slots are clickable to add a device */}
              {Array.from({ length: rackTotalU }).map((_, i) => {
                const u = i + 1;
                const isEmpty = !occupiedSlots.has(u);
                const interactive = isEmpty && !isInteracting;
                return (
                  <div
                    key={i}
                    className={[
                      'absolute left-0 right-0 border-b border-slate-700/50',
                      interactive ? 'cursor-pointer group hover:bg-slate-600/40' : '',
                    ].join(' ')}
                    style={{ top: i * U_HEIGHT, height: U_HEIGHT }}
                    onClick={interactive ? () => openAddDeviceAt(u) : undefined}
                  >
                    {interactive && (
                      <div className="hidden group-hover:flex items-center justify-center h-full gap-1 text-slate-400 text-[10px] pointer-events-none select-none">
                        <Plus className="w-3 h-3" />
                        U{u}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Device tiles */}
              {rackDevices.map((device) => {
                if (device.rack_unit_start == null) return null;

                const isDragging = dragState?.deviceId === device.id;
                const isResizing = resizeState?.deviceId === device.id;

                const displayUnit   = isDragging ? dragState!.currentUnit   : device.rack_unit_start;
                const displayHeight = isResizing ? resizeState!.currentHeight : device.rack_unit_height;

                const isConflict =
                  (isDragging && hasConflict(rackDevices, device.id, dragState!.currentUnit, device.rack_unit_height)) ||
                  (isResizing && hasConflict(rackDevices, device.id, device.rack_unit_start!, resizeState!.currentHeight));

                const isConflictTarget =
                  !isDragging && !isResizing && device.rack_unit_start != null &&
                  (() => {
                    if (dragState) {
                      const newEnd = dragState.currentUnit + dragState.deviceHeight - 1;
                      const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                      return dragState.currentUnit <= dEnd && newEnd >= device.rack_unit_start!;
                    }
                    if (resizeState) {
                      const rd = rackDevices.find((d) => d.id === resizeState.deviceId);
                      if (!rd || rd.rack_unit_start == null) return false;
                      const newEnd = rd.rack_unit_start + resizeState.currentHeight - 1;
                      const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                      return rd.rack_unit_start <= dEnd && newEnd >= device.rack_unit_start!;
                    }
                    return false;
                  })();

                return (
                  <DeviceTile
                    key={device.id}
                    device={device}
                    displayUnit={displayUnit}
                    displayHeight={displayHeight}
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

              {/* Empty rack hint */}
              {rackDevices.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm pointer-events-none">
                  Empty rack — click any slot or Add Device
                </div>
              )}
            </div>

            {/* Right PDU rail */}
            {rightPdus.length > 0 && (
              <PduRail pdus={rightPdus} totalU={rackTotalU} uHeight={U_HEIGHT} stripW={PDU_STRIP_W} side="right" onClick={(pdu) => onDeviceClick(deviceToPanel(pdu))} />
            )}

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
          Drag to move · drag bottom edge to resize · click empty slot to add
        </span>
      </div>

      {showAddDevice && elevation && (
        <AddDeviceModal
          rackId={rackId}
          rackName={rackName}
          totalUnits={rackTotalU}
          existingDevices={devices}
          initialUnit={addDeviceAtUnit ?? undefined}
          onClose={() => { setShowAddDevice(false); setAddDeviceAtUnit(null); }}
        />
      )}
    </div>
  );
}

// ─── PDU rail ─────────────────────────────────────────────────────────────────

interface PduRailProps {
  pdus: RackElevationDevice[];
  totalU: number;
  uHeight: number;
  stripW: number;
  side: 'left' | 'right';
  onClick: (pdu: RackElevationDevice) => void;
}

function PduRail({ pdus, totalU, uHeight, stripW, side, onClick }: PduRailProps) {
  return (
    <div
      className={[
        'relative bg-slate-950 border-y-2 border-slate-700 shrink-0',
        side === 'left' ? 'border-r border-slate-700' : 'border-l border-slate-700',
      ].join(' ')}
      style={{ width: pdus.length * stripW, height: totalU * uHeight }}
    >
      {pdus.map((pdu, idx) => {
        const colors    = DEVICE_COLORS.pdu;
        const statusDot = STATUS_DOT[pdu.status] ?? STATUS_DOT.unknown;
        return (
          <div
            key={pdu.id}
            className={`absolute inset-y-0 cursor-pointer hover:brightness-125 transition-all flex flex-col items-center py-2 gap-1 ${colors.bg}`}
            style={{ left: idx * stripW, width: stripW - 1 }}
            onClick={() => onClick(pdu)}
            title={`${pdu.name} — PDU${pdu.status !== 'active' ? ` (${pdu.status})` : ''}`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
            <span
              className="text-[9px] text-white font-medium flex-1 overflow-hidden"
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxHeight: totalU * uHeight - 40,
              }}
            >
              {pdu.name}
            </span>
            <span className={`shrink-0 ${colors.text}`}>
              <DeviceIcon deviceType="pdu" size={11} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── U-number column ──────────────────────────────────────────────────────────

function UNumberColumn({ total, side }: { total: number; side: 'left' | 'right' }) {
  return (
    <div
      className={[
        'bg-slate-900 dark:bg-black border-slate-700 border-y-2 flex flex-col shrink-0',
        side === 'left' ? 'border-l-2 rounded-l-md' : 'border-r-2 rounded-r-md',
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
  displayHeight: number;
  isDragging: boolean;
  isResizing: boolean;
  isConflict: boolean;
  isConflictTarget: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function DeviceTile({
  device,
  displayUnit,
  displayHeight,
  isDragging,
  isResizing,
  isConflict,
  isConflictTarget,
  onMouseDown,
  onResizeStart,
  onClick,
}: DeviceTileProps) {
  const isChassis = device.device_type === 'blade_chassis';
  const dtKey = (
    ['server', 'switch', 'router', 'firewall', 'storage', 'pdu', 'patch_panel', 'blade_chassis', 'blade', 'generic'] as const
  ).includes(device.device_type as never)
    ? (device.device_type as 'server')
    : 'generic';
  const colors    = DEVICE_COLORS[dtKey] ?? DEVICE_COLORS.generic;
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;

  const top    = (displayUnit - 1) * U_HEIGHT;
  const height = displayHeight * U_HEIGHT;

  return (
    <div
      className={[
        'absolute left-0 right-0 flex items-center gap-2 px-2 select-none group',
        'border-y transition-all duration-75',
        isDragging || isResizing ? 'z-20 cursor-grabbing' : 'z-10 cursor-pointer',
        isDragging ? 'opacity-90 shadow-2xl scale-x-[0.98]' : '',
        isConflict
          ? 'bg-red-900/80 border-red-500'
          : isConflictTarget
          ? 'bg-red-950/60 border-red-600 ring-1 ring-red-500/50'
          : isChassis
          ? `${colors.bg} border-slate-600 hover:brightness-110`
          : 'bg-slate-600 hover:bg-slate-500 border-slate-500 hover:border-slate-400',
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
      <span className="text-xs font-medium text-slate-100 truncate flex-1 leading-tight" title={device.name}>
        {device.name}
        {isChassis && <span className="ml-1.5 text-[10px] text-slate-300 opacity-70">(chassis ▶)</span>}
      </span>

      {/* Power — only when tall enough */}
      {height >= U_HEIGHT * 2 && device.power_rated_w && (
        <span className="text-[10px] text-slate-400 shrink-0">{device.power_rated_w}W</span>
      )}

      {/* Status dot */}
      <span className={`shrink-0 w-2 h-2 rounded-full ${statusDot}`} title={device.status} />

      {/* Live feedback during drag */}
      {isDragging && (
        <span className="absolute right-2 text-[10px] text-slate-300 font-mono">
          U{displayUnit}
          {isConflict && <span className="text-red-400 ml-1">conflict!</span>}
        </span>
      )}

      {/* Live feedback during resize */}
      {isResizing && (
        <span className="absolute right-2 text-[10px] text-slate-300 font-mono">
          {displayHeight}U
          {isConflict && <span className="text-red-400 ml-1">conflict!</span>}
        </span>
      )}

      {/* Resize handle — visible on tile hover, cursor changes to ns-resize */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize"
        style={{ height: RESIZE_HANDLE_H }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeStart(e);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-px bg-slate-300/70 rounded-full" />
      </div>
    </div>
  );
}
