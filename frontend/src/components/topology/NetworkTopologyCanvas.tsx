/**
 * Network Topology Canvas
 *
 * L2/L3 topology view with VLAN highlighting.
 * Sidebar: list of VLANs — clicking one dims all nodes/edges not in that VLAN.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useNetworkTopology } from "@/api/topology";
import { useUIStore } from "@/store";
import { useElkLayout } from "./useElkLayout";
import { DeviceNode } from "./nodes/DeviceNode";
import { NetworkEdge } from "./edges/NetworkEdge";
import { DeviceSidePanel } from "./DeviceSidePanel";
import { ContextMenu } from "./ContextMenu";
import type { TopologyNodeData, TopologyEdgeData, RawTopologyNode, RawTopologyEdge, VlanInfo } from "@/types/topology";

const nodeTypes = { device: DeviceNode };
const edgeTypes = { network: NetworkEdge };

// Generate a consistent pastel color from a VLAN ID
function vlanColor(id: number): string {
  const hue = (id * 47) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

interface NetworkTopologyCanvasProps {
  datacenterId?: string;
}

export function NetworkTopologyCanvas({ datacenterId }: NetworkTopologyCanvasProps) {
  const { data, isLoading, isError, dataUpdatedAt } = useNetworkTopology({ datacenterId });
  const { topology, openSidePanel, closeContextMenu, setHighlightedVlan } =
    useUIStore();

  const [view, setView] = useState<"l2" | "l3">("l2");

  const vlans: VlanInfo[] = data?.vlans ?? [];

  const { rawNodes, rawEdges } = useMemo(() => {
    if (!data) return { rawNodes: [], rawEdges: [] };

    const rawNodes: Node[] = data.nodes.map((n: RawTopologyNode) => ({
      id: n.id,
      type: "device",
      position: n.position,
      data: n.data as unknown as TopologyNodeData & Record<string, unknown>,
    } as Node));

    const rawEdges: Edge[] = data.edges.map((e: RawTopologyEdge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "network",
      data: e.data as unknown as TopologyEdgeData & Record<string, unknown>,
    } as Edge));

    return { rawNodes, rawEdges };
  }, [data]);

  const { nodes: elkNodes, edges: elkEdges, isLayouting } = useElkLayout(
    rawNodes,
    rawEdges,
    {
      algorithm: "force",
      nodeSpacing: 80,
      layerSpacing: 80,
      trigger: `${dataUpdatedAt}-${view}`,
    }
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(elkNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(elkEdges);

  useEffect(() => {
    if (!isLayouting && elkNodes.length > 0) {
      setNodes(elkNodes);
      setEdges(elkEdges);
    }
  }, [isLayouting, elkNodes, elkEdges, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      openSidePanel(node.id);
    },
    [openSidePanel]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      openSidePanel(node.id);
    },
    [openSidePanel]
  );

  const onPaneClick = useCallback(() => {
    closeContextMenu();
  }, [closeContextMenu]);

  const handleVlanClick = useCallback(
    (vlanId: number) => {
      setHighlightedVlan(topology.highlightedVlanId === vlanId ? null : vlanId);
    },
    [topology.highlightedVlanId, setHighlightedVlan]
  );

  if (isLoading || isLayouting) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{isLoading ? "Loading network topology…" : "Applying layout…"}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        Failed to load network topology.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex">
      {/* VLAN sidebar */}
      {vlans.length > 0 && (
        <aside className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-white dark:bg-slate-900 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">VLANs</p>
          </div>
          {vlans.map((v) => {
            const active = topology.highlightedVlanId === v.id;
            const color = vlanColor(v.id);
            return (
              <button
                key={v.id}
                onClick={() => handleVlanClick(v.id)}
                className={[
                  "flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "bg-slate-100 dark:bg-slate-800 font-semibold"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                ].join(" ")}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-700 dark:text-slate-200 truncate">{v.name || `VLAN ${v.id}`}</span>
                <span className="ml-auto text-slate-400 dark:text-slate-500 font-mono">{v.id}</span>
              </button>
            );
          })}
          {topology.highlightedVlanId !== null && (
            <button
              onClick={() => setHighlightedVlan(null)}
              className="mx-3 my-2 py-1 rounded text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Clear filter
            </button>
          )}
        </aside>
      )}

      {/* Canvas */}
      <div className="relative flex-1 min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.1}
          maxZoom={3}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Lines} gap={20} size={1} color="#f1f5f9" />
          <Controls />
          <MiniMap maskColor="rgba(0,0,0,0.05)" />

          {/* L2/L3 view toggle */}
          <Panel position="top-left">
            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow text-xs">
              {(["l2", "l3"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={[
                    "px-3 py-1.5 font-medium transition-colors",
                    view === v
                      ? "bg-sky-600 text-white"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800",
                  ].join(" ")}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </Panel>

          {/* VLAN active badge */}
          {topology.highlightedVlanId !== null && (
            <Panel position="top-right">
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: vlanColor(topology.highlightedVlanId) }}
                />
                <span className="text-slate-600 dark:text-slate-300">
                  VLAN {topology.highlightedVlanId} highlighted
                </span>
                <button
                  onClick={() => setHighlightedVlan(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>
            </Panel>
          )}
        </ReactFlow>

        <DeviceSidePanel nodes={nodes} />
        <ContextMenu nodes={nodes} />
      </div>
    </div>
  );
}
