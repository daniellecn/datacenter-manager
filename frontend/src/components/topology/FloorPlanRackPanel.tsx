/**
 * FloorPlanRackPanel — Interactive rack elevation used in the Floor Plan's right side panel.
 *
 * Features:
 * - U-slot elevation with device tiles (fits in w-80 side panel)
 * - Click device → DeviceDetailPanel (overlays panel body; back button returns to rack view)
 * - Click empty U-slot → AddDeviceModal pre-filled to that U
 * - Drag device vertically → live conflict preview → PUT /devices/{id} on drop
 * - Drag bottom-edge resize handle → change rack_unit_height live → PUT /devices/{id} on release
 * - "Add Device" button → AddDeviceModal pre-filled with rack context
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Loader2, Plus, X, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRackElevation } from '@/api/topology';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/api/index';
import type { RackElevationDevice, DeviceType } from '@/types/topology';
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from './icons';
import type { DevicePanelInfo } from './physical/DeviceDetailPanel';
import { AddDeviceModal } from './physical/AddDeviceModal';
import { MapPin, Cpu, Zap, ExternalLink } from 'lucide-react';

const U_HEIGHT = 22;       // px per rack unit — compact for the side panel
const U_COL_W  = 22;       // px for the left U-number column
const RESIZE_HANDLE_H = 5; // px — hit area at bottom edge of each device tile
const PDU_STRIP_W = 16;    // px per PDU in the side-rail strip

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  rackId: string;
  rackName: string;
  totalUnits: number;
  onClose: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FloorPlanRackPanel({ rackId, rackName, totalUnits, onClose }: Props) {
  const { data: elevation, isLoading, refetch } = useRackElevation(rackId);
  const [dragState, setDragState]     = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePanelInfo | null>(null);
  const [showAddDevice, setShowAddDevice]   = useState(false);
  const [addDeviceAtUnit, setAddDeviceAtUnit] = useState<number | null>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const devices    = useMemo(() => elevation?.devices ?? [], [elevation?.devices]);
  const rackTotalU = elevation?.total_units ?? totalUnits;

  // PDUs mount on the side rails — all other devices occupy U-slots
  const rackDevices = useMemo(() => devices.filter((d) => d.device_type !== 'pdu'), [devices]);
  const pduDevices  = useMemo(() => devices.filter((d) => d.device_type === 'pdu'),  [devices]);
  // Even-indexed PDUs → left rail, odd-indexed → right rail
  const leftPdus  = useMemo(() => pduDevices.filter((_, i) => i % 2 === 0), [pduDevices]);
  const rightPdus = useMemo(() => pduDevices.filter((_, i) => i % 2 === 1), [pduDevices]);

  // Occupied U-slot set — used to decide which rows are clickable
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

  // ─── Mouse move — drag and resize ──────────────────────────────────────────

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState && rackRef.current) {
      const rect = rackRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const rawUnit = Math.round(relativeY / U_HEIGHT) + 1;
      const clamped = Math.max(1, Math.min(rawUnit, rackTotalU - dragState.deviceHeight + 1));
      setDragState(prev => prev ? { ...prev, currentUnit: clamped } : null);
    } else if (resizeState) {
      const deltaY     = e.clientY - resizeState.startMouseY;
      const deltaUnits = Math.round(deltaY / U_HEIGHT);
      const raw        = resizeState.originalHeight + deltaUnits;
      const maxH       = rackTotalU - resizeState.unitStart + 1;
      setResizeState(prev => prev ? { ...prev, currentHeight: Math.max(1, Math.min(raw, maxH)) } : null);
    }
  }, [dragState, resizeState, rackTotalU]);

  // ─── Mouse up — commit drag or resize ──────────────────────────────────────

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
        qc.invalidateQueries({ queryKey: ['topology', 'floor-plan'] });
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
        qc.invalidateQueries({ queryKey: ['topology', 'floor-plan'] });
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

  const isInteracting = dragState != null || resizeState != null;

  return (
    <div className="flex flex-col h-full select-none bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        {selectedDevice ? (
          <button
            onClick={() => setSelectedDevice(null)}
            className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {rackName}
          </button>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{rackName}</p>
            <p className="text-xs text-slate-400">{rackTotalU}U · {devices.length} device{devices.length !== 1 ? 's' : ''}</p>
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {!selectedDevice && (
            <button
              onClick={() => { setAddDeviceAtUnit(null); setShowAddDevice(true); }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Device
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedDevice ? (
          <DeviceDetailInline device={selectedDevice} />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading rack…</span>
          </div>
        ) : (
          <div className="p-3">
            <div
              className="border border-slate-200 dark:border-slate-700 rounded overflow-hidden flex"
              style={{ width: '100%' }}
            >
              {/* Left PDU rail */}
              {leftPdus.length > 0 && leftPdus.map((pdu) => {
                const colors    = DEVICE_COLORS[pdu.device_type as DeviceType] ?? DEVICE_COLORS.pdu;
                const statusDot = STATUS_DOT[pdu.status] ?? STATUS_DOT.unknown;
                return (
                  <div
                    key={pdu.id}
                    className={`relative shrink-0 cursor-pointer hover:brightness-125 transition-all flex flex-col items-center py-1 gap-0.5 border-r border-slate-200 dark:border-slate-700 ${colors.bg}`}
                    style={{ width: PDU_STRIP_W, height: rackTotalU * U_HEIGHT }}
                    onClick={() => setSelectedDevice(deviceToPanel(pdu))}
                    title={`${pdu.name} — PDU${pdu.status !== 'active' ? ` (${pdu.status})` : ''}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                    <span
                      className="text-[8px] text-white font-medium flex-1 overflow-hidden"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {pdu.name}
                    </span>
                  </div>
                );
              })}

              <div
                ref={rackRef}
                className="relative flex-1"
                style={{ height: rackTotalU * U_HEIGHT }}
              >
                {/* Background rows — empty ones are clickable */}
                {Array.from({ length: rackTotalU }).map((_, i) => {
                  const u = i + 1;
                  const isEmpty = !occupiedSlots.has(u);
                  const interactive = isEmpty && !isInteracting;
                  return (
                    <div
                      key={i}
                      className={[
                        'absolute left-0 right-0 flex border-b border-slate-100 dark:border-slate-800 last:border-b-0',
                        interactive ? 'cursor-pointer group hover:bg-sky-50 dark:hover:bg-sky-950/30' : '',
                      ].join(' ')}
                      style={{ top: i * U_HEIGHT, height: U_HEIGHT }}
                      onClick={interactive ? () => openAddDeviceAt(u) : undefined}
                    >
                      {/* U-number label */}
                      <div
                        className="flex items-center justify-center text-[9px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800 shrink-0"
                        style={{ width: U_COL_W }}
                      >
                        {i + 1}
                      </div>
                      {/* Empty slot hint */}
                      {interactive && (
                        <div className="hidden group-hover:flex items-center gap-1 pl-2 text-[9px] text-sky-400 pointer-events-none">
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
                        const newEnd = dragState.currentUnit + dragState.deviceHeight - 1;
                        const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                        return dragState.currentUnit <= dEnd && newEnd >= device.rack_unit_start!;
                      }
                      if (resizeState) {
                        const rd = rackDevices.find(d => d.id === resizeState.deviceId);
                        if (!rd || rd.rack_unit_start == null) return false;
                        const newEnd = rd.rack_unit_start + resizeState.currentHeight - 1;
                        const dEnd   = device.rack_unit_start! + device.rack_unit_height - 1;
                        return rd.rack_unit_start <= dEnd && newEnd >= device.rack_unit_start!;
                      }
                      return false;
                    })();

                  const dtKey  = device.device_type as DeviceType;
                  const colors = DEVICE_COLORS[dtKey] ?? DEVICE_COLORS.generic;
                  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;
                  const top    = (displayUnit - 1) * U_HEIGHT;
                  const height = displayHeight * U_HEIGHT;

                  return (
                    <div
                      key={device.id}
                      className={[
                        'absolute flex items-center gap-1.5 select-none border-y transition-all duration-75 overflow-hidden group',
                        isDragging || isResizing ? 'z-20 cursor-grabbing' : 'z-10 cursor-pointer hover:brightness-110',
                        isDragging ? 'opacity-90 shadow-xl' : '',
                        isConflict
                          ? 'bg-red-500/80 border-red-400'
                          : isConflictTarget
                          ? 'bg-red-700/60 border-red-500'
                          : `${colors.bg} border-slate-500/20`,
                      ].join(' ')}
                      style={{ top, height, left: U_COL_W, right: 0 }}
                      onMouseDown={(e) => startDrag(e, device)}
                      onClick={() => {
                        if (isInteracting) return;
                        setSelectedDevice(deviceToPanel(device));
                      }}
                    >
                      <span className={`shrink-0 pl-1.5 ${colors.text} text-white/80`}>
                        <DeviceIcon deviceType={dtKey} size={11} />
                      </span>
                      <span
                        className="text-[11px] text-white font-medium truncate flex-1 leading-tight"
                        title={device.name}
                      >
                        {device.name}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mr-1.5 ${statusDot}`} />

                      {/* Live label during drag */}
                      {isDragging && (
                        <span className="absolute right-1.5 text-[9px] text-white/80 font-mono">
                          U{displayUnit}{isConflict && <span className="text-red-200 ml-0.5">!</span>}
                        </span>
                      )}

                      {/* Live label during resize */}
                      {isResizing && (
                        <span className="absolute right-1.5 text-[9px] text-white/80 font-mono">
                          {displayHeight}U{isConflict && <span className="text-red-200 ml-0.5">!</span>}
                        </span>
                      )}

                      {/* Resize handle — bottom edge, visible on hover */}
                      <div
                        className="absolute bottom-0 left-0 right-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize"
                        style={{ height: RESIZE_HANDLE_H }}
                        onMouseDown={(e) => { e.stopPropagation(); startResize(e, device); }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="w-8 h-px bg-white/50 rounded-full" />
                      </div>
                    </div>
                  );
                })}

                {rackDevices.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pl-6 text-slate-400 text-xs pointer-events-none">
                    Empty rack — click any slot to add
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
                    className={`relative shrink-0 cursor-pointer hover:brightness-125 transition-all flex flex-col items-center py-1 gap-0.5 border-l border-slate-200 dark:border-slate-700 ${colors.bg}`}
                    style={{ width: PDU_STRIP_W, height: rackTotalU * U_HEIGHT }}
                    onClick={() => setSelectedDevice(deviceToPanel(pdu))}
                    title={`${pdu.name} — PDU${pdu.status !== 'active' ? ` (${pdu.status})` : ''}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                    <span
                      className="text-[8px] text-white font-medium flex-1 overflow-hidden"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {pdu.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-2">
                {(['active', 'maintenance', 'inactive'] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1 text-[9px] text-slate-400">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                    <span className="capitalize">{s}</span>
                  </span>
                ))}
              </div>
              <span className="text-[9px] text-slate-400">drag to move · bottom edge to resize</span>
            </div>
          </div>
        )}
      </div>

      {/* Add device modal */}
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

// ─── Exported wrapper for "elevation mode" used in DatacenterFloorPlan ────────

export function DeviceDetailInElevation({ device, onClose }: { device: DevicePanelInfo; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">Device detail</span>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <DeviceDetailInline device={device} />
    </div>
  );
}

function DeviceDetailInline({ device }: { device: DevicePanelInfo }) {
  const navigate = useNavigate();
  const KNOWN_TYPES: DeviceType[] = [
    'server', 'switch', 'router', 'firewall', 'storage',
    'pdu', 'patch_panel', 'blade_chassis', 'blade', 'generic',
  ];
  const dt: DeviceType = KNOWN_TYPES.includes(device.device_type as DeviceType)
    ? (device.device_type as DeviceType)
    : 'generic';
  const colors    = DEVICE_COLORS[dt];
  const statusDot = STATUS_DOT[device.status] ?? STATUS_DOT.unknown;
  const vendorModel = [device.vendor ?? device.manufacturer, device.model].filter(Boolean).join(' · ');
  const uEnd =
    device.rack_unit_start != null && device.rack_unit_height != null
      ? device.rack_unit_start + device.rack_unit_height - 1
      : null;

  return (
    <div className="flex flex-col h-full">
      {/* Colored header band */}
      <div className={`${colors.bg} px-4 py-3 flex items-center gap-2.5`}>
        <DeviceIcon deviceType={dt} size={18} className="text-white shrink-0" />
        <div className="min-w-0">
          <p className="text-[11px] text-white/70 capitalize leading-none mb-0.5">
            {device.device_type.replace(/_/g, ' ')}
          </p>
          <p className="text-sm font-bold text-white leading-tight truncate" title={device.name}>
            {device.name}
          </p>
        </div>
      </div>

      {/* Detail rows */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-sm capitalize text-slate-700 dark:text-slate-300">{device.status}</span>
        </div>

        {device.rack_unit_start != null && uEnd != null && (
          <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              U{device.rack_unit_start}–U{uEnd}
              <span className="ml-1.5 text-xs text-slate-400">({device.rack_unit_height}U)</span>
            </span>
          </div>
        )}

        {vendorModel && (
          <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{vendorModel}</span>
          </div>
        )}

        {(device.power_rated_w || device.power_actual_w) && (
          <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Zap className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex flex-wrap items-center gap-x-1">
              {device.power_actual_w != null && <span>{device.power_actual_w}W actual</span>}
              {device.power_actual_w != null && device.power_rated_w != null && (
                <span className="text-slate-300 dark:text-slate-600">/</span>
              )}
              {device.power_rated_w != null && (
                <span className="text-slate-400">{device.power_rated_w}W rated</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <button
          onClick={() => navigate(`/devices/${device.id}`)}
          className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open full detail
        </button>
      </div>
    </div>
  );
}
