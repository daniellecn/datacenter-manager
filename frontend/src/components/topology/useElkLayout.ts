/**
 * useElkLayout — async ELK.js auto-layout for React Flow nodes/edges.
 *
 * Pattern:
 *  1. Caller passes initial nodes/edges (positions may all be 0,0 from the backend).
 *  2. This hook runs ELK asynchronously and returns nodes with updated positions.
 *  3. `isLayouting` is true while ELK runs — hide the canvas or show a spinner.
 *  4. Once the user drags a node, React Flow updates its own state; ELK is not re-run
 *     unless `trigger` changes (e.g., new data fetch key).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — elkjs bundled file lacks named type exports in some configurations
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs";
import { useEffect, useState, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

const elk = new ELK();

export type ElkAlgorithm = "layered" | "force" | "box" | "mrtree" | "radial";

interface UseElkLayoutOptions {
  algorithm?: ElkAlgorithm;
  /** px between nodes in the same layer */
  nodeSpacing?: number;
  /** px between layers */
  layerSpacing?: number;
  direction?: "DOWN" | "UP" | "RIGHT" | "LEFT";
  /** Change this value to re-trigger layout (e.g., pass queryKey string) */
  trigger?: string | number;
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  isLayouting: boolean;
}

/** Fixed node size used for ELK bounds estimation. */
const NODE_WIDTH = 168;
const NODE_HEIGHT = 64;
const GROUP_HEADER_H = 40;
const GROUP_PADDING = 20;

export function useElkLayout(
  rawNodes: Node[],
  rawEdges: Edge[],
  options: UseElkLayoutOptions = {}
): LayoutResult {
  const {
    algorithm = "layered",
    nodeSpacing = 60,
    layerSpacing = 100,
    direction = "DOWN",
    trigger,
  } = options;

  const [layouted, setLayouted] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: rawNodes,
    edges: rawEdges,
  });
  const [isLayouting, setIsLayouting] = useState(false);

  // Track the last trigger value to only re-layout on data changes
  const lastTrigger = useRef<typeof trigger>(undefined);

  useEffect(() => {
    if (rawNodes.length === 0) return;
    if (trigger !== undefined && trigger === lastTrigger.current) return;
    lastTrigger.current = trigger;

    setIsLayouting(true);

    // Separate group (rack) nodes from regular device nodes
    const groupNodes = rawNodes.filter((n) => n.type === "rackGroup");
    const childNodes = rawNodes.filter((n) => n.parentId);
    const topLevelNodes = rawNodes.filter((n) => !n.parentId && n.type !== "rackGroup");

    const buildElkGraph = (): ElkNode => {
      if (groupNodes.length > 0) {
        // Hierarchical: group nodes contain child device nodes
        return {
          id: "root",
          layoutOptions: {
            "elk.algorithm": algorithm,
            "elk.direction": direction,
            "elk.spacing.nodeNode": String(nodeSpacing),
            "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
            "elk.padding": "[top=20,left=20,bottom=20,right=20]",
          },
          children: groupNodes.map((group) => {
            const children = childNodes.filter((c) => c.parentId === group.id);
            const childCount = children.length || 1;
            return {
              id: group.id,
              width: NODE_WIDTH + GROUP_PADDING * 2,
              height:
                GROUP_HEADER_H +
                childCount * (NODE_HEIGHT + 12) +
                GROUP_PADDING,
              layoutOptions: {
                "elk.algorithm": "box",
                "elk.padding": `[top=${GROUP_HEADER_H + 8},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
              },
              children: children.map((c) => ({
                id: c.id,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              })),
            } as ElkNode;
          }),
          edges: rawEdges
            .filter(
              (e) =>
                groupNodes.some((n) => n.id === e.source) ||
                topLevelNodes.some((n) => n.id === e.source)
            )
            .map(
              (e) =>
                ({
                  id: e.id,
                  sources: [e.source],
                  targets: [e.target],
                } as ElkExtendedEdge)
            ),
        };
      }

      // Flat layout — all top-level nodes
      return {
        id: "root",
        layoutOptions: {
          "elk.algorithm": algorithm,
          "elk.direction": direction,
          "elk.spacing.nodeNode": String(nodeSpacing),
          "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
          "elk.padding": "[top=20,left=20,bottom=20,right=20]",
        },
        children: topLevelNodes.map((n) => ({
          id: n.id,
          width: n.type === "floorPlanRack" ? (n.style?.width as number ?? 80) : NODE_WIDTH,
          height: n.type === "floorPlanRack" ? (n.style?.height as number ?? 60) : NODE_HEIGHT,
        })),
        edges: rawEdges.map(
          (e) =>
            ({
              id: e.id,
              sources: [e.source],
              targets: [e.target],
            } as ElkExtendedEdge)
        ),
      };
    };

    elk
      .layout(buildElkGraph())
      .then((result) => {
        const posMap = new Map<string, { x: number; y: number }>();

        // Top-level positions
        for (const child of result.children ?? []) {
          posMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
          // Child (device) positions inside groups
          for (const grandchild of child.children ?? []) {
            posMap.set(grandchild.id, { x: grandchild.x ?? 0, y: grandchild.y ?? 0 });
          }
        }

        const updatedNodes = rawNodes.map((n) => {
          const pos = posMap.get(n.id);
          return pos ? { ...n, position: pos } : n;
        });

        setLayouted({ nodes: updatedNodes, edges: rawEdges });
      })
      .catch((err) => {
        console.error("[ELK layout error]", err);
        setLayouted({ nodes: rawNodes, edges: rawEdges });
      })
      .finally(() => setIsLayouting(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, rawNodes.length, rawEdges.length, algorithm, direction]);

  return { nodes: layouted.nodes, edges: layouted.edges, isLayouting };
}
