/**
 * Physical Topology Canvas
 *
 * Renders all devices as DeviceNodes optionally grouped by rack (RackGroupNodes).
 * ELK.js handles auto-layout; users can drag nodes to override.
 * Click → select; double-click → open side panel; right-click → context menu.
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
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { usePhysicalTopology } from "@/api/topology";
import { useUIStore } from "@/store";
import { useElkLayout } from "./useElkLayout";
import { DeviceNode } from "./nodes/DeviceNode";
import { RackGroupNode } from "./nodes/RackGroupNode";
import { DeviceSidePanel } from "./DeviceSidePanel";
import { ContextMenu } from "./ContextMenu";
import type { TopologyNodeData, TopologyEdgeData, RawTopologyNode, RawTopologyEdge } from "@/types/topology";
import { LINK_COLORS } from "./icons";

// Register custom node / edge types
const nodeTypes = {
  device: DeviceNode,
  rackGroup: RackGroupNode,
};

interface PhysicalTopologyCanvasProps {
  datacenterId?: string;
}

export function PhysicalTopologyCanvas({ datacenterId }: PhysicalTopologyCanvasProps) {
  const [groupByRack, setGroupByRack] = useState(true);
  const { data, isLoading, isError, dataUpdatedAt } = usePhysicalTopology(datacenterId);
  const { topology, setSelectedNode, openSidePanel, closeContextMenu } = useUIStore();

  // Build React Flow nodes/edges from API response
  const { rawNodes, rawEdges } = useMemo(() => {
    if (!data) return { rawNodes: [], rawEdges: [] };

    let rawNodes: Node[] = [];
    let rawEdges: Edge[] = [];

    if (groupByRack) {
      // Group devices by rack — create a rackGroup node for each unique rack
      const rackMap = new Map<
        string,
        { rackId: string; rackName: string; roomName: string | null; devices: RawTopologyNode[] }
      >();
      const noRack: RawTopologyNode[] = [];

      for (const n of data.nodes) {
        if (n.data.rack_id) {
          if (!rackMap.has(n.data.rack_id)) {
            rackMap.set(n.data.rack_id, {
              rackId: n.data.rack_id,
              rackName: n.data.rack_name ?? n.data.rack_id,
              roomName: n.data.room_name,
              devices: [],
            });
          }
          rackMap.get(n.data.rack_id)!.devices.push(n);
        } else {
          noRack.push(n);
        }
      }

      // Create rack group nodes
      for (const [rackId, rack] of rackMap) {
        rawNodes.push({
          id: rackId,
          type: "rackGroup",
          position: { x: 0, y: 0 },
          data: {
            label: rack.rackName,
            room_name: rack.roomName,
            used_u: rack.devices.length,
            total_u: Math.max(rack.devices.length, 12),
          },
          style: { width: 220, height: 40 + rack.devices.length * 76 + 20 },
        } as Node);

        // Device nodes as children of rack group
        rack.devices.forEach((n) => {
          rawNodes.push({
            id: n.id,
            type: "device",
            parentId: rackId,
            extent: "parent",
            position: { x: 0, y: 0 },
            data: n.data as unknown as TopologyNodeData & Record<string, unknown>,
          } as Node);
        });
      }

      // Unracked devices
      for (const n of noRack) {
        rawNodes.push({
          id: n.id,
          type: "device",
          position: { x: 0, y: 0 },
          data: n.data as unknown as TopologyNodeData & Record<string, unknown>,
        } as Node);
      }
    } else {
      // Flat — all devices as top-level nodes
      rawNodes = data.nodes.map((n: RawTopologyNode) => ({
        id: n.id,
        type: "device",
        position: n.position,
        data: n.data as unknown as TopologyNodeData & Record<string, unknown>,
      } as Node));
    }

    rawEdges = data.edges.map((e: RawTopologyEdge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      data: e.data as unknown as TopologyEdgeData & Record<string, unknown>,
      animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      style: {
        stroke: LINK_COLORS[e.data.link_type] ?? LINK_COLORS.other,
        strokeDasharray: e.data.status === "inactive" ? "6 4" : undefined,
      },
    } as Edge));

    return { rawNodes, rawEdges };
  }, [data, groupByRack]);

  // ELK layout
  const { nodes: elkNodes, edges: elkEdges, isLayouting } = useElkLayout(
    rawNodes,
    rawEdges,
    {
      algorithm: "layered",
      direction: "DOWN",
      nodeSpacing: 60,
      layerSpacing: 100,
      trigger: `${dataUpdatedAt}-${groupByRack}`,
    }
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(elkNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(elkEdges);

  // Sync ELK output → React Flow state (only when layout finishes)
  useEffect(() => {
    if (!isLayouting && elkNodes.length > 0) {
      setNodes(elkNodes);
      setEdges(elkEdges);
    }
  }, [isLayouting, elkNodes, elkEdges, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      // Skip rack-group nodes — click device nodes only
      if (node.type === "rackGroup") return;
      openSidePanel(node.id);
    },
    [openSidePanel]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "rackGroup") openSidePanel(node.id);
    },
    [openSidePanel]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    closeContextMenu();
  }, [setSelectedNode, closeContextMenu]);

  if (isLoading || isLayouting) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{isLoading ? "Loading topology…" : "Applying layout…"}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        Failed to load physical topology.
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No devices found.
        {!datacenterId && " Select a datacenter to narrow the view."}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        deleteKeyCode={null}     // disable accidental delete
        attributionPosition="bottom-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const dt = (n.data as TopologyNodeData | undefined)?.device_type;
            const palette: Record<string, string> = {
              server: "#2563eb", switch: "#16a34a", router: "#9333ea",
              firewall: "#dc2626", storage: "#ea580c", pdu: "#ca8a04",
              patch_panel: "#64748b",
            };
            return palette[dt ?? ""] ?? "#6b7280";
          }}
          maskColor="rgba(0,0,0,0.07)"
        />

        {/* Top-right panel: group toggle */}
        <Panel position="top-right">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              id="group-toggle"
              type="checkbox"
              checked={groupByRack}
              onChange={(e) => setGroupByRack(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="group-toggle" className="cursor-pointer select-none">
              Group by rack
            </label>
          </div>
        </Panel>

        {/* Selected node highlight info */}
        {topology.selectedNodeId && !topology.sidePanelOpen && (
          <Panel position="bottom-center">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
              Click device to open details · Right-click for more options
            </div>
          </Panel>
        )}

        {/* Trace Route hint */}
        {topology.traceFromId && (
          <Panel position="bottom-center">
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg shadow px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              Trace Route: right-click the destination device
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Overlay UI (not inside ReactFlow to avoid event conflicts) */}
      <DeviceSidePanel nodes={nodes} />
      <ContextMenu nodes={nodes} />
    </div>
  );
}
