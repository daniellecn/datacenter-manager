import { memo } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

export interface FloorPlanRackData extends Record<string, unknown> {
  label: string;
  device_count: number;
  total_units: number;
  used_units: number;
  power_max_w: number | null;
  power_actual_w: number | null;
  power_utilization_pct: number | null;
}

export type FloorPlanRackNodeType = Node<FloorPlanRackData, "floorPlanRack">;

function utilizationColor(pct: number | null): string {
  if (pct === null) return "bg-slate-200 border-slate-300 text-slate-600";
  if (pct >= 90) return "bg-red-500 border-red-700 text-white";
  if (pct >= 75) return "bg-orange-400 border-orange-600 text-white";
  if (pct >= 50) return "bg-amber-400 border-amber-600 text-slate-800";
  return "bg-emerald-400 border-emerald-600 text-white";
}

function FloorPlanRackNodeComponent({
  data,
  selected,
}: NodeProps<FloorPlanRackNodeType>) {
  const pct = data.power_utilization_pct;
  const colors = utilizationColor(pct);
  const unitPct =
    data.total_units > 0 ? Math.round((data.used_units / data.total_units) * 100) : 0;

  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded border-2 cursor-pointer",
        "w-full h-full transition-all duration-150 select-none text-center",
        colors,
        selected ? "ring-2 ring-sky-400 ring-offset-1" : "",
      ].join(" ")}
      title={[
        data.label,
        `Devices: ${data.device_count}`,
        `U: ${data.used_units}/${data.total_units}`,
        pct !== null ? `Power: ${pct.toFixed(0)}%` : "Power: N/A",
      ].join("\n")}
    >
      <span className="text-[11px] font-bold leading-tight px-1 truncate w-full text-center">
        {data.label}
      </span>
      <span className="text-[9px] opacity-80 leading-tight">
        {data.device_count}d · {unitPct}%U
      </span>
      {pct !== null && (
        <div className="mt-0.5 w-4/5 h-1 rounded-full bg-black/20">
          <div
            className="h-full rounded-full bg-white/70"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export const FloorPlanRackNode = memo(FloorPlanRackNodeComponent);
