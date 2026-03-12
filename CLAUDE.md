# CLAUDE.md — Datacenter Manager

This file is the source of truth for AI assistants working on this project.
Read it fully before writing any code.

---

## What This App Does

A full-stack, on-premise web application for managing a physical datacenter.
It tracks three layers of infrastructure:

1. **Physical** — datacenters, rooms, racks, devices (servers, switches, routers,
   firewalls, storage, PDUs, patch panels), power consumption, cooling, licensing,
   warranties, and end-of-life dates.
2. **Network** — physical and logical connections between devices, VLANs, subnets,
   IP address management (IPAM), SAN fabrics, and hop-path tracing.
3. **Virtual** — VMware vCenter clusters/hosts/VMs, SCVMM (Hyper-V), Proxmox,
   and Citrix XenServer/XCP-ng. VMs, datastores, resource pools.

The app auto-populates data from live integrations:
- **xClarity** (Lenovo server management API)
- **SNMP** (network device polling)
- **SSH** (Netmiko — multi-vendor CLI collection)
- **vCenter REST API**
- **SCVMM REST API / WinRM+PowerShell fallback**
- **Proxmox API**
- **XenAPI**

Runs entirely on-premise inside the internal network. No cloud dependency.

---

## Tech Stack & Reasoning

### Backend
| Technology | Version | Why |
|---|---|---|
| Python | 3.12+ | Ecosystem for networking libs (Netmiko, pysnmp, pyVmomi) |
| FastAPI | latest | Async, auto OpenAPI docs, Pydantic v2 native |
| SQLAlchemy | 2.x async | ORM with async support, works well with Alembic |
| Alembic | latest | Migration tool for SQLAlchemy |
| asyncpg | latest | Async PostgreSQL driver |
| Pydantic | v2 | Schema validation, settings management |
| python-jose | latest | JWT tokens |
| passlib + bcrypt | latest | Password hashing |
| cryptography (Fernet) | latest | Credential encryption at rest |
| APScheduler | latest | In-process scheduler for sync jobs — no Celery/Redis needed at this scale |
| httpx | latest | Async HTTP client for REST integrations |
| networkx | latest | Graph traversal for hop-path calculation |
| pysnmp | latest | SNMP v2c/v3 polling |
| netmiko | latest | Multi-vendor SSH collection |
| proxmoxer | latest | Proxmox API client |
| pyVmomi | latest | VMware vCenter SDK (fallback if REST insufficient) |
| pywinrm | latest | WinRM for SCVMM PowerShell fallback |

### Frontend
| Technology | Why |
|---|---|
| React 18 + TypeScript | Type safety across the entire UI |
| Vite | Fast dev server, fast builds |
| React Flow | Interactive topology canvas with drag & drop |
| TanStack Query | Server state, caching, background refetch |
| Zustand | Lightweight client UI state (selections, sidebar, canvas) |
| Axios | HTTP client with interceptor support (token refresh) |
| React Router v6 | Client-side routing with lazy loading |
| Tailwind CSS | Utility-first, consistent spacing/colors |
| shadcn/ui | Accessible component primitives (built on Radix) |
| ELK.js | Auto-layout algorithm for React Flow large graphs |
| Playwright | E2E browser testing — full user flow coverage |

### Infrastructure
| Technology | Why |
|---|---|
| PostgreSQL 16 | JSONB support, `cidr`/`inet`/`macaddr` native types, full-text search |
| Docker + Docker Compose | Reproducible on-prem deployment |
| Nginx | Reverse proxy — routes `/api` to backend, `/` to frontend |

---

## Directory Structure

```
datacenter-manager/
├── CLAUDE.md                        ← you are here
├── .env.example                     ← all required env vars with placeholders
├── docker-compose.yml               ← production stack
├── docker-compose.dev.yml           ← dev overrides (hot reload, exposed ports)
├── backup/
│   ├── pg_backup.sh                 ← pg_dump script (run via cron or Docker scheduled task)
│   └── README.md                    ← backup/restore procedure documentation
│
├── backend/
│   ├── main.py                      ← FastAPI app factory + lifespan
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/
│   │   └── versions/
│   └── app/
│       ├── api/
│       │   └── v1/
│       │       ├── router.py        ← aggregates all endpoint routers
│       │       └── endpoints/       ← one file per resource group
│       │           ├── auth.py
│       │           ├── datacenters.py
│       │           ├── rooms.py
│       │           ├── racks.py
│       │           ├── devices.py
│       │           ├── licenses.py
│       │           ├── interfaces.py
│       │           ├── links.py
│       │           ├── vlans.py
│       │           ├── ip_networks.py
│       │           ├── ip_addresses.py
│       │           ├── san_fabrics.py
│       │           ├── virt_clusters.py
│       │           ├── virt_hosts.py
│       │           ├── virt_vms.py
│       │           ├── datastores.py
│       │           ├── integrations.py
│       │           ├── topology.py
│       │           ├── dashboard.py
│       │           ├── alerts.py
│       │           ├── search.py
│       │           └── audit.py
│       ├── core/
│       │   ├── config.py            ← Pydantic Settings (reads .env)
│       │   ├── database.py          ← async engine, session, get_db dependency
│       │   ├── security.py          ← JWT, bcrypt, token dependencies
│       │   ├── crypto.py            ← Fernet encrypt/decrypt for credentials
│       │   ├── exceptions.py        ← custom HTTPException subclasses
│       │   └── pagination.py        ← PageParams dependency + Page[T] response
│       ├── models/                  ← SQLAlchemy ORM models (one file per table)
│       ├── schemas/                 ← Pydantic schemas (Create / Update / Read per entity)
│       ├── crud/                    ← DB operations (base class + one subclass per model)
│       ├── services/
│       │   ├── xclarity.py
│       │   ├── snmp.py
│       │   ├── ssh_collector.py
│       │   ├── vcenter.py
│       │   ├── scvmm.py
│       │   ├── proxmox.py
│       │   ├── xenserver.py
│       │   ├── sync_engine.py       ← shared upsert logic, diff detection, audit writing
│       │   └── topology.py          ← networkx graph, shortest path, hop count
│       └── tasks/
│           ├── scheduler.py         ← APScheduler setup
│           └── sync_jobs.py         ← one job function per integration type
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── package.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                     ← Axios instance + one hook file per resource
│       ├── components/
│       │   ├── common/              ← shared: buttons, modals, tables, badges, forms
│       │   ├── layout/              ← sidebar, topbar, breadcrumbs
│       │   ├── racks/               ← rack elevation U-slot grid component
│       │   ├── devices/             ← device cards, detail panels, type icons
│       │   ├── network/             ← port diagrams, VLAN tables, IP tables
│       │   ├── virtual/             ← VM list, host tree, cluster cards
│       │   └── topology/            ← React Flow canvas + custom nodes/edges
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── DataCenters.tsx
│       │   ├── Rooms.tsx
│       │   ├── Racks.tsx
│       │   ├── Devices.tsx
│       │   ├── DeviceDetail.tsx     ← tabbed detail: Overview|Interfaces|Connections|VMs|Power|Licenses|Audit
│       │   ├── NetworkConnections.tsx
│       │   ├── VLANs.tsx
│       │   ├── IPSpace.tsx
│       │   ├── SANFabrics.tsx
│       │   ├── Virtual.tsx
│       │   ├── Licenses.tsx
│       │   ├── Integrations.tsx
│       │   ├── IntegrationDetail.tsx ← sync history, errors, manual trigger
│       │   ├── Alerts.tsx           ← EOL warnings, expiring licenses, capacity alerts
│       │   ├── AuditLog.tsx
│       │   ├── UserManagement.tsx   ← admin only: create/edit users, assign roles
│       │   └── Settings.tsx         ← SMTP config, sync defaults, retention policies
│       ├── store/                   ← Zustand slices (authStore, uiStore)
│       ├── types/                   ← TypeScript interfaces mirroring API schemas
│       └── utils/
│
└── nginx/
    └── nginx.conf
```

---

## Common Commands

### Backend

```bash
# Dev server (from backend/)
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run with Docker
docker compose -f docker-compose.dev.yml up backend

# Database migrations — always run as a separate step BEFORE starting the app
alembic revision --autogenerate -m "describe change"
alembic upgrade head
alembic downgrade -1

# Run migrations via Docker (production upgrade procedure)
docker compose run --rm backend alembic upgrade head
docker compose up -d

# Run tests
pytest
pytest tests/api/test_devices.py -v
pytest --cov=app --cov-report=term-missing

# Install dependencies
pip install -r requirements.txt
```

### Frontend

```bash
# Dev server (from frontend/)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint
```

### Docker (full stack)

```bash
# Start everything (dev)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose up -d

# Rebuild after dependency changes
docker compose build backend
docker compose build frontend

# Database shell
docker compose exec postgres psql -U postgres -d datacenter

# View logs
docker compose logs -f backend
```

### Backup & Restore

```bash
# Manual database backup
docker compose exec postgres pg_dump -U $POSTGRES_USER datacenter | gzip > backup/datacenter_$(date +%Y%m%d_%H%M%S).sql.gz

# Restore from backup
gunzip -c backup/datacenter_TIMESTAMP.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER -d datacenter

# Run the automated backup script (wraps pg_dump with retention logic)
bash backup/pg_backup.sh
```

---

## Architecture Decisions

### Database
- **UUID primary keys** on all tables — avoids ID leakage, safe for future federation
- **PostgreSQL native types**: `inet`, `cidr`, `macaddr` for network fields — enables IP containment queries
- **`jsonb` for `platform_data`** on `virtualization_hosts` and `virtual_machines` — stores platform-specific attributes (VMware MOREF, Proxmox VMID, Hyper-V generation, etc.) without schema sprawl. Common fields (name, status, vcpu, ram) stay as real columns.
- **`jsonb` for `custom_fields`** on `devices` — handles vendor-specific attributes without migrations
- **`jsonb` for `credentials_enc`** on `integrations` — credential structure varies per integration type; always validated against a per-type Pydantic model before encrypting and saving
- **Separate extension tables** (`device_servers`, `device_network`, `device_pdu`) over single-table inheritance — avoids nullable columns for irrelevant fields; joined only when needed
- **`last_seen_at` timestamp on `devices`** — set to `now()` on every successful sync pass. Enables staleness detection ("active but not seen in 7 days") independent of the `status` field.
- **`power_readings` time-series table** — (`device_id`, `recorded_at`, `watts`) — populated by xClarity and SNMP PDU polling. Supports trending and capacity planning. Retained for 90 days by default.
- **`alerts` table** — persists actionable alerts (EOL approaching, license expiring, power capacity ≥ 80%, sync failure). Each row has: `entity_type`, `entity_id`, `alert_type`, `severity`, `message`, `acknowledged_at`, `created_at`. Alerts are upserted (not duplicated) on each sync pass.
- **`token_revocations` table** — (`jti`, `expires_at`) — lightweight denylist for invalidated JWTs. Checked on every authenticated request; rows are purged after `expires_at` passes.
- **Soft-delete default filter** — `devices.status = 'inactive'` is the tombstone state. All list queries must exclude inactive records by default. Use a SQLAlchemy `with_loader_criteria` or a base query helper that always appends `WHERE status != 'inactive'` — never rely on callers to remember.
- **Indexes**: `devices.serial_number`, `devices.status`, `devices.last_seen_at`, `ip_addresses.address`, `virtual_machines.platform_vm_id`, `audit_logs.(entity_type, entity_id)`, `audit_logs.timestamp`, `alerts.(entity_type, entity_id)`, `alerts.acknowledged_at`, `power_readings.(device_id, recorded_at)`, `token_revocations.jti`

### Security
- **Fernet symmetric encryption** for all credentials (SSH passwords/keys, integration passwords, license keys). Encryption key loaded from `FERNET_KEY` env var — never hardcoded
- **Encrypted fields are never returned in API responses** — Pydantic `Read` schemas exclude all `*_enc` fields
- **JWT access + refresh tokens** — access token short-lived (15 min), refresh token longer (7 days), stored in `httpOnly` cookie on frontend
- **Refresh token rotation** — every use of a refresh token issues a new refresh token and immediately invalidates the old one. A stolen refresh token can only be used once before it is detected.
- **Token revocation** — on logout, admin-forced session termination, or password change, the token's `jti` (JWT ID) is written to the `token_revocations` table. Every authenticated request checks this table. Rows are purged after expiry.
- **bcrypt** for user password hashing
- **Auth event audit logging** — the following events are written to `audit_logs` in addition to CRUD changes: successful login (with source IP), failed login attempt, logout, token refresh, role change, password change. These are essential for forensics.
- **Forced password change on first login** — the `INITIAL_ADMIN_PASSWORD` bootstrap account is flagged `must_change_password = true`. The API returns `403` with `{"reason": "password_change_required"}` on every request until the password is changed.
- **TLS termination at Nginx** — all traffic must be HTTPS in production. Nginx terminates TLS (self-signed or internal CA cert). HTTP → HTTPS redirect must be enforced. Never deploy with plain HTTP.
- **Security headers in Nginx** — every response must include: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy` (restrictive — no inline scripts), `Referrer-Policy: no-referrer`.
- **Rate limiting on auth endpoints** — `POST /auth/login` and `POST /auth/refresh` are rate-limited at the Nginx level (e.g., 10 req/min per IP) to prevent brute-force attacks. This is a Phase 4 requirement, not a hardening afterthought.
- **Least-privilege DB user** — the application connects as a dedicated PostgreSQL role (not superuser) with `SELECT/INSERT/UPDATE/DELETE` on its own schema only. The role is defined in `docker-compose.yml` init SQL.
- No external auth dependency — self-contained JWT, suitable for air-gapped on-prem

### Background Sync
- **APScheduler** (in-process, not Celery) — no Redis/message broker needed at datacenter scale (hundreds to low thousands of devices). If scale demands it, swap to Celery later without changing service logic.
- Sync intervals configured per integration in the `integrations` table — no code change to adjust frequency
- `sync_engine.py` handles all upsert logic, diff detection, and audit log writing — integration services only fetch and transform data
- Manual sync always available via `POST /integrations/{id}/sync`

### Topology
- **networkx** graph built from `network_links` table
- Shortest path = `networkx.shortest_path` for hop-count tracing between any two devices
- React Flow topology views fetch from `/topology/*` endpoints that return nodes + edges ready to render — no graph logic on the frontend
- **Graph cache** — the networkx graph is expensive to rebuild for large datacenters. `topology.py` maintains a module-level cache: a built graph + a `dirty` boolean flag. The flag is set to `True` whenever any row in `network_links` is created, updated, or deleted. On the next topology request, if dirty, the graph is rebuilt and the flag is cleared. Cache is protected with `asyncio.Lock` to prevent concurrent rebuilds. Since Redis is not in the stack, this is an in-process cache — each worker process maintains its own copy. This is acceptable because topology writes are infrequent.

### API Design
- All routes under `/api/v1/`
- Pagination: `?page=1&size=50` on all list endpoints
- Filtering: query params per field (e.g. `?status=active&device_type=server`)
- Sorting: `?sort=name&order=asc`
- Standard response envelope only for lists (`items`, `total`, `page`, `size`) — single-item responses return the object directly
- `GET /search?q=` — PostgreSQL `ILIKE` across device names, serial numbers, IPs, VM names, hostnames

---

## Coding Conventions

### Backend
- **Async everywhere** — all route handlers, CRUD functions, and service calls must be `async def`
- **One model file per table** — `app/models/device.py`, `app/models/rack.py`, etc.
- **Three schemas per entity** — `DeviceCreate`, `DeviceUpdate` (all optional fields), `DeviceRead`
- `DeviceRead` must **never include** `*_enc`, `*_password*`, `*_key*` fields
- **CRUD layer is DB-only** — no business logic in CRUD; business logic lives in services or endpoint handlers
- **Services are stateless** — no instance variables; accept session as parameter
- Use `Annotated` types for FastAPI dependencies: `CurrentUser = Annotated[User, Depends(get_current_user)]`
- All integration services must be **interruptible** — check a cancellation flag or use timeouts; never block indefinitely
- Return `409 Conflict` for duplicate unique fields (serial number, IP address, VLAN ID)
- Return `404` with a clear message identifying what was not found

### Frontend
- **Co-locate API hooks with pages** — `src/api/devices.ts` exports `useDevices()`, `useDevice(id)`, `useCreateDevice()`, etc.
- **TypeScript strict mode** — `"strict": true` in tsconfig; no `any` without a comment explaining why
- All API response types defined in `src/types/` — generated or manually maintained to match backend schemas
- **TanStack Query for all server state** — no `useState` + `useEffect` for data fetching
- **Zustand only for UI state** — panel open/closed, selected node in topology, sidebar collapse
- Page components are thin — extract logic into hooks, extract UI into components
- React Flow nodes and edges are defined in `src/components/topology/` — one file per node type
- Use `shadcn/ui` components as the base — do not build form inputs, dialogs, or dropdowns from scratch

### General
- **No magic numbers** — define enums or constants; device types, link types, platforms are always enums
- **Commit messages**: `type(scope): description` — e.g. `feat(devices): add rack elevation endpoint`
- Do not commit `.env` files — only `.env.example` is committed

---

## What NOT To Do

- **No UPS management** — UPS devices are out of scope. Do not add `device_ups` table, UPS device type, or any UPS-related fields.
- **No multi-tenancy** — single organization, single datacenter estate. No tenant isolation logic.
- **No cloud integrations** — AWS, Azure, GCP are out of scope. On-premise only.
- **Do not build integrations before the CRUD API is complete** — integrations depend on stable device/VM models. Build Phase 1–7 first.
- **Do not expose encrypted fields** — `*_enc`, `*_password*`, `*_key*` columns must be excluded from every Pydantic `Read` schema, no exceptions.
- **Do not add Celery/Redis** unless explicitly requested — APScheduler is the chosen scheduler.
- **Do not use synchronous SQLAlchemy sessions** — all DB access must use the async session.
- **Do not add frontend features before the corresponding API endpoint exists** — mock data is acceptable during development but must be replaced before marking a feature done.
- **Do not auto-delete devices on sync** — if a device disappears from an integration source, set `status = inactive`, never hard-delete. Data loss in a DCIM tool is unacceptable.
- **Do not skip the audit log** — every create, update, and delete (including sync-driven changes) must write an `audit_logs` entry with a JSON diff.
- **Do not run Alembic inside the application startup** — migrations must run as a separate, explicit step before the app starts. Running `alembic upgrade head` inside `lifespan` or `on_startup` causes race conditions with multiple replicas and masks migration failures behind startup crashes. The correct pattern is `docker compose run --rm backend alembic upgrade head` followed by `docker compose up -d`.
- **Do not deploy without TLS** — plain HTTP is never acceptable in production, even on an internal network. Nginx must terminate TLS. Do not skip the self-signed or internal CA certificate setup.

---

## Phased Implementation Plan

### Phase 1 — Project Scaffolding & Environment
Docker Compose, Python project setup, Vite + React setup, Nginx config, environment variables.
- All Docker volumes must be **explicitly named** (never anonymous) to prevent accidental `docker volume prune` data loss
- Docker Compose must include **`healthcheck` directives** for the PostgreSQL service so the backend container waits for the DB to be ready before starting
- Nginx config must include TLS configuration stubs (self-signed cert for dev; internal CA cert path for prod) and all required security headers (`HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `CSP`, `Referrer-Policy`)
- Include a `backup/pg_backup.sh` script and accompanying `backup/README.md` documenting the restore procedure
- Create the restricted PostgreSQL application role in a compose init SQL script — the app must never connect as a superuser

### Phase 2 — Database Models
All SQLAlchemy models for physical, network, virtual, integration, and audit layers. Alembic initial migration with indexes and constraints.
- Include `last_seen_at` timestamp column on `devices`
- Include `power_readings` time-series table (`device_id`, `recorded_at`, `watts`)
- Include `alerts` table (`entity_type`, `entity_id`, `alert_type`, `severity`, `message`, `acknowledged_at`, `created_at`)
- Include `token_revocations` table (`jti`, `expires_at`) for JWT denylist
- All indexes listed in the Database architecture section must be created in the initial migration

### Phase 3 — Backend Core Infrastructure
Config, async database session, JWT security, Fernet crypto, pagination, exception handling, Pydantic schemas, base CRUD class.

### Phase 4 — Auth Endpoints
Login, logout, token refresh, current user. Role-based dependencies (admin / operator / read_only).
- **Refresh token rotation**: on `POST /auth/refresh`, issue a new refresh token, invalidate the old one via `token_revocations`, and return both new tokens
- **Token revocation**: `POST /auth/logout` writes the current access token's `jti` to `token_revocations`. Every `get_current_user` dependency checks the denylist.
- **Auth event audit logging**: write an `audit_logs` entry for every login (success + failure with source IP), logout, token refresh, role change, and password change
- **Forced password change**: bootstrap admin account has `must_change_password = true`; all endpoints except `POST /auth/change-password` return `403 {"reason": "password_change_required"}` until resolved
- **Rate limiting on auth endpoints**: configure Nginx `limit_req_zone` for `POST /auth/login` and `POST /auth/refresh` — max 10 req/min per IP. This must be in place before any other API is built.

### Phase 5 — Physical Layer API
Full CRUD for datacenters, rooms, racks, devices (base + extension tables), licenses. Power summary and expiry alert endpoints.

### Phase 6 — Network Layer API
Full CRUD for interfaces, links, LAG groups, VLANs, IP networks, IP addresses, SAN fabrics. IP scan endpoint. Hop-path trace endpoint.

### Phase 7 — Virtual Layer API
Full CRUD for virtualization clusters, hosts, VMs, datastores.

### Phase 8 — Integration Services
xClarity, SNMP, SSH, vCenter, SCVMM, Proxmox, XenServer sync services. APScheduler. Sync engine (upsert, diff, audit). Integration CRUD + manual trigger endpoints.

### Phase 9 — Topology, Dashboard & Alerts Endpoints
Physical topology graph, network topology graph, rack elevation data, datacenter floor plan data, dashboard summary/power/capacity/alerts, global search.
- **Alerts endpoints**: `GET /alerts` (paginated, filterable by severity/type/acknowledged), `POST /alerts/{id}/acknowledge`, `GET /alerts/summary` (counts by severity for dashboard widget)
- Alerts are generated during sync passes by `sync_engine.py` — e.g., device EOL within 90 days, license expiring within 30 days, power reading ≥ 80% capacity. They are upserted, not duplicated.

### Phase 10 — Frontend Foundation
Vite config, routing, Axios + TanStack Query setup, Zustand stores, TypeScript types, layout shell, auth pages.

### Phase 11 — Frontend Pages
Physical pages (datacenter → room → rack → device detail). Network pages (VLANs, subnets, IP tables). Virtual pages (clusters, hosts, VMs). Integrations management. Dashboard. Audit log viewer.

**Required pages and their scope:**
- **DeviceDetail.tsx** — tabbed layout: Overview (specs, status, location) | Interfaces (ports, MACs, IPs) | Connections (linked devices, hop path) | VMs (if hypervisor host) | Power (watt history chart) | Licenses (attached licenses, expiry) | Audit Trail (change history for this device)
- **NetworkConnections.tsx** — physical and logical links between devices; replaces the generic `Network.tsx`
- **VLANs.tsx**, **SANFabrics.tsx** — split out of the old `Network.tsx`; network sub-pages must be navigable via tabs or sub-nav
- **IntegrationDetail.tsx** — sync history (last 20 runs), last sync timestamp, sync duration, error log, manual sync trigger button with live status feedback
- **Alerts.tsx** — filterable list of active alerts by severity (critical/warning/info); acknowledge button per row; alert type filter; link to the affected entity
- **UserManagement.tsx** — admin-only page: list users, create user, edit role, reset password, deactivate account
- **Settings.tsx** — app-wide configuration: SMTP relay settings (for future email alerts), default sync intervals, power reading retention period, app version/health info

### Phase 12 — React Flow Topology Views
Physical topology canvas, network topology canvas, datacenter floor plan view, rack elevation component, custom node/edge types, ELK.js auto-layout, side panel on node click.

### Phase 13 — Testing
pytest + pytest-asyncio for backend (CRUD, API, services). Vitest + React Testing Library for frontend. MSW for API mocking. Playwright for E2E browser flows.

**Backend — critical test coverage:**
- **Sync idempotency**: running the same sync payload twice produces identical DB state and zero new audit log entries on the second pass
- **Inactive-not-delete rule**: device absent from sync source → `status=inactive`, record still present, one audit log entry written
- **Diff accuracy**: field changed → audit log with before/after diff; field unchanged → no audit entry (no false positives)
- **RBAC matrix**: for every mutating endpoint, assert that `read_only` receives `403` and unauthenticated receives `401`
- **Encrypted field exposure**: automated scan of all API response bodies asserting no key or value contains `_enc`, `password`, `_key`, or `secret`
- **JWT rotation and revocation**: refresh token used → new tokens issued, old refresh token rejected on reuse; logout → access token rejected on subsequent request
- **Token revocation denylist**: `jti` inserted on logout is checked and blocks subsequent requests
- **IP/CIDR edge cases**: `/32` hosts, network address, broadcast address in containment and scan queries
- **Topology edge cases**: disconnected graph, isolated single node, graph with cycle, multiple equal-cost paths
- **Pagination edge cases**: page beyond last page returns empty list (not 404), invalid `size` values return `400`
- **Audit log completeness**: a meta-test that calls every mutating endpoint and asserts at least one `audit_logs` row was created

**Test database**: all backend tests must run against a **real PostgreSQL instance** (use `pytest-docker` or a dedicated `postgres` service in `docker-compose.dev.yml`). SQLite is explicitly forbidden — `inet`/`cidr`/`macaddr` column types will not work.

**Test data**: use `factory-boy` (or equivalent) for generating relational test fixtures. Hand-crafting complex nested objects in every test is unsustainable.

**Frontend — E2E with Playwright:**
- Full login → navigate → create device → verify in list → delete flow
- Token refresh mid-session (simulate access token expiry)
- Role-based navigation: read_only user cannot see admin-only pages or action buttons
- Topology canvas: node click opens side panel with correct device name

### Phase 14 — Production Hardening
Structured JSON logging (stdout, parseable by log aggregators), `GET /health` and `GET /readiness` endpoints, `pg_hba.conf` restriction to app container IP only, Docker Compose resource limits (`mem_limit`, `cpus`) for backend and worker containers, Docker logging driver config (`json-file` with `max-size` and `max-file` to prevent disk exhaustion), Prometheus-compatible `GET /metrics` endpoint (`prometheus-fastapi-instrumentator`), power readings retention cleanup job (purge rows older than 90 days), token revocations cleanup job (purge expired rows).

Note: Nginx rate limiting on auth endpoints and TLS configuration are **Phase 4** requirements, not Phase 14. Health check directives in Docker Compose are **Phase 1** requirements. Alembic migrations are **never** run on app startup.

---

## Environment Variables Reference

```env
# Database — use the restricted app role, not the postgres superuser
DATABASE_URL=postgresql+asyncpg://dcm_app:password@postgres:5432/datacenter
POSTGRES_USER=postgres          # superuser — used only for init and migrations
POSTGRES_PASSWORD=              # superuser password
POSTGRES_DB=datacenter
DCM_DB_USER=dcm_app             # restricted app role (SELECT/INSERT/UPDATE/DELETE only)
DCM_DB_PASSWORD=                # app role password

# Security
SECRET_KEY=                    # 64+ random hex chars — used for JWT signing
FERNET_KEY=                    # Fernet.generate_key() output — used for credential encryption
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# TLS (production)
TLS_CERT_PATH=/etc/nginx/certs/server.crt
TLS_KEY_PATH=/etc/nginx/certs/server.key

# App
CORS_ORIGINS=http://localhost:5173,http://localhost:80
ENVIRONMENT=development        # development | production
LOG_LEVEL=INFO

# Retention
POWER_READINGS_RETENTION_DAYS=90   # power_readings rows older than this are purged

# Initial admin user (created on first startup if no users exist)
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=        # temporary — app forces password change on first login
```
