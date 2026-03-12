import { memo } from "react";
import { type NodeProps, type Node } from "@xyflow/react";

export interface RackGroupData extends Record<string, unknown> {
  label: string;       // rack name
  room_name: string | null;
  used_u: number;
  total_u: number;
}

export type RackGroupNodeType = Node<RackGroupData, "rackGroup">;

function RackGroupNodeComponent({ data }: NodeProps<RackGroupNodeType>) {
  const usedPct = data.total_u > 0 ? Math.round((data.used_u / data.total_u) * 100) : 0;

  return (
    <div
      className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600
                 bg-slate-50/60 dark:bg-slate-900/40 backdrop-blur-sm
                 w-full h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dashed border-slate-300 dark:border-slate-600">
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
            {data.label}
          </span>
          {data.room_name && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              {data.room_name}
            </span>
          )}
        </div>
        <span
          className={[
            "ml-2 shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded",
            usedPct >= 80
              ? "bg-red-100 text-red-700"
              : usedPct >= 60
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700",
          ].join(" ")}
        >
          {data.used_u}/{data.total_u}U
        </span>
      </div>
      {/* Children are rendered by React Flow inside this node */}
    </div>
  );
}

export const RackGroupNode = memo(RackGroupNodeComponent);
