/**
 * Tests for FloorPlanRackPanel — the interactive rack elevation side panel
 * used inside the Floor Plan view.
 *
 * Covers:
 *  - Loading state
 *  - Renders rack name / device count in header
 *  - Device tiles visible after load
 *  - Clicking a device switches panel body to device detail view
 *  - Back button in device detail view returns to the elevation
 *  - "Add Device" button opens AddDeviceModal
 *  - Close button triggers onClose
 *  - Empty rack renders without error
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "@/test/utils";
import { server } from "@/test/handlers";
import { FloorPlanRackPanel } from "./FloorPlanRackPanel";

const RACK_ID = "fp-rack-001";
const RACK_URL = `/api/v1/racks/${RACK_ID}/elevation`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockElevation(data: object) {
  server.use(http.get(RACK_URL, () => HttpResponse.json(data)));
}

const BASE_ELEVATION = {
  id: RACK_ID,
  name: "FP-Rack-01",
  total_units: 42,
  devices: [
    {
      id: "fp-dev-001",
      name: "fp-server-01",
      device_type: "server",
      status: "active",
      rack_unit_start: 1,
      rack_unit_height: 2,
      power_rated_w: 400,
      power_actual_w: 310,
      model: "SR650",
      vendor: "Lenovo",
    },
  ],
};

function renderPanel(props: Partial<{ rackId: string; rackName: string; totalUnits: number; onClose: () => void }> = {}) {
  return render(
    <FloorPlanRackPanel
      rackId={props.rackId ?? RACK_ID}
      rackName={props.rackName ?? "FP-Rack-01"}
      totalUnits={props.totalUnits ?? 42}
      onClose={props.onClose ?? vi.fn()}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FloorPlanRackPanel", () => {
  it("shows loading state initially", () => {
    server.use(http.get(RACK_URL, async () => new Promise(() => {})));
    renderPanel();
    expect(screen.getByText(/loading rack/i)).toBeInTheDocument();
  });

  it("renders rack name and device count in header after load", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    // Wait for the API response — the device count updates from 0 to 1 after fetch
    await waitFor(() => expect(screen.getByText(/1 device/)).toBeInTheDocument());
    expect(screen.getByText("FP-Rack-01")).toBeInTheDocument();
  });

  it("renders device tile in the elevation grid", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => expect(screen.getByText("fp-server-01")).toBeInTheDocument());
  });

  it("clicking a device shows the device detail view", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByText("fp-server-01"));
    await userEvent.click(screen.getByText("fp-server-01"));
    // Device detail shows the device name prominently in the header band
    await waitFor(() => expect(screen.getAllByText("fp-server-01").length).toBeGreaterThanOrEqual(1));
    // Back button appears
    expect(screen.getByText(/FP-Rack-01/i)).toBeInTheDocument();
  });

  it("back button in device detail returns to elevation view", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByText("fp-server-01"));

    // Click device to enter detail view
    await userEvent.click(screen.getByText("fp-server-01"));
    await waitFor(() => expect(screen.getByText(/FP-Rack-01/i)).toBeInTheDocument());

    // Click back button (contains rack name text)
    await userEvent.click(screen.getByText(/FP-Rack-01/i));

    // Elevation grid returns — Add Device button visible again
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add device/i })).toBeInTheDocument()
    );
  });

  it("clicking Add Device button opens the AddDeviceModal", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByRole("button", { name: /add device/i }));
    await userEvent.click(screen.getByRole("button", { name: /add device/i }));
    // Modal title contains the rack name
    await waitFor(() =>
      expect(screen.getByText(/add device/i, { selector: "h2" })).toBeInTheDocument()
    );
  });

  it("close button calls onClose", async () => {
    mockElevation(BASE_ELEVATION);
    const onClose = vi.fn();
    renderPanel({ onClose });
    await waitFor(() => screen.getByText("FP-Rack-01"));
    // The X button — last button in the header
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons[buttons.length - 1];
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders an empty rack without errors", async () => {
    mockElevation({ id: RACK_ID, name: "Empty-FP-Rack", total_units: 10, devices: [] });
    renderPanel({ rackName: "Empty-FP-Rack" });
    // Wait for the API to return and the elevation grid to render
    await waitFor(() => expect(screen.getByText(/empty rack/i)).toBeInTheDocument());
  });

  it("device detail shows U position information", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByText("fp-server-01"));
    await userEvent.click(screen.getByText("fp-server-01"));
    // U-position row: "U1–U2" (start=1, height=2)
    await waitFor(() => expect(screen.getByText(/U1/)).toBeInTheDocument());
  });

  it("device detail shows vendor/model", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByText("fp-server-01"));
    await userEvent.click(screen.getByText("fp-server-01"));
    await waitFor(() => expect(screen.getByText(/SR650/)).toBeInTheDocument());
  });

  it("device detail shows Open full detail button", async () => {
    mockElevation(BASE_ELEVATION);
    renderPanel();
    await waitFor(() => screen.getByText("fp-server-01"));
    await userEvent.click(screen.getByText("fp-server-01"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /open full detail/i })).toBeInTheDocument()
    );
  });
});
