import { memo, useCallback, type MouseEvent } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { DeviceIcon, DEVICE_COLORS, STATUS_DOT } from "../icons";
import { useUIStore } from "@/store";
import type { TopologyNodeData, DeviceType } from "@/types/topology";

export type DeviceNodeType = Node<TopologyNodeData, "device">;

function DeviceNodeComponent({ id, data, selected }: NodeProps<DeviceNodeType>) {
  const { openContextMenu, topology } = useUIStore();

  const isHighlighted =
    topology.highlightedPath.length === 0 ||
    topology.highlightedPath.includes(id);

  const isVlanHighlighted =
    topology.highlightedVlanId === null ||
    (data.vlans ?? []).includes(topology.highlightedVlanId);

  const dimmed = !isHighlighted || !isVlanHighlighted;

  const colors = DEVICE_COLORS[data.device_type as DeviceType] ?? DEVICE_COLORS.generic;
  const statusDot = STATUS_DOT[data.status] ?? STATUS_DOT.unknown;

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({ nodeId: id, x: e.clientX, y: e.clientY });
    },
    [id, openContextMenu]
  );

  return (
    <div
      onContextMenu={handleContextMenu}
      className={[
        "relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 shadow-md",
        "bg-white dark:bg-slate-800 cursor-pointer select-none",
        "transition-opacity duration-150",
        selected
          ? "border-sky-500 ring-2 ring-sky-300"
          : `${colors.border} border-opacity-60`,
        dimmed ? "opacity-30" : "opacity-100",
      ].join(" ")}
      style={{ minWidth: 160, maxWidth: 200 }}
    >
      {/* Status dot */}
      <span
        className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${statusDot}`}
        title={data.status}
      />

      {/* Icon */}
      <span className={`shrink-0 ${colors.text}`}>
        <DeviceIcon deviceType={data.device_type as DeviceType} size={20} />
      </span>

      {/* Labels */}
      <div className="flex flex-col min-w-0">
        <span
          className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight"
          title={data.label}
        >
          {data.label}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight capitalize">
          {String(data.device_type).replace(/_/g, ' ')}
        </span>
        {data.ip_addresses?.[0] && (
          <span className="text-[10px] text-sky-500 dark:text-sky-400 font-mono truncate leading-tight">
            {data.ip_addresses[0]}
          </span>
        )}
      </div>

      {/* React Flow handles */}
      <Handle type="target" position={Position.Top}    className="!w-2.5 !h-2.5 !bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-slate-400" />
      <Handle type="target" position={Position.Left}   className="!w-2.5 !h-2.5 !bg-slate-400" />
      <Handle type="source" position={Position.Right}  className="!w-2.5 !h-2.5 !bg-slate-400" />
    </div>
  );
}

export const DeviceNode = memo(DeviceNodeComponent);
