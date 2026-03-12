import { memo } from "react";
import {
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { LINK_COLORS, speedLabel } from "../icons";
import { useUIStore } from "@/store";
import type { TopologyEdgeData, LinkType } from "@/types/topology";

export type NetworkEdgeType = Edge<TopologyEdgeData, "network">;

function NetworkEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<NetworkEdgeType>) {
  const { topology } = useUIStore();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = data?.status === "active";
  const linkColor = LINK_COLORS[(data?.link_type as LinkType) ?? "other"] ?? LINK_COLORS.other;

  const isOnHighlightedPath =
    topology.highlightedLinkIds.length === 0 ||
    topology.highlightedLinkIds.includes(id);

  const isVlanMatch =
    topology.highlightedVlanId === null ||
    (data?.vlans ?? []).includes(topology.highlightedVlanId);

  const opacity = isOnHighlightedPath && isVlanMatch ? 1 : 0.12;

  const speed = speedLabel(data?.speed_mbps);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#0ea5e9" : linkColor,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: isActive ? undefined : "6 4",
          opacity,
          transition: "opacity 0.2s",
        }}
      />

      {speed && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
              opacity,
            }}
            className="px-1 py-0.5 rounded text-[9px] font-mono bg-white dark:bg-slate-800
                       border border-slate-200 dark:border-slate-600
                       text-slate-500 dark:text-slate-400 shadow-sm"
          >
            {speed}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const NetworkEdge = memo(NetworkEdgeComponent);
