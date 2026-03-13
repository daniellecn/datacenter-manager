/**
 * Datacenter Floor Plan
 *
 * Two view modes toggled via the toolbar:
 *   • Tiles   — room sections with colored rack tiles (power utilization heat-map).
 *               Clicking a rack opens FloorPlanRackPanel (drag, add device, device detail).
 *   • Elevation — rooms sections where each rack is shown as a full rack-elevation diagram
 *                 side-by-side, scrollable. Clicking a device opens the device detail panel.
 */

import { useState } from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { useFloorPlan, useDatacenters } from '@/api/topology';
import { RackElevation } from './RackElevation';
import { FloorPlanRackPanel } from './FloorPlanRackPanel';
import type { DevicePanelInfo } from './physical/DeviceDetailPanel';
import { DeviceDetailInElevation } from './FloorPlanRackPanel';
import type { FloorPlanCorridor, FloorPlanRack, RackElevationDevice } from '@/types/topology';

// ─── Utilities ────────────────────────────────────────────────────────────────

function utilizationBg(pct: number | null): string {
  if (pct === null) return 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  if (pct >= 90)    return 'bg-red-500 text-white';
  if (pct >= 75)    return 'bg-orange-400 text-white';
  if (pct >= 50)    return 'bg-amber-300 text-slate-800';
  return 'bg-emerald-400 text-white';
}

// ─── Rack tile (tiles mode) ───────────────────────────────────────────────────

interface RackTileProps {
  rack: FloorPlanRack;
  onClick: (rack: FloorPlanRack) => void;
  selected: boolean;
}

function RackTile({ rack, onClick, selected }: RackTileProps) {
  const pct = rack.power_utilization_pct;
  const unitPct =
    rack.total_units > 0 ? Math.round((rack.used_units / rack.total_units) * 100) : 0;

  return (
    <button
      onClick={() => onClick(rack)}
      className={[
        'flex flex-col items-center justify-center rounded border-2 p-1',
        'transition-all duration-150 cursor-pointer text-center',
        'hover:scale-105 hover:shadow-md active:scale-95',
        utilizationBg(pct),
        selected
          ? 'ring-2 ring-sky-400 ring-offset-2 border-sky-500'
          : 'border-transparent',
      ].join(' ')}
      style={{ width: 72, height: 80 }}
      title={[
        rack.name,
        `Devices: ${rack.device_count}`,
        `U: ${rack.used_units}/${rack.total_units} (${unitPct}%)`,
        pct !== null ? `Power: ${pct.toFixed(0)}%` : 'Power: N/A',
        rack.power_actual_w !== null
          ? `${rack.power_actual_w}W / ${rack.power_max_w ?? '?'}W`
          : '',
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <span className="text-[11px] font-bold leading-tight truncate w-full px-1">
        {rack.name}
      </span>
      <span className="text-[9px] opacity-80 leading-tight mt-0.5">
        {rack.device_count} devices
      </span>
      <div className="mt-1 w-4/5 h-1 rounded-full bg-black/20">
        <div
          className="h-full rounded-full bg-white/70"
          style={{ width: `${Math.min(unitPct, 100)}%` }}
        />
      </div>
      {pct !== null && (
        <span className="text-[9px] font-mono opacity-80 leading-tight mt-0.5">
          {pct.toFixed(0)}% pwr
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DatacenterFloorPlanProps {
  /** If omitted, a datacenter selector is shown */
  datacenterId?: string;
}

export function DatacenterFloorPlan({ datacenterId: propDcId }: DatacenterFloorPlanProps) {
  const { data: dcs } = useDatacenters();
  const [selectedDcId, setSelectedDcId] = useState<string>(propDcId ?? '');
  const dcId = propDcId ?? selectedDcId;

  const { data, isLoading, isError } = useFloorPlan(dcId || undefined);

  // UI state
  const [viewMode, setViewMode] = useState<'tiles' | 'elevation'>('tiles');
  const [selectedRack, setSelectedRack] = useState<FloorPlanRack | null>(null);
  const [elevationDetail, setElevationDetail] = useState<DevicePanelInfo | null>(null);

  function handleRackClick(rack: FloorPlanRack) {
    setSelectedRack(prev => (prev?.id === rack.id ? null : rack));
  }

  function handleElevationDeviceClick(device: RackElevationDevice) {
    setElevationDetail({
      id: device.id,
      name: device.name,
      device_type: device.device_type,
      status: device.status,
      rack_unit_start: device.rack_unit_start,
      rack_unit_height: device.rack_unit_height,
      power_rated_w: device.power_rated_w,
      power_actual_w: device.power_actual_w,
      model: device.model,
      vendor: device.vendor,
    });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 min-w-0">

        {/* Datacenter selector (when not forced via prop) */}
        {!propDcId && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
              Datacenter
            </label>
            <select
              value={selectedDcId}
              onChange={(e) => {
                setSelectedDcId(e.target.value);
                setSelectedRack(null);
                setElevationDetail(null);
              }}
              className="border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">— select —</option>
              {dcs?.map((dc) => (
                <option key={dc.id} value={dc.id}>{dc.name}</option>
              ))}
            </select>
          </div>
        )}

        {!dcId && (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            Select a datacenter to view the floor plan.
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading floor plan…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-64 text-red-400 text-sm">
            Failed to load floor plan.
          </div>
        )}

        {data && (
          <>
            {/* Header: datacenter name + view toggle */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {data.name}
              </h2>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm text-xs">
                <button
                  onClick={() => { setViewMode('tiles'); setElevationDetail(null); }}
                  title="Tiles view"
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors',
                    viewMode === 'tiles'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Tiles
                </button>
                <button
                  onClick={() => { setViewMode('elevation'); setSelectedRack(null); setElevationDetail(null); }}
                  title="Rack elevation view"
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 font-medium transition-colors',
                    viewMode === 'elevation'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  <Rows3 className="w-3.5 h-3.5" />
                  Elevation
                </button>
              </div>
            </div>

            {/* Power utilization legend (tiles mode only) */}
            {viewMode === 'tiles' && (
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Power utilization:
                </span>
                {[
                  { label: '< 50%',  color: 'bg-emerald-400' },
                  { label: '50–75%', color: 'bg-amber-300' },
                  { label: '75–90%', color: 'bg-orange-400' },
                  { label: '≥ 90%',  color: 'bg-red-500' },
                  { label: 'N/A',    color: 'bg-slate-200 dark:bg-slate-700' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`h-3 w-3 rounded ${l.color}`} />
                    {l.label}
                  </div>
                ))}
              </div>
            )}

            {/* ── Rooms ───────────────────────────────────────────────────── */}
            {data.rooms.length === 0 ? (
              <p className="text-slate-400 text-sm">No rooms configured for this datacenter.</p>
            ) : (
              <div className="space-y-6">
                {data.rooms.map((room) => (
                  <section key={room.id}>
                    {(() => {
                      const allRacks = room.corridors.flatMap((c: FloorPlanCorridor) => c.racks);
                      return (
                        <>
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {room.name}
                            </h3>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {allRacks.length} rack{allRacks.length !== 1 ? 's' : ''}
                            </span>
                            {room.notes && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 italic truncate">
                                {room.notes}
                              </span>
                            )}
                          </div>

                          {allRacks.length === 0 ? (
                            <p className="text-xs text-slate-300 dark:text-slate-600 italic">No racks</p>
                          ) : viewMode === 'tiles' ? (
                            /* ── Tiles mode ─────────────────────────────────────── */
                            <div className="space-y-3">
                              {room.corridors.map((corridor: FloorPlanCorridor) => (
                                <div key={corridor.id}>
                                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wide">
                                    {corridor.name}
                                  </p>
                                  <div className="flex flex-wrap gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                                    {corridor.racks.map((rack) => (
                                      <RackTile
                                        key={rack.id}
                                        rack={rack}
                                        onClick={handleRackClick}
                                        selected={selectedRack?.id === rack.id}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* ── Elevation mode ─────────────────────────────────── */
                            <div className="space-y-3">
                              {room.corridors.map((corridor: FloorPlanCorridor) => (
                                <div key={corridor.id}>
                                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wide">
                                    {corridor.name}
                                  </p>
                                  <div className="flex flex-wrap gap-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 items-start">
                                    {corridor.racks.map((rack) => (
                                      <div key={rack.id} className="shrink-0" style={{ width: 280 }}>
                                        <RackElevation
                                          rackId={rack.id}
                                          onDeviceClick={handleElevationDeviceClick}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      {/* Tiles mode: FloorPlanRackPanel when a rack is selected */}
      {viewMode === 'tiles' && selectedRack && (
        <div className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <FloorPlanRackPanel
            rackId={selectedRack.id}
            rackName={selectedRack.name}
            totalUnits={selectedRack.total_units}
            onClose={() => setSelectedRack(null)}
          />
        </div>
      )}

      {/* Elevation mode: device detail panel when a device is clicked */}
      {viewMode === 'elevation' && elevationDetail && (
        <div className="w-80 shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <DeviceDetailInElevation
            device={elevationDetail}
            onClose={() => setElevationDetail(null)}
          />
        </div>
      )}
    </div>
  );
}
