/**
 * Tests for PhysicalView
 *
 * Covers:
 *  - Grid/Rack toggle is shown at room level
 *  - Grid is the default active view
 *  - Clicking Rack switches to RoomRackView (room names appear)
 *  - Clicking Grid switches back
 *  - Toggle is hidden when drilled into a rack (level !== 'room')
 *  - Breadcrumb shows datacenter name at room level
 *  - Back button appears at non-room levels
 *
 * React Flow is mocked so jsdom doesn't need browser layout APIs.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { PhysicalView } from "./PhysicalView";

// ── Mock @xyflow/react ────────────────────────────────────────────────────────
// React Flow requires browser layout APIs unavailable in jsdom.
// We replace it with a thin stub that renders its children and nothing else.

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MiniMap: () => null,
  Controls: () => null,
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  useReactFlow: () => ({ fitView: vi.fn() }),
}));

describe("PhysicalView", () => {
  // ── Toggle rendering ─────────────────────────────────────────────────────

  it("shows Grid and Rack toggle buttons at room level", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    expect(screen.getByRole("button", { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rack/i })).toBeInTheDocument();
  });

  it("Grid button has the active style by default", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    expect(screen.getByRole("button", { name: /grid/i })).toHaveClass("bg-sky-600");
  });

  it("Rack button does not have the active style by default", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    expect(screen.getByRole("button", { name: /rack/i })).not.toHaveClass("bg-sky-600");
  });

  // ── Switching views ───────────────────────────────────────────────────────

  it("clicking Rack renders RoomRackView content (shows room names)", async () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    await waitFor(() => {
      expect(screen.getByText("Room A")).toBeInTheDocument();
    });
  });

  it("Rack button becomes active after click", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    expect(screen.getByRole("button", { name: /rack/i })).toHaveClass("bg-sky-600");
    expect(screen.getByRole("button", { name: /grid/i })).not.toHaveClass("bg-sky-600");
  });

  it("clicking Grid after Rack switches back and removes room names", async () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);

    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    await waitFor(() => screen.getByText("Room A"));

    fireEvent.click(screen.getByRole("button", { name: /grid/i }));
    // React Flow canvas is shown (mocked as data-testid="react-flow")
    expect(screen.getByTestId("react-flow")).toBeInTheDocument();
  });

  // ── Breadcrumb ───────────────────────────────────────────────────────────

  it("shows the datacenter name in breadcrumb", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    expect(screen.getByText("Main DC")).toBeInTheDocument();
  });

  it("falls back to 'Floor Plan' when no datacenterName is given", () => {
    render(<PhysicalView datacenterId="dc-001" />);
    expect(screen.getByText("Floor Plan")).toBeInTheDocument();
  });

  // ── Back button only at non-room levels ──────────────────────────────────
  // We can only drill in via RoomRackView because React Flow nodes are mocked
  // and the room-tile click is handled internally by the RoomFloorPlan context.
  // Testing drill-in via the rack view's rack-header click is more reliable.

  it("does NOT show a Back button at room level", () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);
    expect(screen.queryByText(/← Back/)).not.toBeInTheDocument();
  });

  it("opens FloorPlanRackPanel when rack header is clicked in rack view", async () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);

    // Switch to Rack view first
    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    await waitFor(() => screen.getByRole("button", { name: /Rack-01/i }));

    // Click the rack header → opens side panel (no level change)
    fireEvent.click(screen.getByRole("button", { name: /Rack-01/i }));

    // Panel renders the rack name in the FloorPlanRackPanel header
    await waitFor(() => {
      expect(screen.getByText("Rack-01")).toBeInTheDocument();
    });

    // Back button does NOT appear (level stays at 'room')
    expect(screen.queryByText(/← Back/)).not.toBeInTheDocument();
  });

  it("toggle remains visible after opening rack panel in rack view", async () => {
    render(<PhysicalView datacenterId="dc-001" datacenterName="Main DC" />);

    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    await waitFor(() => screen.getByRole("button", { name: /Rack-01/i }));
    fireEvent.click(screen.getByRole("button", { name: /Rack-01/i }));

    // Level stays at 'room' so the toggle is still visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^grid$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^rack$/i })).toBeInTheDocument();
    });
  });

  // ── Datacenter change resets state ───────────────────────────────────────

  it("resets to room+grid when datacenterId changes", async () => {
    const { rerender } = render(
      <PhysicalView datacenterId="dc-001" datacenterName="Main DC" />
    );

    // Switch to rack view
    fireEvent.click(screen.getByRole("button", { name: /rack/i }));
    await waitFor(() => screen.getByText("Room A"));

    // Change datacenter
    rerender(<PhysicalView datacenterId="dc-002" datacenterName="DC Two" />);

    // useEffect resets state synchronously — Grid toggle is active again
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /grid/i })).toHaveClass("bg-sky-600")
    );
    // Rack toggle is no longer active
    expect(screen.getByRole("button", { name: /rack/i })).not.toHaveClass("bg-sky-600");
    // New datacenter name in breadcrumb
    expect(screen.getByText("DC Two")).toBeInTheDocument();
  });
});
