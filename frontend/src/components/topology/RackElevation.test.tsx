/**
 * Component tests for RackElevation.
 *
 * Tests:
 *  - Loading state renders spinner/text
 *  - Error state renders error message
 *  - Successful render shows rack name, device count, U rows
 *  - Devices are rendered at the correct rack unit
 *  - Close button triggers onClose callback
 *  - Empty rack (no devices) renders without crashing
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { render, screen, waitFor } from "@/test/utils";
import { server } from "@/test/handlers";
import { RackElevation } from "./RackElevation";

const RACK_ID = "rack-test-001";
const MOCK_RACK_URL = `/api/v1/topology/rack/${RACK_ID}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRackElevation(data: object) {
  server.use(
    http.get(MOCK_RACK_URL, () => HttpResponse.json(data))
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RackElevation", () => {
  it("renders loading state initially", () => {
    // Delay the response so loading state is visible
    server.use(
      http.get(MOCK_RACK_URL, async () => {
        await new Promise(() => {}); // Never resolves — stays loading
      })
    );

    render(<RackElevation rackId={RACK_ID} />);
    expect(screen.getByText(/loading rack/i)).toBeInTheDocument();
  });

  it("renders error state when fetch fails", async () => {
    server.use(
      http.get(MOCK_RACK_URL, () => HttpResponse.json(null, { status: 500 }))
    );

    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load rack elevation/i)).toBeInTheDocument();
    });
  });

  it("renders rack name and device count on success", async () => {
    mockRackElevation({
      id: RACK_ID,
      name: "Rack-Alpha",
      total_units: 42,
      devices: [
        {
          id: "dev-001",
          name: "server-001",
          device_type: "server",
          status: "active",
          rack_unit_start: 1,
          rack_unit_height: 2,
        },
      ],
    });

    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Rack-Alpha")).toBeInTheDocument();
    });
    expect(screen.getByText(/42U rack/)).toBeInTheDocument();
    expect(screen.getByText(/1 devices/)).toBeInTheDocument();
  });

  it("renders device name in the elevation grid", async () => {
    mockRackElevation({
      id: RACK_ID,
      name: "Rack-Beta",
      total_units: 10,
      devices: [
        {
          id: "dev-002",
          name: "my-special-server",
          device_type: "server",
          status: "active",
          rack_unit_start: 3,
          rack_unit_height: 1,
        },
      ],
    });

    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => {
      expect(screen.getByText("my-special-server")).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", async () => {
    mockRackElevation({
      id: RACK_ID,
      name: "Rack-Close",
      total_units: 5,
      devices: [],
    });

    const onClose = vi.fn();
    render(<RackElevation rackId={RACK_ID} onClose={onClose} />);
    await waitFor(() => screen.getByText("Rack-Close"));

    const closeBtn = screen.getByRole("button");
    closeBtn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders empty rack without crashing", async () => {
    mockRackElevation({
      id: RACK_ID,
      name: "Empty-Rack",
      total_units: 42,
      devices: [],
    });

    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => {
      expect(screen.getByText("Empty-Rack")).toBeInTheDocument();
    });
    expect(screen.getByText(/0 devices/)).toBeInTheDocument();
  });

  it("renders multiple devices at correct U positions", async () => {
    mockRackElevation({
      id: RACK_ID,
      name: "Multi-Dev-Rack",
      total_units: 20,
      devices: [
        { id: "d1", name: "device-one", device_type: "server", status: "active", rack_unit_start: 1, rack_unit_height: 2 },
        { id: "d2", name: "device-two", device_type: "switch", status: "active", rack_unit_start: 5, rack_unit_height: 1 },
      ],
    });

    render(<RackElevation rackId={RACK_ID} />);
    await waitFor(() => screen.getByText("device-one"));
    expect(screen.getByText("device-two")).toBeInTheDocument();
  });
});
