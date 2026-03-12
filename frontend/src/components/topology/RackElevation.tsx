import { useNavigate } from "react-router-dom";
import { useRackElevation } from "@/api/topology";
import { DEVICE_COLORS, STATUS_DOT } from "./icons";
import type { DeviceType } from "@/types/topology";

const U_HEIGHT_PX = 24; // pixels per rack unit

interface RackElevationProps {
  rackId: string;
  onClose?: () => void;
}

export function RackElevation({ rackId, onClose }: RackElevationProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useRackElevation(rackId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Loading rack…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Failed to load rack elevation.
      </div>
    );
  }

  const totalU = data.total_units;

  // Build a map: unit → device (a device spans rack_unit_start to rack_unit_start + rack_unit_height - 1)
  const unitMap = new Map<number, (typeof data.devices)[number]>();
  for (const device of data.devices) {
    if (device.rack_unit_start != null) {
      for (let u = device.rack_unit_start; u < device.rack_unit_start + device.rack_unit_height; u++) {
        unitMap.set(u, device);
      }
    }
  }

  // Track which units we've already rendered to avoid duplicate rows
  const rendered = new Set<number>();

  return (
    <div className="flex flex-col select-none">
      {/* Rack header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{data.name}</h3>
          <span className="text-xs text-slate-400">
            {totalU}U rack · {data.devices.length} devices
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
      <div
        className="border border-slate-300 dark:border-slate-600 rounded overflow-hidden"
        style={{ width: 280 }}
      >
        {/* U labels + slots */}
        {Array.from({ length: totalU }, (_, i) => {
          const unit = i + 1; // rack units are 1-based
          const device = unitMap.get(unit);

          if (device && rendered.has(unit)) return null; // skip continuation units
          if (device) {
            rendered.add(unit);
            // Mark all spanned units
            for (let u2 = unit + 1; u2 < unit + device.rack_unit_height; u2++) {
              rendered.add(u2);
            }
          }

          const rowH = device ? device.rack_unit_height * U_HEIGHT_PX : U_HEIGHT_PX;
          const colors = device
            ? DEVICE_COLORS[device.device_type as DeviceType] ?? DEVICE_COLORS.generic
            : null;
          const statusDot = device ? STATUS_DOT[device.status] ?? STATUS_DOT.unknown : null;

          return (
            <div
              key={unit}
              className="flex border-b border-slate-200 dark:border-slate-700 last:border-b-0"
              style={{ height: rowH }}
            >
              {/* U number */}
              <div
                className="flex items-center justify-center text-[10px] font-mono text-slate-400 dark:text-slate-500
                           border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 shrink-0"
                style={{ width: 28 }}
              >
                {unit}
              </div>

              {/* Device slot */}
              {device ? (
                <button
                  className={[
                    "flex-1 flex items-center gap-2 px-2 text-left",
                    "hover:brightness-110 active:brightness-95 transition-all cursor-pointer",
                    colors!.bg,
                  ].join(" ")}
                  onClick={() => navigate(`/devices/${device.id}`)}
                  title={`${device.name} — ${device.device_type}${device.model ? ` · ${device.model}` : ""}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                  <div className="min-w-0">
                    <p className="text-white text-[11px] font-medium truncate leading-tight">
                      {device.name}
                    </p>
                    {device.model && (
                      <p className="text-white/70 text-[9px] truncate leading-tight">
                        {device.vendor ? `${device.vendor} ` : ""}
                        {device.model}
                      </p>
                    )}
                  </div>
                  {device.power_actual_w != null && (
                    <span className="ml-auto shrink-0 text-[9px] text-white/70 font-mono">
                      {device.power_actual_w}W
                    </span>
                  )}
                </button>
              ) : (
                <div className="flex-1 bg-slate-100 dark:bg-slate-800/40" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["active", "inactive", "maintenance"] as const).map((s) => (
          <div key={s} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
            <span className="capitalize">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
