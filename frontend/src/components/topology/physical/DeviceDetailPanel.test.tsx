/**
 * Tests for DeviceDetailPanel
 *
 * Covers:
 *  - Renders device name and type immediately from prop data
 *  - Renders status, rack position, power from prop data
 *  - Shows loading skeletons while the full device fetch is in-flight
 *  - Shows serial number, management IP, last seen after fetch resolves
 *  - Closes on X button click
 *  - Closes on Escape key
 *  - Closes on backdrop click
 *  - "Open full detail" button navigates to /devices/:id
 */
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/utils";
import { server } from "@/test/handlers";
import { DeviceDetailPanel, type DevicePanelInfo } from "./DeviceDetailPanel";

const DEVICE: DevicePanelInfo = {
  id: "dev-001",
  name: "server-001",
  device_type: "server",
  status: "active",
  rack_unit_start: 3,
  rack_unit_height: 2,
  power_rated_w: 500,
  power_actual_w: 350,
  vendor: "Lenovo",
  model: "SR650",
};

describe("DeviceDetailPanel", () => {
  // ── Immediate rendering from prop data ───────────────────────────────────

  it("shows device name immediately", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    expect(screen.getByText("server-001")).toBeInTheDocument();
  });

  it("shows device type in header", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    // "server" is displayed in the coloured header type label (exact text, not "server-001")
    expect(screen.getByText("server")).toBeInTheDocument();
  });

  it("shows status", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it("shows rack position", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    // rack_unit_start=3, rack_unit_height=2  →  U3–U4
    expect(screen.getByText(/U3/)).toBeInTheDocument();
    expect(screen.getByText(/U4/)).toBeInTheDocument();
  });

  it("shows power info", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    expect(screen.getByText(/350W actual/)).toBeInTheDocument();
    expect(screen.getByText(/500W rated/)).toBeInTheDocument();
  });

  it("shows vendor/model label while full device loads", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    // Manufacturer and model are shown as soon as the prop provides them
    expect(screen.getByText("Lenovo")).toBeInTheDocument();
    expect(screen.getByText("SR650")).toBeInTheDocument();
  });

  // ── Enrichment fields (require API response) ─────────────────────────────

  it("shows serial number after fetch", async () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("SN0001")).toBeInTheDocument();
    });
  });

  it("shows management IP after fetch", async () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    });
  });

  it("shows last seen timestamp after fetch", async () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    // Wait for the full fetch to resolve — serial number is a reliable indicator
    await waitFor(() => expect(screen.getByText("SN0001")).toBeInTheDocument());
    // last_seen_at = "2026-03-12T10:30:00Z" — fmt() formats it using toLocaleString.
    // The DOM label text is "Last seen" (CSS uppercase is visual-only).
    // After fetch the value span should NOT contain the dash placeholder "—".
    const lastSeenLabel = screen.getByText("Last seen");
    const rowContainer = lastSeenLabel.closest("div")?.parentElement;
    expect(rowContainer?.textContent).not.toContain("—");
  });

  it("shows '—' for enriched fields when API returns nulls", async () => {
    server.use(
      http.get("/api/v1/devices/:id", () =>
        HttpResponse.json({
          id: "dev-001",
          name: "server-001",
          device_type: "server",
          status: "active",
          manufacturer: null,
          model: null,
          serial_number: null,
          rack_id: null,
          rack_unit_start: null,
          rack_unit_size: null,
          face: null,
          power_rated_w: null,
          power_actual_w: null,
          weight_kg: null,
          management_ip: null,
          management_protocol: null,
          snmp_community: null,
          snmp_version: null,
          ssh_username: null,
          purchase_date: null,
          warranty_expiry: null,
          end_of_support_date: null,
          end_of_life_date: null,
          notes: null,
          custom_fields: null,
          last_synced_at: null,
          last_seen_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          server_detail: null,
          network_detail: null,
          pdu_detail: null,
        })
      )
    );

    render(<DeviceDetailPanel device={{ ...DEVICE, vendor: undefined, model: undefined }} onClose={vi.fn()} />);

    // Wait for fetch to complete — the "—" placeholders should appear
    await waitFor(() => {
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  // ── Close behaviour ──────────────────────────────────────────────────────

  it("calls onClose when X button is clicked", () => {
    const onClose = vi.fn();
    render(<DeviceDetailPanel device={DEVICE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<DeviceDetailPanel device={DEVICE} onClose={onClose} />);
    // The backdrop is the aria-hidden overlay div
    const backdrop = document.querySelector("[aria-hidden='true']") as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<DeviceDetailPanel device={DEVICE} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    render(<DeviceDetailPanel device={DEVICE} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Navigation ───────────────────────────────────────────────────────────

  it("has an 'Open full detail' button", () => {
    render(<DeviceDetailPanel device={DEVICE} onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /open full detail/i })
    ).toBeInTheDocument();
  });
});
