# Datacenter Manager

An on-premise, full-stack web application for managing physical datacenter
infrastructure. Tracks physical layer (datacenters → rooms → racks → devices),
network layer (connections, VLANs, IP space, SAN), and virtual layer
(VMware vCenter, SCVMM/Hyper-V, Proxmox, XenServer/XCP-ng).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [TLS Certificate Setup](#tls-certificate-setup)
6. [Running in Development](#running-in-development)
7. [Running in Production](#running-in-production)
8. [Database Migrations](#database-migrations)
9. [Initial Admin User](#initial-admin-user)
10. [Backup & Restore](#backup--restore)
11. [Observability](#observability)
12. [Security Notes](#security-notes)
13. [Upgrade Procedure](#upgrade-procedure)

---

## Architecture Overview

```
Browser
  │  HTTPS 443
  ▼
Nginx (reverse proxy + TLS termination)
  ├── /api/*       → FastAPI backend  (Python 3.12, port 8000)
  ├── /metrics     → FastAPI backend  (Prometheus scrape, internal only)
  └── /*           → React SPA        (Vite build, port 80 in container)
                        │
                        ▼
                   PostgreSQL 16
```

**Tech stack summary:**

| Layer      | Technology                                           |
|------------|------------------------------------------------------|
| Backend    | Python 3.12 · FastAPI · SQLAlchemy 2 async · Alembic |
| Frontend   | React 18 · TypeScript · Vite · React Flow · Tailwind |
| Database   | PostgreSQL 16 (native `inet`/`cidr`/`macaddr` types) |
| Scheduler  | APScheduler (in-process, no Redis/Celery needed)     |
| Auth       | JWT access (15 min) + refresh (7 days, rotated)      |
| Encryption | Fernet (credential bundles at rest)                  |
| Proxy      | Nginx with TLS, HSTS, CSP, rate limiting             |

---

## Prerequisites

| Requirement          | Minimum version |
|----------------------|-----------------|
| Docker Engine        | 24.x            |
| Docker Compose CLI   | v2.x            |
| OpenSSL              | any (for TLS cert generation) |
| 2 GB free RAM        |                 |
| 10 GB free disk      |                 |

---

## Quick Start

```bash
# 1. Clone the repository
git clone <your-internal-repo-url> datacenter-manager
cd datacenter-manager

# 2. Create your environment file
cp .env.example .env
# Edit .env — see "Environment Variables" section below

# 3. Generate TLS certificates (self-signed for internal use)
mkdir -p nginx/certs
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out nginx/certs/server.crt \
  -subj "/CN=datacenter-manager"

# 4. Build images
docker compose build

# 5. Run database migrations (BEFORE starting the app)
docker compose run --rm backend alembic upgrade head

# 6. Start the stack
docker compose up -d

# 7. Verify everything is healthy
docker compose ps
curl -k https://localhost/health      # {"status": "ok"}
curl -k https://localhost/readiness   # {"status": "ready"}
```

Open `https://<server-ip>/` in your browser and log in with the admin
credentials you set in `.env`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

### Required

| Variable              | Description                                              |
|-----------------------|----------------------------------------------------------|
| `POSTGRES_PASSWORD`   | Superuser password for PostgreSQL                        |
| `DCM_DB_PASSWORD`     | Password for the restricted `dcm_app` application role   |
| `SECRET_KEY`          | 64+ hex chars for JWT signing                            |
| `FERNET_KEY`          | 44-char Fernet key for credential encryption at rest     |
| `INITIAL_ADMIN_PASSWORD` | Temporary password for the bootstrap admin account   |

**Generating secrets:**

```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_hex(64))"

# FERNET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Optional (with defaults)

| Variable                        | Default          | Description                       |
|---------------------------------|------------------|-----------------------------------|
| `POSTGRES_USER`                 | `postgres`       | PostgreSQL superuser name         |
| `POSTGRES_DB`                   | `datacenter`     | Database name                     |
| `DCM_DB_USER`                   | `dcm_app`        | Application DB role name          |
| `INITIAL_ADMIN_USERNAME`        | `admin`          | Bootstrap admin username          |
| `ACCESS_TOKEN_EXPIRE_MINUTES`   | `15`             | JWT access token lifetime         |
| `REFRESH_TOKEN_EXPIRE_DAYS`     | `7`              | JWT refresh token lifetime        |
| `CORS_ORIGINS`                  | `http://localhost:5173` | Comma-separated allowed origins |
| `ENVIRONMENT`                   | `development`    | `development` or `production`     |
| `LOG_LEVEL`                     | `WARNING`        | Python logging level              |
| `POWER_READINGS_RETENTION_DAYS` | `90`             | Days to keep power_readings rows  |

---

## TLS Certificate Setup

### Self-signed (development / internal use)

```bash
mkdir -p nginx/certs
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out nginx/certs/server.crt \
  -subj "/CN=datacenter-manager"
```

Browsers will show a certificate warning. Add the cert to your OS/browser
trust store to suppress it.

### Internal CA (recommended for production)

If your organisation has an internal Certificate Authority:

```bash
# 1. Generate a private key and CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout nginx/certs/server.key \
  -out nginx/certs/server.csr \
  -subj "/CN=dcm.internal.example.com"

# 2. Submit server.csr to your CA and receive server.crt

# 3. Place server.crt and server.key in nginx/certs/
#    (the nginx.conf references these paths — do not rename them)
```

The files are never committed (`.gitignore` excludes `nginx/certs/`).

---

## Running in Development

```bash
# Start with live-reload (backend) and HMR (frontend)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Watch logs
docker compose logs -f backend

# Access
#   Frontend:  http://localhost:5173  (Vite HMR dev server)
#   Backend:   http://localhost:8000  (direct, bypasses nginx)
#   API docs:  http://localhost:8000/docs
#   Database:  localhost:5432 (postgres user, exposed in dev only)
```

### Running tests

```bash
# Backend — requires the test DB to be running
# Start it:
docker compose -f docker-compose.test.yml up -d

# Run all tests
cd backend
pytest

# With coverage
pytest --cov=app --cov-report=term-missing

# Frontend
cd frontend
npm run test
npm run test:coverage

# E2E (Playwright) — requires the full dev stack to be running
cd frontend
npx playwright test
```

---

## Running in Production

```bash
# Build images
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Run migrations
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm backend alembic upgrade head

# Start the full stack with production hardening
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The production overlay (`docker-compose.prod.yml`) adds:
- `restart: always` (survives Docker daemon restarts)
- CPU and memory limits on all containers
- Restricted `pg_hba.conf` (PostgreSQL accepts connections from Docker-internal
  network only)
- JSON structured logging to stdout
- Prometheus metrics enabled (`ENABLE_METRICS=true`)

---

## Database Migrations

Alembic migrations must **always** run as a separate step before starting the
app. Never run them inside application startup.

```bash
# Apply all pending migrations
docker compose run --rm backend alembic upgrade head

# Check current revision
docker compose run --rm backend alembic current

# Show migration history
docker compose run --rm backend alembic history

# Roll back one migration
docker compose run --rm backend alembic downgrade -1

# Generate a new migration after model changes
docker compose run --rm backend alembic revision --autogenerate -m "describe change"
```

---

## Initial Admin User

On first startup, if `INITIAL_ADMIN_PASSWORD` is set in `.env`, the application
creates an admin account (`admin` by default) with `must_change_password = true`.

**The account is locked until the password is changed.** On first login you will
be redirected to the change-password page. All other API calls return
`403 {"reason": "password_change_required"}` until this is done.

After changing the password, clear `INITIAL_ADMIN_PASSWORD` from `.env` (or set
it to empty) and restart the backend so the value is no longer in memory:

```bash
# Edit .env: set INITIAL_ADMIN_PASSWORD=
docker compose up -d backend
```

---

## Backup & Restore

See [backup/README.md](backup/README.md) for the full procedure.

### Quick reference

```bash
# Manual backup
bash backup/pg_backup.sh

# Schedule automatic daily backups (run as root or the docker user)
crontab -e
# Add:
# 0 2 * * * /opt/datacenter-manager/backup/pg_backup.sh >> /var/log/dcm-backup.log 2>&1
```

Backups are written to `backup/data/` as gzip-compressed SQL dumps and pruned
after `BACKUP_RETENTION_DAYS` (default 30) days.

---

## Observability

### Health probes

| Endpoint      | Purpose          | Expected response             |
|---------------|------------------|-------------------------------|
| `GET /health`    | Liveness probe   | `{"status": "ok"}`            |
| `GET /readiness` | Readiness probe  | `{"status": "ready"}`         |

### Structured logging

In production (`ENVIRONMENT=production`), all backend log records are emitted
as single-line JSON objects to stdout:

```json
{
  "timestamp": "2026-03-15T03:00:00.123456+00:00",
  "level": "INFO",
  "logger": "app.tasks.cleanup_jobs",
  "message": "Cleanup: purged 42 expired token revocation(s)",
  "job": "cleanup:token_revocations",
  "rows_deleted": 42
}
```

Pipe `docker compose logs` output to `jq` for ad-hoc filtering:

```bash
docker compose logs -f backend | jq 'select(.level == "ERROR")'
```

### Prometheus metrics

`GET /metrics` exposes Prometheus-format metrics (HTTP request counts,
latencies, in-flight requests by endpoint). Nginx restricts this endpoint to
internal RFC-1918 addresses only.

Add a scrape job to your Prometheus config:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: datacenter-manager
    scheme: https
    tls_config:
      insecure_skip_verify: true  # or provide your internal CA cert
    static_configs:
      - targets: ["<server-ip>:443"]
    metrics_path: /metrics
```

### Daily cleanup jobs

The scheduler runs three maintenance jobs daily at 03:00–03:30 UTC:

| Job                         | Time (UTC) | Action                                      |
|-----------------------------|------------|---------------------------------------------|
| `cleanup:token_revocations` | 03:00      | Purge expired JWT denylist entries          |
| `cleanup:power_readings`    | 03:15      | Purge power readings older than retention   |
| `cleanup:sync_logs`         | 03:30      | Purge sync logs older than 90 days          |

---

## Security Notes

- **TLS is required in production.** Plain HTTP is never acceptable, even on
  an internal network. Nginx enforces HTTP → HTTPS redirect.
- **Never commit `.env`** — only `.env.example` is version-controlled.
- **Database credentials** are stored in `.env` and never in the application
  code. The application connects as `dcm_app` (not the PostgreSQL superuser).
- **Credential bundles** (SSH passwords, integration API keys) are encrypted
  at rest using Fernet symmetric encryption. The encryption key is the
  `FERNET_KEY` environment variable.
- **API responses** never include `*_enc`, `*_password*`, or `*_key*` fields.
  This is enforced by Pydantic `Read` schemas that exclude those fields.
- **Rate limiting** is enforced by Nginx:
  - Login / refresh: 10 req/min per IP
  - Password change: 5 req/min per IP
  - Search: 30 req/min per IP
  - All other API: 300 req/min per IP
- **JWT tokens**: access tokens expire in 15 minutes, refresh tokens rotate on
  every use. Logout revokes the current access token via a database denylist.
- **PostgreSQL** (in production) accepts connections only from the Docker
  internal network. The host firewall should additionally restrict port 5432
  to the Docker bridge interface.

---

## Upgrade Procedure

See [docs/upgrade.md](docs/upgrade.md) for detailed upgrade and rollback
instructions.

Quick reference:

```bash
git pull
docker compose build backend frontend
docker compose run --rm backend alembic upgrade head   # only if migrations exist
docker compose up -d
```
