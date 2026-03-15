/**
 * Tests for DatacenterFloorPlan — the floor plan page component.
 *
 * Covers:
 *  - "Select a datacenter" prompt when no datacenter chosen
 *  - Datacenter name rendered after load
 *  - Room name and rack tiles rendered (Tiles mode)
 *  - View toggle renders Tiles / Elevation buttons
 *  - Switching to Elevation mode renders rack elevation diagrams
 *  - Clicking a rack tile in Tiles mode opens FloorPlanRackPanel (right panel)
 *  - Right panel closes when X is clicked
 *  - Power utilization legend visible in Tiles mode, hidden in Elevation mode
 *  - Empty room shows "No racks" message
 */
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "@/test/utils";
import { server } from "@/test/handlers";
import { DatacenterFloorPlan } from "./DatacenterFloorPlan";

const DC_ID = "dc-001";
const FLOOR_PLAN_URL = `/api/v1/topology/floor-plan`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFloorPlan(data: object) {
  server.use(http.get(FLOOR_PLAN_URL, () => HttpResponse.json(data)));
}

const BASE_FLOOR_PLAN = {
  id: DC_ID,
  name: "Main DC",
  rooms: [
    {
      id: "room-001",
      name: "Server Room A",
      notes: null,
      corridors: [
        {
          id: "corridor-001",
          name: "Main Corridor",
          racks: [
            {
              id: "rack-001",
              name: "Rack-01",
              total_units: 42,
              used_units: 10,
              power_max_w: 10000,
              power_actual_w: 4500,
              power_utilization_pct: 45,
              device_count: 3,
            },
            {
              id: "rack-002",
              name: "Rack-02",
              total_units: 42,
              used_units: 38,
              power_max_w: 10000,
              power_actual_w: 9200,
              power_utilization_pct: 92,
              device_count: 12,
            },
          ],
        },
      ],
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DatacenterFloorPlan", () => {
  it("shows 'select a datacenter' when no datacenterId prop", () => {
    render(<DatacenterFloorPlan />);
    expect(screen.getByText(/select a datacenter/i)).toBeInTheDocument();
  });

  it("renders datacenter name after loading floor plan", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => expect(screen.getByText("Main DC")).toBeInTheDocument());
  });

  it("renders room name and rack tiles in Tiles mode", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Server Room A"));
    expect(screen.getByText("Rack-01")).toBeInTheDocument();
    expect(screen.getByText("Rack-02")).toBeInTheDocument();
  });

  it("renders Tiles and Elevation toggle buttons", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Main DC"));
    expect(screen.getByRole("button", { name: /tiles/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /elevation/i })).toBeInTheDocument();
  });

  it("shows power utilization legend in Tiles mode", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Main DC"));
    expect(screen.getByText(/power utilization/i)).toBeInTheDocument();
  });

  it("hides power utilization legend after switching to Elevation mode", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Main DC"));
    await userEvent.click(screen.getByRole("button", { name: /elevation/i }));
    expect(screen.queryByText(/power utilization/i)).not.toBeInTheDocument();
  });

  it("clicking a rack tile opens the FloorPlanRackPanel in the right rail", async () => {
    // Also mock the elevation call triggered when the panel loads
    server.use(
      http.get(`/api/v1/racks/rack-001/elevation`, () =>
        HttpResponse.json({
          id: "rack-001",
          name: "Rack-01",
          total_units: 42,
          devices: [],
        })
      )
    );
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Server Room A"));

    // Click the Rack-01 tile (there are two elements with "Rack-01" — title tooltip + button text)
    const rack01Buttons = screen.getAllByText("Rack-01");
    await userEvent.click(rack01Buttons[0]);

    // FloorPlanRackPanel header appears in the right rail (shows rack name + "Add Device")
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add device/i })).toBeInTheDocument()
    );
  });

  it("right panel closes when X button is clicked", async () => {
    server.use(
      http.get(`/api/v1/racks/rack-001/elevation`, () =>
        HttpResponse.json({ id: "rack-001", name: "Rack-01", total_units: 42, devices: [] })
      )
    );
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Server Room A"));

    // Open the panel
    const rack01Buttons = screen.getAllByText("Rack-01");
    await userEvent.click(rack01Buttons[0]);
    await waitFor(() => screen.getByRole("button", { name: /add device/i }));

    // Find and click the X close button (last button in the panel header)
    const allButtons = screen.getAllByRole("button");
    // The X button in the panel header is the last one
    await userEvent.click(allButtons[allButtons.length - 1]);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /add device/i })).not.toBeInTheDocument()
    );
  });

  it("elevation mode renders RackElevation components for each rack", async () => {
    // Mock both rack elevations
    server.use(
      http.get(`/api/v1/racks/rack-001/elevation`, () =>
        HttpResponse.json({ id: "rack-001", name: "Rack-01-Elevation", total_units: 42, devices: [] })
      ),
      http.get(`/api/v1/racks/rack-002/elevation`, () =>
        HttpResponse.json({ id: "rack-002", name: "Rack-02-Elevation", total_units: 42, devices: [] })
      )
    );
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Main DC"));

    await userEvent.click(screen.getByRole("button", { name: /elevation/i }));

    await waitFor(() =>
      expect(screen.getByText("Rack-01-Elevation")).toBeInTheDocument()
    );
    expect(screen.getByText("Rack-02-Elevation")).toBeInTheDocument();
  });

  it("shows 'No racks' for an empty room", async () => {
    mockFloorPlan({
      id: DC_ID,
      name: "Empty DC",
      rooms: [{ id: "room-empty", name: "Empty Room", notes: null, corridors: [] }],
    });
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Empty DC"));
    expect(screen.getByText(/no racks/i)).toBeInTheDocument();
  });

  it("shows error state when floor-plan fetch fails", async () => {
    server.use(http.get(FLOOR_PLAN_URL, () => HttpResponse.json(null, { status: 500 })));
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load floor plan/i)).toBeInTheDocument()
    );
  });

  it("clicking a rack tile again deselects it (toggle)", async () => {
    server.use(
      http.get(`/api/v1/racks/rack-001/elevation`, () =>
        HttpResponse.json({ id: "rack-001", name: "Rack-01", total_units: 42, devices: [] })
      )
    );
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Server Room A"));

    const rack01Buttons = screen.getAllByText("Rack-01");

    // First click — opens panel
    await userEvent.click(rack01Buttons[0]);
    await waitFor(() => screen.getByRole("button", { name: /add device/i }));

    // Second click on same tile — closes panel
    const rack01ButtonsAgain = screen.getAllByText("Rack-01");
    await userEvent.click(rack01ButtonsAgain[0]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /add device/i })).not.toBeInTheDocument()
    );
  });

  it("datacenter selector is shown when no datacenterId prop", () => {
    render(<DatacenterFloorPlan />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText(/select a datacenter/i)).toBeInTheDocument();
  });

  it("datacenter selector is hidden when datacenterId is forced via prop", async () => {
    mockFloorPlan(BASE_FLOOR_PLAN);
    render(<DatacenterFloorPlan datacenterId={DC_ID} />);
    await waitFor(() => screen.getByText("Main DC"));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
