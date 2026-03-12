import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/store";
import { useHopPath } from "@/api/topology";
import type { Node } from "@xyflow/react";
import type { TopologyNodeData } from "@/types/topology";

interface ContextMenuProps {
  nodes: Node[];
}

export function ContextMenu({ nodes }: ContextMenuProps) {
  const navigate = useNavigate();
  const {
    topology,
    closeContextMenu,
    openSidePanel,
    setHighlightedPath,
    clearHighlightedPath,
    setTraceFrom,
  } = useUIStore();

  const menuRef = useRef<HTMLDivElement>(null);
  const ctx = topology.contextMenu;
  const open = !!ctx;

  // Fetch hop path when "Trace Route" completes (traceFromId set + this node is target)
  const isTraceTarget = !!topology.traceFromId && topology.traceFromId !== ctx?.nodeId;
  const { data: pathData } = useHopPath(
    topology.traceFromId ?? undefined,
    isTraceTarget ? ctx?.nodeId : undefined
  );

  // Apply path highlight when result arrives
  useEffect(() => {
    if (pathData && pathData.reachable) {
      setHighlightedPath(pathData.path_device_ids, pathData.path_link_ids);
      closeContextMenu();
    }
  }, [pathData, setHighlightedPath, closeContextMenu]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        closeContextMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeContextMenu]);

  if (!open || !ctx) return null;

  const node = nodes.find((n) => n.id === ctx.nodeId);
  const data = node?.data as TopologyNodeData | undefined;

  const items: Array<{
    label: string;
    icon: string;
    action: () => void;
    className?: string;
  }> = [
    {
      label: "View Detail",
      icon: "🔍",
      action: () => {
        closeContextMenu();
        openSidePanel(ctx.nodeId);
      },
    },
    {
      label: "Open Device Page",
      icon: "↗",
      action: () => {
        closeContextMenu();
        navigate(`/devices/${ctx.nodeId}`);
      },
    },
    {
      label: "Highlight Path",
      icon: "✦",
      action: () => {
        // Single-device highlight — just select this node
        setHighlightedPath([ctx.nodeId], []);
        closeContextMenu();
      },
    },
    {
      label: topology.traceFromId
        ? `Trace Route TO ${data?.label ?? "…"}`
        : "Trace Route (pick source)",
      icon: "⇢",
      action: () => {
        if (!topology.traceFromId) {
          // First click — set as source
          setTraceFrom(ctx.nodeId);
          closeContextMenu();
        } else if (topology.traceFromId === ctx.nodeId) {
          // Same node — cancel
          setTraceFrom(null);
          closeContextMenu();
        }
        // If traceFromId is different, the useHopPath above fires automatically
      },
    },
  ];

  if (topology.highlightedPath.length > 0 || topology.traceFromId) {
    items.push({
      label: "Clear Highlight",
      icon: "✕",
      action: () => {
        clearHighlightedPath();
        closeContextMenu();
      },
      className: "text-slate-400",
    });
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-44 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700
                 bg-white dark:bg-slate-900 py-1 text-sm overflow-hidden"
      style={{ left: ctx.x, top: ctx.y }}
      role="menu"
    >
      {/* Node label header */}
      <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 truncate">
        {data?.label ?? ctx.nodeId.slice(0, 8)}
      </div>

      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={item.action}
          className={[
            "flex items-center gap-2.5 w-full px-3 py-1.5",
            "hover:bg-slate-100 dark:hover:bg-slate-800",
            "text-slate-700 dark:text-slate-200 text-left transition-colors",
            item.className ?? "",
          ].join(" ")}
        >
          <span className="w-4 text-center text-xs">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
