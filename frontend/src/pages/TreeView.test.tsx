/**
 * Unit tests for the Tree View page.
 *
 * Covers:
 *  - Toolbar renders (title, search, Expand All, Collapse All)
 *  - Datacenter nodes shown after initial load
 *  - Expanding datacenter → rooms lazy-loaded
 *  - Expanding room → racks lazy-loaded
 *  - Expanding rack → devices lazy-loaded
 *  - Expanding server → interfaces and VMs shown
 *  - Expanding blade chassis → blades shown
 *  - Clicking a node opens the detail panel
 *  - Clicking the same node again closes the panel
 *  - × button closes the panel
 *  - Detail panel shows correct fields per entity type
 *  - "Open Full Page" button present for device nodes
 *  - Search shows matching-nodes indicator
 *  - Clear (×) button resets search
 *  - Collapse All removes all children from view
 *  - Expand All (two clicks) drills down using cached data
 *  - Empty state when no datacenters
 *  - "No rooms" hint when datacenter has no rooms
 *  - Switching selection replaces the detail panel
 */
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/handlers";
import { render, screen, waitFor, within } from "@/test/utils";
import TreeView from "./TreeView";

const BASE = "/api/v1";

// ── helper: find the expand/collapse toggle for a labelled row ────────────────
// The toggle button is the first <button> inside the row div that contains
// the given text label.
function getToggleFor(label: string | RegExp): HTMLElement {
  // Use getAllByText so this works even when the panel also shows the same name.
  // The first match is always the tree-row span (DOM order: tree before panel).
  const text = screen.getAllByText(label)[0];
  const row = text.closest("div[style]") as HTMLElement;
  return within(row).getAllByRole("button")[0];
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TreeView page", () => {
  // ── Toolbar ────────────────────────────────────────────────────────────────

  it("renders toolbar with title, search, and action buttons", async () => {
    render(<TreeView />);
    expect(screen.getByText("Tree View")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filter by name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /collapse all/i })).toBeInTheDocument();
  });

  // ── Initial data load ─────────────────────────────────────────────────────

  it("shows datacenter nodes after loading", async () => {
    render(<TreeView />);
    expect(await screen.findByText("Main DC")).toBeInTheDocument();
  });

  it("shows empty state when no datacenters exist", async () => {
    server.use(
      http.get(`${BASE}/datacenters`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
      )
    );
    render(<TreeView />);
    expect(await screen.findByText(/no datacenters found/i)).toBeInTheDocument();
  });

  // ── Expand / collapse datacenter ──────────────────────────────────────────

  it("lazy-loads rooms when datacenter is expanded", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(getToggleFor("Main DC"));

    expect(await screen.findByText("Server Room A")).toBeInTheDocument();
  });

  it("shows 'No rooms' hint when datacenter has no rooms", async () => {
    server.use(
      http.get(`${BASE}/rooms`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
      )
    );
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(getToggleFor("Main DC"));

    expect(await screen.findByText(/no rooms/i)).toBeInTheDocument();
  });

  it("hides rooms when datacenter is collapsed again", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    const toggle = getToggleFor("Main DC");
    await user.click(toggle);
    await screen.findByText("Server Room A");

    await user.click(toggle);
    await waitFor(() =>
      expect(screen.queryByText("Server Room A")).not.toBeInTheDocument()
    );
  });

  // ── Expand room → racks ───────────────────────────────────────────────────

  it("lazy-loads racks when room is expanded", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");

    await user.click(getToggleFor("Server Room A"));

    expect(await screen.findByText("Rack-A01")).toBeInTheDocument();
  });

  it("shows rack status badge", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));

    await screen.findByText("Rack-A01");
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  // ── Expand rack → devices ─────────────────────────────────────────────────

  it("lazy-loads devices when rack is expanded", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");

    await user.click(getToggleFor("Rack-A01"));

    expect(await screen.findByText("server-001")).toBeInTheDocument();
    expect(await screen.findByText("chassis-001")).toBeInTheDocument();
  });

  it("shows 'No devices' hint when rack is empty", async () => {
    server.use(
      http.get(`${BASE}/devices`, ({ request }) => {
        if (new URL(request.url).searchParams.get("rack_id"))
          return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
        return HttpResponse.json({ items: [], total: 0, page: 1, size: 50 });
      })
    );
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));

    expect(await screen.findByText(/no devices/i)).toBeInTheDocument();
  });

  // ── Expand server → interfaces + VMs ─────────────────────────────────────

  it("lazy-loads interfaces and VMs when a server device is expanded", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");

    await user.click(getToggleFor("server-001"));

    expect(await screen.findByText(/eth0/)).toBeInTheDocument();
    expect(await screen.findByText("vm-webserver-01")).toBeInTheDocument();
  });

  it("shows interface speed label in the row", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");
    await user.click(getToggleFor("server-001"));

    // 1000 Mbps → "1G"
    expect(await screen.findByText(/eth0.*1G/)).toBeInTheDocument();
  });

  it("shows 'No interfaces or VMs' when device has none", async () => {
    server.use(
      http.get(`${BASE}/interfaces`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
      ),
      http.get(`${BASE}/virt/hosts`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, size: 50 })
      )
    );
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");
    await user.click(getToggleFor("server-001"));

    expect(await screen.findByText(/no interfaces or vms/i)).toBeInTheDocument();
  });

  // ── Expand blade chassis → blades ─────────────────────────────────────────

  it("lazy-loads blades when a blade chassis is expanded", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("chassis-001");

    await user.click(getToggleFor("chassis-001"));

    expect(await screen.findByText("blade-001")).toBeInTheDocument();
  });

  // ── Selection & detail panel ──────────────────────────────────────────────

  it("opens the detail panel when a datacenter row is clicked", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByText("Main DC"));

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Datacenter")).toBeInTheDocument();
    expect(within(panel).getByText("Testville")).toBeInTheDocument();
    expect(within(panel).getByText("US")).toBeInTheDocument();
  });

  it("closes the panel when the same node is clicked again", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByText("Main DC"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    // Panel is now open — "Main DC" appears in both the tree row and the panel
    // header; click the first occurrence (tree row) to deselect.
    await user.click(screen.getAllByText("Main DC")[0]);
    await waitFor(() =>
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    );
  });

  it("closes the panel via the × button", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByText("Main DC"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close detail panel/i }));
    await waitFor(() =>
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument()
    );
  });

  it("detail panel shows correct fields for a rack node", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");

    await user.click(screen.getByText("Rack-A01"));

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Rack")).toBeInTheDocument();
    expect(within(panel).getByText(/42 U/i)).toBeInTheDocument();
    expect(within(panel).getByText(/10000 W/i)).toBeInTheDocument();
  });

  it("detail panel shows correct fields for a device node", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");

    await user.click(screen.getByText("server-001"));

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Device")).toBeInTheDocument();
    expect(within(panel).getByText("Lenovo")).toBeInTheDocument();
    expect(within(panel).getByText("SR650")).toBeInTheDocument();
    expect(within(panel).getByText("10.0.0.1")).toBeInTheDocument();
  });

  it("detail panel shows correct fields for an interface node", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");
    await user.click(getToggleFor("server-001"));
    const ifaceRow = await screen.findByText(/eth0/);

    await user.click(ifaceRow);

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Interface")).toBeInTheDocument();
    expect(within(panel).getByText("copper_rj45")).toBeInTheDocument();
    expect(within(panel).getByText(/1000 Mbps/i)).toBeInTheDocument();
    expect(within(panel).getByText("aa:bb:cc:dd:ee:ff")).toBeInTheDocument();
  });

  it("detail panel shows correct fields for a VM node", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");
    await user.click(getToggleFor("server-001"));
    await screen.findByText("vm-webserver-01");

    await user.click(screen.getByText("vm-webserver-01"));

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText(/^Vm$/i)).toBeInTheDocument();
    expect(within(panel).getByText("Ubuntu 22.04")).toBeInTheDocument();
    expect(within(panel).getByText("16 GB")).toBeInTheDocument();
    expect(within(panel).getByText("100 GB")).toBeInTheDocument();
  });

  it("detail panel for device has 'Open Full Page' button", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");
    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(getToggleFor("Server Room A"));
    await screen.findByText("Rack-A01");
    await user.click(getToggleFor("Rack-A01"));
    await screen.findByText("server-001");

    await user.click(screen.getByText("server-001"));

    expect(
      screen.getByRole("button", { name: /open full page/i })
    ).toBeInTheDocument();
  });

  it("switches detail panel when a different node is selected", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByText("Main DC"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();

    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");
    await user.click(screen.getByText("Server Room A"));

    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Room")).toBeInTheDocument();
    // Datacenter fields gone
    expect(within(panel).queryByText("Testville")).not.toBeInTheDocument();
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it("shows the highlight indicator when search is active", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.type(screen.getByPlaceholderText(/filter by name/i), "Main");

    expect(screen.getByText(/matching nodes highlighted/i)).toBeInTheDocument();
  });

  it("clear (×) button removes the search indicator", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.type(screen.getByPlaceholderText(/filter by name/i), "Main");
    expect(screen.getByText(/matching nodes highlighted/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear search/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/matching nodes highlighted/i)
      ).not.toBeInTheDocument()
    );
  });

  it("clear (×) button empties the search input", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    const input = screen.getByPlaceholderText(/filter by name/i);
    await user.type(input, "query");
    expect(input).toHaveValue("query");

    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(input).toHaveValue("");
  });

  // ── Collapse All ──────────────────────────────────────────────────────────

  it("Collapse All hides all expanded children", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(getToggleFor("Main DC"));
    await screen.findByText("Server Room A");

    await user.click(screen.getByRole("button", { name: /collapse all/i }));

    await waitFor(() =>
      expect(screen.queryByText("Server Room A")).not.toBeInTheDocument()
    );
  });

  // ── Expand All ────────────────────────────────────────────────────────────

  it("first Expand All click triggers room fetch by expanding datacenter", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(await screen.findByText("Server Room A")).toBeInTheDocument();
  });

  it("second Expand All click expands cached rooms exposing racks", async () => {
    const user = userEvent.setup();
    render(<TreeView />);
    await screen.findByText("Main DC");

    await user.click(screen.getByRole("button", { name: /expand all/i }));
    await screen.findByText("Server Room A");

    await user.click(screen.getByRole("button", { name: /expand all/i }));

    expect(await screen.findByText("Rack-A01")).toBeInTheDocument();
  });
});
