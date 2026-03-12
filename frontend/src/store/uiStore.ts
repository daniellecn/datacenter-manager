import { create } from "zustand";
import type { TopologyContextMenuState } from "@/types/topology";

interface TopologyUI {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  highlightedPath: string[];      // device IDs
  highlightedLinkIds: string[];   // link IDs
  highlightedVlanId: number | null;
  contextMenu: TopologyContextMenuState | null;
  sidePanelOpen: boolean;
  traceFromId: string | null;     // first device selected for Trace Route
}

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;

  // Topology canvas UI
  topology: TopologyUI;
  setSelectedNode: (id: string | null) => void;
  setHoveredNode: (id: string | null) => void;
  setHighlightedPath: (deviceIds: string[], linkIds: string[]) => void;
  clearHighlightedPath: () => void;
  setHighlightedVlan: (vlanId: number | null) => void;
  openContextMenu: (state: TopologyContextMenuState) => void;
  closeContextMenu: () => void;
  openSidePanel: (nodeId: string) => void;
  closeSidePanel: () => void;
  setTraceFrom: (deviceId: string | null) => void;
  // Legacy compat
  topologyPanelOpen: boolean;
  setTopologyPanelOpen: (v: boolean) => void;
}

const DEFAULT_TOPOLOGY_UI: TopologyUI = {
  selectedNodeId: null,
  hoveredNodeId: null,
  highlightedPath: [],
  highlightedLinkIds: [],
  highlightedVlanId: null,
  contextMenu: null,
  sidePanelOpen: false,
  traceFromId: null,
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  topology: DEFAULT_TOPOLOGY_UI,

  setSelectedNode: (id) =>
    set((s) => ({ topology: { ...s.topology, selectedNodeId: id } })),

  setHoveredNode: (id) =>
    set((s) => ({ topology: { ...s.topology, hoveredNodeId: id } })),

  setHighlightedPath: (deviceIds, linkIds) =>
    set((s) => ({
      topology: {
        ...s.topology,
        highlightedPath: deviceIds,
        highlightedLinkIds: linkIds,
      },
    })),

  clearHighlightedPath: () =>
    set((s) => ({
      topology: {
        ...s.topology,
        highlightedPath: [],
        highlightedLinkIds: [],
        traceFromId: null,
      },
    })),

  setHighlightedVlan: (vlanId) =>
    set((s) => ({ topology: { ...s.topology, highlightedVlanId: vlanId } })),

  openContextMenu: (state) =>
    set((s) => ({ topology: { ...s.topology, contextMenu: state } })),

  closeContextMenu: () =>
    set((s) => ({ topology: { ...s.topology, contextMenu: null } })),

  openSidePanel: (nodeId) =>
    set((s) => ({
      topology: {
        ...s.topology,
        selectedNodeId: nodeId,
        sidePanelOpen: true,
        contextMenu: null,
      },
    })),

  closeSidePanel: () =>
    set((s) => ({
      topology: { ...s.topology, sidePanelOpen: false, selectedNodeId: null },
    })),

  setTraceFrom: (deviceId) =>
    set((s) => ({ topology: { ...s.topology, traceFromId: deviceId } })),

  // Legacy compat
  topologyPanelOpen: false,
  setTopologyPanelOpen: (v) => set({ topologyPanelOpen: v }),
}));
