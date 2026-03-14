/**
 * RackElevation — interactive rack elevation widget (280 px wide).
 *
 * Used in:
 *   - DatacenterFloorPlan elevation mode (side-by-side per rack)
 *   - Any other view that needs a compact but interactive rack widget
 *
 * Features:
 *   - Drag device vertically  → live preview + conflict highlight → PUT on drop
 *   - Drag bottom-edge handle → resize rack_unit_height live     → PUT on release
 *   - Click empty U-slot      → AddDeviceModal pre-filled to that U
 *   - Click device            → onDeviceClick callback (or navigate to /devices/:id)
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useRackElevation } from '@/api/topology';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/index';
import { DEVICE_COLORS, STATUS_DOT } from './icons';
import type { DeviceType, RackElevationDevice } from '@/types/topology';
import { AddDeviceModal } from './physical/AddDeviceModal';

const U_HEIGHT_PX  = 24;   // px per rack unit
const U_LABEL_W    = 28;   // px for left U-number strip
const RESIZE_H     = 5;    // px hit-area at bottom edge of each tile
const PDU_STRIP_W  = 20;   // px per PDU in the side-rail strip

// ─── Interaction state ────────────────────────────────────────────────────────

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

// ─── Conflict helper ──────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface RackElevationProps {
  rackId: string;
  onClose?: () => void;
  /** Called when a device tile is clicked. Falls back to navigate(/devices/:id). */
  onDeviceClick?: (device: RackElevationDevice) => void;
  /** Called when the rack header is clicked (for elevation mode rack selection). */
  onHeaderClick?: () => void;
  /** Highlight the header with a selection ring (elevation mode). */
  selected?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RackElevation({ rackId, onClose, onDeviceClick, onHeaderClick, selected }: RackElevationProps) {
  const navigate  = useNavigate();
  const { data, isLoading, isError, refetch } = useRackElevation(rackId);
  const qc        = useQueryClient();
  const rackRef   = useRef<HTMLDivElement>(null);

  const [dragState, setDragState]       = useState<DragState | null>(null);
  const [resizeState, setResizeState]   = useState<ResizeState | null>(null);
  const [showAddDevice, setShowAddDevice]       = useState(false);
  const [addDeviceAtUnit, setAddDeviceAtUnit]   = useState<number | null>(null);

  const devices    = useMemo(() => data?.devices ?? [], [data?.devices]);
  const totalU     = data?.total_units ?? 1;

  // PDUs mount on the side rails — all other devices occupy U-slots
  const rackDevices = useMemo(() => devices.filter(d => d.device_type !== 'pdu'), [devices]);
  const pduDevices  = useMemo(() => devices.filter(d => d.device_type === 'pdu'),  [devices]);
  // Even-indexed PDUs → left rail, odd-indexed → right rail
  const leftPdus  = useMemo(() => pduDevices.filter((_, i) => i % 2 === 0), [pduDevices]);
  const rightPdus = useMemo(() => pduDevices.filter((_, i) => i % 2 === 1), [pduDevices]);

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

  // ─── Mouse move ─────────────────────────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState && rackRef.current) {
      const rect = rackRef.current.getBoundingClientRect();
      const rawUnit = Math.round((e.clientY - rect.top) / U_HEIGHT_PX) + 1;
      const clamped = Math.max(1, Math.min(rawUnit, totalU - dragState.deviceHeight + 1));
      setDragState(prev => prev ? { ...prev, currentUnit: clamped } : null);
    } else if (resizeState) {
      const delta    = e.clientY - resizeState.startMouseY;
      const raw      = resizeState.originalHeight + Math.round(delta / U_HEIGHT_PX);
      const maxH     = totalU - resizeState.unitStart + 1;
      setResizeState(prev => prev ? { ...prev, currentHeight: Math.max(1, Math.min(raw, maxH)) } : null);
    }
  }, [dragState, resizeState, totalU]);

  // ─── Mouse up ───────────────────────────────────────────────────────────────

  const handleMouseUp = useCallback(async () => {
    document.body.style.userSelect = '';

    if (dragState) {
      const { deviceId, originalUnit, currentUnit, deviceHeight } = dragState;
      setDragState(null);
      if (currentUnit !== originalUnit && !hasConflict(rackDevices, deviceId, currentUnit, deviceHeight)) {
        try {
          await api.put(`/devices/${deviceId}`, { rack_unit_start: currentUnit });
          qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
          qc.invalidateQueries({ queryKey: ['topology', 'floor-plan'] });
        } catch { refetch(); }
      }
      return;
    }

    if (resizeState) {
      const { deviceId, unitStart, originalHeight, currentHeight } = resizeState;
      setResizeState(null);
      if (currentHeight !== originalHeight && !hasConflict(rackDevices, deviceId, unitStart, currentHeight)) {
        try {
          await api.put(`/devices/${deviceId}`, { rack_unit_size: currentHeight });
          qc.invalidateQueries({ queryKey: ['topology', 'rack-elevation', rackId] });
          qc.invalidateQueries({ queryKey: ['topology', 'floor-plan'] });
        } catch { refetch(); }
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

  // ─── Starters ───────────────────────────────────────────────────────────────

  function startDrag(e: React.MouseEvent, device: RackElevationDevice) {
    if (device.rack_unit_start == null) return;
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setDragState({ deviceId: device.id, originalUnit: device.rack_unit_start, currentUnit: device.rack_unit_start, deviceHeight: device.rack_unit_height });
  }

  function startResize(e: React.MouseEvent, device: RackElevationDevice) {
    if (device.rack_unit_start == null) return;
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    setResizeState({ deviceId: device.id, unitStart: device.rack_unit_start, originalHeight: device.rack_unit_height, currentHeight: device.rack_unit_height, startMouseY: e.clientY });
  }

  const isInteracting = dragState != null || resizeState != null;

  // ─── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm select-none">
        Loading rack…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm select-none">
        Failed to load rack elevation.
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col select-none" style={{ width: 280 + pduDevices.length * PDU_STRIP_W }}>
      {/* Header */}
      <div
        className={[
          'flex items-center justify-between mb-2 rounded px-1.5 py-1 -mx-1.5 -mt-1',
          onHeaderClick
            ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors'
            : '',
          selected
            ? 'ring-2 ring-sky-500 bg-sky-50 dark:bg-sky-950/30'
            : '',
        ].join(' ')}
        onClick={onHeaderClick}
        role={onHeaderClick ? 'button' : undefined}
        title={onHeaderClick ? `Select ${data.name}` : undefined}
      >
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{data.name}</h3>
          <span className="text-xs text-slate-400">
            {totalU}U · {devices.length} device{devices.length !== 1 ? 's' : ''}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Elevation grid */}
      <div className="border border-slate-300 dark:border-slate-600 rounded overflow-hidden">
        <div className="flex">
          {/* U-number strip */}
          <div className="bg-slate-50 dark:bg-slate-950 shrink-0 border-r border-slate-200 dark:border-slate-700" style={{ width: U_LABEL_W }}>
            {Array.from({ length: totalU }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-center border-b border-slate-200 dark:border-slate-700 last:border-b-0 text-[10px] font-mono text-slate-400 dark:text-slate-500"
                style={{ height: U_HEIGHT_PX }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Left PDU rail */}
          {leftPdus.length > 0 && leftPdus.map((pdu) => {
            const colors    = DEVICE_COLORS[pdu.device_type as DeviceType] ?? DEVICE_COLORS.pdu;
            const statusDot = STATUS_DOT[pdu.status] ?? STATUS_DOT.unknown;
            return (
              <div
                key={pdu.id}
                className={`relative shrink-0 cursor-pointer hover:brightness-125 transition-all flex flex-col items-center py-1.5 gap-0.5 border-r border-slate-300 dark:border-slate-600 ${colors.bg}`}
                style={{ width: PDU_STRIP_W, height: totalU * U_HEIGHT_PX }}
                onClick={() => onDeviceClick ? onDeviceClick(pdu) : navigate(`/devices/${pdu.id}`)}
                title={`${pdu.name} — PDU${pdu.status !== 'active' ? ` (${pdu.status})` : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                <span
                  className="text-[9px] text-white font-medium flex-1 overflow-hidden"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxHeight: totalU * U_HEIGHT_PX - 32 }}
                >
                  {pdu.name}
                </span>
              </div>
            );
          })}

          {/* Rack body — absolute-positioned device tiles */}
          <div
            ref={rackRef}
            className="relative flex-1 bg-slate-100 dark:bg-slate-800/40"
            style={{ height: totalU * U_HEIGHT_PX }}
          >
            {/* U-slot rows — empty ones are clickable */}
            {Array.from({ length: totalU }).map((_, i) => {
              const u = i + 1;
              const isEmpty = !occupiedSlots.has(u);
              const interactive = isEmpty && !isInteracting;
              return (
                <div
                  key={i}
                  className={[
                    'absolute left-0 right-0 border-b border-slate-200 dark:border-slate-700 last:border-b-0',
                    interactive ? 'cursor-pointer group hover:bg-sky-50 dark:hover:bg-sky-950/30' : '',
                  ].join(' ')}
                  style={{ top: i * U_HEIGHT_PX, height: U_HEIGHT_PX }}
                  onClick={interactive ? () => { setAddDeviceAtUnit(u); setShowAddDevice(true); } : undefined}
                >
                  {interactive && (
                    <div className="hidden group-hover:flex items-center gap-1 px-2 h-full text-[9px] text-sky-400 pointer-events-none">
                      <Plus className="w-2.5 h-2.5" />
                      add
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
                    const ne = dragState.currentUnit + dragState.deviceHeight - 1;
                    const de = device.rack_unit_start! + device.rack_unit_height - 1;
                    return dragState.currentUnit <= de && ne >= device.rack_unit_start!;
                  }
                  if (resizeState) {
                    const rd = rackDevices.find(d => d.id === resizeState.deviceId);
                    if (!rd || rd.rack_unit_start == null) return false;
                    const ne = rd.rack_unit_start + resizeState.currentHeight - 1;
                    const de = device.rack_unit_start! + device.rack_unit_height - 1;
                    return rd.rack_unit_start <= de && ne >= device.rack_unit_start!;
                  }
                  return false;
                })();

              const colors    = DEVICE_COLORS[device.device_type as DeviceType] ?? DEVICE_COLORS.generic;
              const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;
              const top    = (displayUnit - 1) * U_HEIGHT_PX;
              const height = displayHeight * U_HEIGHT_PX;

              return (
                <div
                  key={device.id}
                  className={[
                    'absolute left-0 right-0 flex items-center gap-1.5 px-2 border-y transition-all duration-75 overflow-hidden group',
                    isDragging || isResizing ? 'z-20 cursor-grabbing' : 'z-10 cursor-pointer hover:brightness-110 active:brightness-95',
                    isDragging ? 'opacity-90 shadow-lg' : '',
                    isConflict
                      ? 'bg-red-600/80 border-red-400'
                      : isConflictTarget
                      ? 'bg-red-800/60 border-red-500'
                      : colors.bg + ' border-transparent',
                  ].join(' ')}
                  style={{ top, height }}
                  onMouseDown={(e) => startDrag(e, device)}
                  onClick={() => {
                    if (isInteracting) return;
                    onDeviceClick ? onDeviceClick(device) : navigate(`/devices/${device.id}`);
                  }}
                  title={`${device.name} — ${device.device_type}${device.model ? ` · ${device.model}` : ''}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-[11px] font-medium truncate leading-tight">
                      {device.name}
                    </p>
                    {height >= U_HEIGHT_PX * 2 && device.model && (
                      <p className="text-white/70 text-[9px] truncate leading-tight">
                        {device.vendor ? `${device.vendor} ` : ''}{device.model}
                      </p>
                    )}
                  </div>
                  {height >= U_HEIGHT_PX * 2 && device.power_actual_w != null && (
                    <span className="ml-auto shrink-0 text-[9px] text-white/70 font-mono">
                      {device.power_actual_w}W
                    </span>
                  )}

                  {/* Live drag label */}
                  {isDragging && (
                    <span className="absolute right-1 text-[9px] text-white/80 font-mono">
                      U{displayUnit}{isConflict && <span className="text-red-200 ml-0.5">!</span>}
                    </span>
                  )}

                  {/* Live resize label */}
                  {isResizing && (
                    <span className="absolute right-1 text-[9px] text-white/80 font-mono">
                      {displayHeight}U{isConflict && <span className="text-red-200 ml-0.5">!</span>}
                    </span>
                  )}

                  {/* Resize handle */}
                  <div
                    className="absolute bottom-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize"
                    style={{ height: RESIZE_H }}
                    onMouseDown={(e) => { e.stopPropagation(); startResize(e, device); }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-8 h-px bg-white/50 rounded-full" />
                  </div>
                </div>
              );
            })}

            {rackDevices.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-[11px] pointer-events-none">
                Empty — click a slot to add
              </div>
            )}
          </div>

          {/* Right PDU rail */}
          {rightPdus.length > 0 && rightPdus.map((pdu) => {
            const colors    = DEVICE_COLORS[pdu.device_type as DeviceType] ?? DEVICE_COLORS.pdu;
            const statusDot = STATUS_DOT[pdu.status] ?? STATUS_DOT.unknown;
            return (
              <div
                key={pdu.id}
                className={`relative shrink-0 cursor-pointer hover:brightness-125 transition-all flex flex-col items-center py-1.5 gap-0.5 border-l border-slate-300 dark:border-slate-600 ${colors.bg}`}
                style={{ width: PDU_STRIP_W, height: totalU * U_HEIGHT_PX }}
                onClick={() => onDeviceClick ? onDeviceClick(pdu) : navigate(`/devices/${pdu.id}`)}
                title={`${pdu.name} — PDU${pdu.status !== 'active' ? ` (${pdu.status})` : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                <span
                  className="text-[9px] text-white font-medium flex-1 overflow-hidden"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxHeight: totalU * U_HEIGHT_PX - 32 }}
                >
                  {pdu.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-2 justify-between items-center">
        <div className="flex gap-2">
          {(['active', 'inactive', 'maintenance'] as const).map((s) => (
            <div key={s} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] text-slate-400">drag · resize · click to add</span>
      </div>

      {showAddDevice && data && (
        <AddDeviceModal
          rackId={rackId}
          rackName={data.name}
          totalUnits={totalU}
          existingDevices={devices}
          initialUnit={addDeviceAtUnit ?? undefined}
          onClose={() => { setShowAddDevice(false); setAddDeviceAtUnit(null); }}
        />
      )}
    </div>
  );
}
