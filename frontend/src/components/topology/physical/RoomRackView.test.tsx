/**
 * Tests for RoomRackView
 *
 * Covers:
 *  - Shows loading state while floor plan is loading
 *  - Shows error state on failure
 *  - Shows "select a datacenter" when no datacenterId prop
 *  - Shows room name from floor plan response
 *  - Shows rack header button with rack name and U stats
 *  - Clicking the rack header button calls onRackHeaderClick with (room, rack)
 *  - After rack elevation loads, shows device names
 *  - Clicking a device calls onDeviceClick with DevicePanelInfo
 */
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { server } from "@/test/handlers";
import { RoomRackView } from "./RoomRackView";
import type { FloorPlanRack, FloorPlanRoom } from "@/types/topology";

const noop = vi.fn();

describe("RoomRackView", () => {
  // ── Loading / error / empty states ───────────────────────────────────────

  it("shows loading state while floor plan is in-flight", () => {
    server.use(
      http.get("/api/v1/topology/floor-plan", async () => {
        await new Promise(() => {}); // never resolves
      })
    );
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    expect(screen.getByText(/loading racks/i)).toBeInTheDocument();
  });

  it("shows error state when floor plan fetch fails", async () => {
    server.use(
      http.get("/api/v1/topology/floor-plan", () =>
        HttpResponse.json(null, { status: 500 })
      )
    );
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it("shows prompt when no datacenterId is provided", () => {
    render(
      <RoomRackView
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    expect(screen.getByText(/select a datacenter/i)).toBeInTheDocument();
  });

  // ── Room and rack rendering ───────────────────────────────────────────────

  it("shows room name from floor plan", async () => {
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Room A")).toBeInTheDocument();
    });
  });

  it("shows rack name in a clickable header button", async () => {
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rack-01/i })).toBeInTheDocument();
    });
  });

  it("shows U stats in rack header", async () => {
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      // used_units=2, total_units=42
      expect(screen.getByText(/2U \/ 42U/)).toBeInTheDocument();
    });
  });

  // ── Rack header click ────────────────────────────────────────────────────

  it("calls onRackHeaderClick(room, rack) when rack header is clicked", async () => {
    const onRackHeaderClick = vi.fn();
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={onRackHeaderClick}
      />
    );

    await waitFor(() => screen.getByRole("button", { name: /Rack-01/i }));
    fireEvent.click(screen.getByRole("button", { name: /Rack-01/i }));

    expect(onRackHeaderClick).toHaveBeenCalledOnce();
    const [room, rack] = onRackHeaderClick.mock.calls[0] as [FloorPlanRoom, FloorPlanRack];
    expect(room.id).toBe("room-001");
    expect(rack.id).toBe("rack-001");
  });

  // ── Device rendering ─────────────────────────────────────────────────────

  it("shows device name after elevation data loads", async () => {
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("server-001")).toBeInTheDocument();
    });
  });

  it("calls onDeviceClick with device info when device is clicked", async () => {
    const onDeviceClick = vi.fn();
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={onDeviceClick}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );

    await waitFor(() => screen.getByText("server-001"));
    fireEvent.click(screen.getByText("server-001"));

    expect(onDeviceClick).toHaveBeenCalledOnce();
    expect(onDeviceClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dev-001", name: "server-001" })
    );
  });

  it("shows 'Empty' message for a rack with no devices", async () => {
    server.use(
      http.get("/api/v1/racks/:id/elevation", () =>
        HttpResponse.json({
          id: "rack-001",
          name: "Rack-01",
          total_units: 42,
          devices: [],
        })
      )
    );
    render(
      <RoomRackView
        datacenterId="dc-001"
        onDeviceClick={noop}
        onChassisClick={noop}
        onRackHeaderClick={noop}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/empty/i)).toBeInTheDocument();
    });
  });
});
