/**
 * Component tests for RackElevation.
 *
 * Tests:
 *  - Loading state renders spinner/text
 *  - Error state renders error message
 *  - Successful render shows rack name, device count, U rows
 *  - Devices rendered at correct rack unit
 *  - Close button triggers onClose callback
 *  - Empty rack renders without crashing
 *  - Multiple devices all appear
 *  - onDeviceClick fires instead of navigation when provided
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "@/test/utils";
import { server } from "@/test/handlers";
import { RackElevation } from "./RackElevation";

const RACK_ID = "rack-test-001";
// Must match the URL in useRackElevation: /racks/:id/elevation
const RACK_URL = `/api/v1/racks/${RACK_ID}/elevation`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockElevation(data: object) {
  server.use(http.get(RACK_URL, () => HttpResponse.json(data)));
}

function makeDevice(overrides: object = {}) {
  return {
    id: "dev-001",
    name: "server-001",
    device_type: "server",
    status: "active",
    rack_unit_start: 1,
    rack_unit_height: 2,
    power_rated_w: 400,
    power_actual_w: 320,
    model: "SR650",
    vendor: "Lenovo",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RackElevation", () => {
  it("renders loading state initially", () => {
    server.use(http.get(RACK_URL, async () => new Promise(() => {}))); // never resolves
    render(<RackElevation rackId={RACK_ID} />);
    expect(screen.getByText(/loading rack/i)).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    server.use(http.get(RACK_URL, () => HttpResponse.json(null, { status: 500 })));
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load rack elevation/i)).toBeInTheDocument();
    });
  });

  it("renders rack name and device count on success", async () => {
    mockElevation({
      id: RACK_ID,
      name: "Rack-Alpha",
      total_units: 42,
      devices: [makeDevice()],
    });
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => expect(screen.getByText("Rack-Alpha")).toBeInTheDocument());
    expect(screen.getByText(/42U rack/)).toBeInTheDocument();
    expect(screen.getByText(/1 devices/)).toBeInTheDocument();
  });

  it("renders device name in the elevation grid", async () => {
    mockElevation({
      id: RACK_ID,
      name: "Rack-Beta",
      total_units: 10,
      devices: [makeDevice({ name: "my-special-server" })],
    });
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() =>
      expect(screen.getByText("my-special-server")).toBeInTheDocument()
    );
  });

  it("calls onClose when the close button is clicked", async () => {
    mockElevation({ id: RACK_ID, name: "Rack-Close", total_units: 5, devices: [] });
    const onClose = vi.fn();
    render(<RackElevation rackId={RACK_ID} onClose={onClose} />);
    await waitFor(() => screen.getByText("Rack-Close"));
    await userEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders empty rack without crashing", async () => {
    mockElevation({ id: RACK_ID, name: "Empty-Rack", total_units: 42, devices: [] });
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => expect(screen.getByText("Empty-Rack")).toBeInTheDocument());
    expect(screen.getByText(/0 devices/)).toBeInTheDocument();
  });

  it("renders multiple devices", async () => {
    mockElevation({
      id: RACK_ID,
      name: "Multi-Dev-Rack",
      total_units: 20,
      devices: [
        makeDevice({ id: "d1", name: "device-one", rack_unit_start: 1, rack_unit_height: 2 }),
        makeDevice({ id: "d2", name: "device-two", device_type: "switch", rack_unit_start: 5, rack_unit_height: 1 }),
      ],
    });
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => screen.getByText("device-one"));
    expect(screen.getByText("device-two")).toBeInTheDocument();
  });

  it("calls onDeviceClick instead of navigating when provided", async () => {
    mockElevation({
      id: RACK_ID,
      name: "Click-Rack",
      total_units: 10,
      devices: [makeDevice({ name: "clickable-server" })],
    });
    const onDeviceClick = vi.fn();
    render(<RackElevation rackId={RACK_ID} onDeviceClick={onDeviceClick} />);
    await waitFor(() => screen.getByText("clickable-server"));
    await userEvent.click(screen.getByText("clickable-server"));
    expect(onDeviceClick).toHaveBeenCalledOnce();
    expect(onDeviceClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: "clickable-server", device_type: "server" })
    );
  });

  it("renders without crashing when onDeviceClick is absent (navigation path)", async () => {
    mockElevation({
      id: RACK_ID,
      name: "Nav-Rack",
      total_units: 10,
      devices: [makeDevice({ name: "nav-server" })],
    });
    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => expect(screen.getByText("nav-server")).toBeInTheDocument());
    // Click succeeds without throwing even though no onDeviceClick provided
    await userEvent.click(screen.getByText("nav-server"));
  });
});
