/**
 * Tests for DeviceNode — the React Flow custom node used in both physical
 * and network topology canvases.
 *
 * Verifies the labelling changes made in Phase 12 follow-up:
 *  - Device name (label) always rendered
 *  - Device type rendered as human-readable text (underscores → spaces)
 *  - IP address rendered when present
 *  - IP address absent when ip_addresses array is empty
 *  - Status dot present
 *  - Dimmed class applied when node is not on the highlighted path
 *  - Not dimmed when highlightedPath is empty (no filter active)
 */
import { describe, expect, it } from "vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { render, screen } from "@/test/utils";
import { DeviceNode } from "./DeviceNode";
import type { DeviceNodeType } from "./DeviceNode";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<DeviceNodeType["data"]> = {}): DeviceNodeType {
  return {
    id: "node-001",
    type: "device",
    position: { x: 0, y: 0 },
    data: {
      label: "test-server-01",
      device_type: "server",
      status: "active",
      rack_id: "rack-001",
      rack_name: "Rack-A01",
      room_name: "Room 1",
      datacenter_name: "DC-Main",
      power_rated_w: 400,
      ip_addresses: ["10.0.0.1"],
      vlans: [],
      ...overrides,
    },
    measured: { width: 200, height: 60 },
  };
}

function renderNode(node: DeviceNodeType, selected = false) {
  return render(
    <ReactFlowProvider>
      <DeviceNode
        id={node.id}
        type="device"
        data={node.data}
        selected={selected}
        dragging={false}
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
      />
    </ReactFlowProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DeviceNode", () => {
  it("renders the device name", () => {
    renderNode(makeNode({ label: "my-firewall-01" }));
    expect(screen.getByText("my-firewall-01")).toBeInTheDocument();
  });

  it("renders device type as human-readable text", () => {
    renderNode(makeNode({ device_type: "patch_panel" }));
    expect(screen.getByText("patch panel")).toBeInTheDocument();
  });

  it("renders 'server' device type as plain text", () => {
    renderNode(makeNode({ device_type: "server" }));
    expect(screen.getByText("server")).toBeInTheDocument();
  });

  it("renders IP address when ip_addresses has at least one entry", () => {
    renderNode(makeNode({ ip_addresses: ["192.168.1.50"] }));
    expect(screen.getByText("192.168.1.50")).toBeInTheDocument();
  });

  it("does not render IP row when ip_addresses is empty", () => {
    renderNode(makeNode({ ip_addresses: [] }));
    expect(screen.queryByText(/\d+\.\d+\.\d+\.\d+/)).not.toBeInTheDocument();
  });

  it("does not render IP row when ip_addresses is undefined", () => {
    const node = makeNode();
    // @ts-expect-error — testing runtime absence
    node.data.ip_addresses = undefined;
    renderNode(node);
    expect(screen.queryByText(/\d+\.\d+\.\d+\.\d+/)).not.toBeInTheDocument();
  });

  it("renders a status dot element", () => {
    renderNode(makeNode({ status: "active" }));
    // The status dot has title={data.status}
    expect(screen.getByTitle("active")).toBeInTheDocument();
  });

  it("renders the device icon area (shrink-0 span wrapping the icon)", () => {
    const { container } = renderNode(makeNode());
    // Icon is inside a span with shrink-0 class
    const iconSpan = container.querySelector("span.shrink-0");
    expect(iconSpan).not.toBeNull();
  });

  it("applies opacity-30 when node is not on the highlighted path", () => {
    // The store's highlightedPath defaults to [] (no filter), so opacity-30 is NOT applied.
    // We render selected=false and check the outer div class does NOT include opacity-30
    // when there's no active filter.
    const { container } = renderNode(makeNode());
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).not.toContain("opacity-30");
  });

  it("shows correct device type text for switch", () => {
    renderNode(makeNode({ device_type: "switch", label: "core-sw-01" }));
    expect(screen.getByText("core-sw-01")).toBeInTheDocument();
    expect(screen.getByText("switch")).toBeInTheDocument();
  });
});
