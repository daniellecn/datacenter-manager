/**
 * MSW (Mock Service Worker) request handlers for unit tests.
 *
 * These handlers intercept API calls made by components under test
 * so tests run without a live backend.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const BASE = "/api/v1";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authHandlers = [
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    if (body.username === "admin" && body.password === "admin123") {
      return HttpResponse.json({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        must_change_password: false,
      });
    }
    if (body.username === "forced" && body.password === "forced123") {
      return HttpResponse.json({
        access_token: "mock-forced-token",
        refresh_token: "mock-forced-refresh",
        must_change_password: true,
      });
    }
    return HttpResponse.json(
      { detail: "Incorrect username or password." },
      { status: 401 }
    );
  }),

  http.get(`${BASE}/auth/me`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return HttpResponse.json({ detail: "Not authenticated." }, { status: 401 });
    }
    return HttpResponse.json({
      id: "user-uuid-001",
      username: "admin",
      email: "admin@test.local",
      role: "admin",
      is_active: true,
      must_change_password: false,
    });
  }),

  http.post(`${BASE}/auth/logout`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${BASE}/auth/refresh`, async ({ request }) => {
    const body = (await request.json()) as { refresh_token: string };
    if (body.refresh_token === "mock-refresh-token") {
      return HttpResponse.json({
        access_token: "mock-new-access-token",
        refresh_token: "mock-new-refresh-token",
        must_change_password: false,
      });
    }
    return HttpResponse.json({ detail: "Refresh token has been revoked." }, { status: 401 });
  }),
];

// ── Datacenters ───────────────────────────────────────────────────────────────

export const datacenterHandlers = [
  http.get(`${BASE}/datacenters`, () =>
    HttpResponse.json({
      items: [
        { id: "dc-001", name: "Main DC", city: "Testville", country: "US" },
      ],
      total: 1,
      page: 1,
      size: 50,
    })
  ),
];

// ── Devices ───────────────────────────────────────────────────────────────────

export const deviceHandlers = [
  http.get(`${BASE}/devices`, () =>
    HttpResponse.json({
      items: [
        {
          id: "dev-001",
          name: "server-001",
          device_type: "server",
          status: "active",
          manufacturer: "Lenovo",
          model: "SR650",
          serial_number: "SN0001",
          rack_id: "rack-001",
        },
      ],
      total: 1,
      page: 1,
      size: 50,
    })
  ),

  http.post(`${BASE}/devices`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: "dev-new-001", ...body, status: "active" },
      { status: 201 }
    );
  }),

  http.get(`${BASE}/devices/:id`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      name: "server-001",
      device_type: "server",
      status: "active",
      manufacturer: "Lenovo",
      model: "SR650",
      serial_number: "SN0001",
      rack_id: "rack-001",
    })
  ),

  http.delete(`${BASE}/devices/:id`, () =>
    HttpResponse.json({ id: "dev-001", status: "inactive" })
  ),
];

// ── Racks ──────────────────────────────────────────────────────────────────────

export const rackHandlers = [
  http.get(`${BASE}/racks`, () =>
    HttpResponse.json({
      items: [
        { id: "rack-001", name: "Rack-01", total_units: 42, room_id: "room-001" },
      ],
      total: 1,
      page: 1,
      size: 50,
    })
  ),

  http.get(`${BASE}/topology/rack/:id`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      name: "Rack-01",
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
    })
  ),
];

// ── Dashboard ──────────────────────────────────────────────────────────────────

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/summary`, () =>
    HttpResponse.json({
      device_count: 42,
      active_device_count: 38,
      rack_count: 10,
      vm_count: 120,
      alert_count: 3,
    })
  ),
];

// ── All handlers combined ──────────────────────────────────────────────────────

export const handlers = [
  ...authHandlers,
  ...datacenterHandlers,
  ...deviceHandlers,
  ...rackHandlers,
  ...dashboardHandlers,
];

export const server = setupServer(...handlers);
