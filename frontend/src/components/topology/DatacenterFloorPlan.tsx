/**
 * Datacenter Floor Plan
 *
 * Rooms are displayed as card sections; racks inside each room are rendered
 * as color-coded tiles (green → yellow → orange → red by power utilization).
 * Clicking a rack opens the RackElevation component in a modal-style overlay.
 */

import { useState } from "react";
import { useFloorPlan, useDatacenters } from "@/api/topology";
import { RackElevation } from "./RackElevation";
import type { FloorPlanRack } from "@/types/topology";

function utilizationBg(pct: number | null): string {
  if (pct === null) return "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300";
  if (pct >= 90)   return "bg-red-500 text-white";
  if (pct >= 75)   return "bg-orange-400 text-white";
  if (pct >= 50)   return "bg-amber-300 text-slate-800";
  return "bg-emerald-400 text-white";
}

interface RackTileProps {
  rack: FloorPlanRack;
  onClick: (rackId: string) => void;
  selected: boolean;
}

function RackTile({ rack, onClick, selected }: RackTileProps) {
  const pct = rack.power_utilization_pct;
  const unitPct =
    rack.total_units > 0 ? Math.round((rack.used_units / rack.total_units) * 100) : 0;

  return (
    <button
      onClick={() => onClick(rack.id)}
      className={[
        "flex flex-col items-center justify-center rounded border-2 p-1",
        "transition-all duration-150 cursor-pointer text-center",
        "hover:scale-105 hover:shadow-md active:scale-95",
        utilizationBg(pct),
        selected
          ? "ring-2 ring-sky-400 ring-offset-2 border-sky-500"
          : "border-transparent",
      ].join(" ")}
      style={{ width: 72, height: 80 }}
      title={[
        rack.name,
        `Devices: ${rack.device_count}`,
        `U: ${rack.used_units}/${rack.total_units} (${unitPct}%)`,
        pct !== null ? `Power: ${pct.toFixed(0)}%` : "Power: N/A",
        rack.power_actual_w !== null
          ? `${rack.power_actual_w}W / ${rack.power_max_w ?? "?"}W`
          : "",
      ]
        .filter(Boolean)
        .join("\n")}
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

interface DatacenterFloorPlanProps {
  /** If omitted, a datacenter selector is shown */
  datacenterId?: string;
}

export function DatacenterFloorPlan({ datacenterId: propDcId }: DatacenterFloorPlanProps) {
  const { data: dcs } = useDatacenters();
  const [selectedDcId, setSelectedDcId] = useState<string>(propDcId ?? "");
  const dcId = propDcId ?? selectedDcId;

  const { data, isLoading, isError } = useFloorPlan(dcId || undefined);

  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);

  const handleRackClick = (rackId: string) => {
    setSelectedRackId((prev) => (prev === rackId ? null : rackId));
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main floor plan area */}
      <div className="flex-1 overflow-auto p-6">
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
                setSelectedRackId(null);
              }}
              className="border border-slate-200 dark:border-slate-700 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">— select —</option>
              {dcs?.map((dc) => (
                <option key={dc.id} value={dc.id}>
                  {dc.name}
                </option>
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
            {/* Datacenter name */}
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {data.name}
            </h2>

            {/* Power utilization legend */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Power utilization:
              </span>
              {[
                { label: "< 50%",  color: "bg-emerald-400" },
                { label: "50–75%", color: "bg-amber-300" },
                { label: "75–90%", color: "bg-orange-400" },
                { label: "≥ 90%",  color: "bg-red-500" },
                { label: "N/A",    color: "bg-slate-200 dark:bg-slate-700" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-3 w-3 rounded ${l.color}`} />
                  {l.label}
                </div>
              ))}
            </div>

            {/* Rooms */}
            {data.rooms.length === 0 ? (
              <p className="text-slate-400 text-sm">No rooms configured for this datacenter.</p>
            ) : (
              <div className="space-y-6">
                {data.rooms.map((room) => (
                  <section key={room.id}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {room.name}
                      </h3>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {room.racks.length} rack{room.racks.length !== 1 ? "s" : ""}
                      </span>
                      {room.notes && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic truncate">
                          {room.notes}
                        </span>
                      )}
                    </div>

                    {room.racks.length === 0 ? (
                      <p className="text-xs text-slate-300 dark:text-slate-600 italic">No racks</p>
                    ) : (
                      <div
                        className="flex flex-wrap gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40"
                      >
                        {room.racks.map((rack) => (
                          <RackTile
                            key={rack.id}
                            rack={rack}
                            onClick={handleRackClick}
                            selected={selectedRackId === rack.id}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rack elevation side panel */}
      <div
        className={[
          "shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-y-auto",
          "bg-white dark:bg-slate-900 p-4",
          "transition-all duration-250",
          selectedRackId ? "w-80" : "w-0 p-0 border-0 overflow-hidden",
        ].join(" ")}
      >
        {selectedRackId && (
          <RackElevation
            rackId={selectedRackId}
            onClose={() => setSelectedRackId(null)}
          />
        )}
      </div>
    </div>
  );
}
