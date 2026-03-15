# Installation Guide

Follow these steps in order on a fresh clone of the repository.
There are two paths: **Development** (for testing/evaluation on a local machine)
and **Production** (for a real server deployment).

---

## Prerequisites

Install these on the machine that will run the app:

| Tool | How to get it |
|------|--------------|
| **Docker Engine** ≥ 24 | https://docs.docker.com/engine/install/ |
| **Docker Compose** v2 | Included with Docker Desktop; standalone: https://docs.docker.com/compose/install/ |
| **Git** | https://git-scm.com/ |
| **OpenSSL** | Pre-installed on Linux/macOS; Windows: Git Bash includes it |

Verify before continuing:

```bash
docker --version        # Docker version 24.x or later
docker compose version  # Docker Compose version v2.x or later
openssl version         # any version
```

---

## Step 1 — Clone the repository

```bash
git clone <your-repo-url> datacenter-manager
cd datacenter-manager
```

---

## Step 2 — Create the `.env` file

```bash
cp .env.example .env
```

Now open `.env` in any text editor and fill in the values below.
**Leave everything else at its default.**

### 2a — Generate a SECRET_KEY

This signs JWT tokens. Must be at least 64 random hex characters.

```bash
# Paste the output into .env as SECRET_KEY=<output>
python3 -c "import secrets; print(secrets.token_hex(64))"
```

If Python is not installed locally, use Docker:

```bash
docker run --rm python:3.12-slim python -c "import secrets; print(secrets.token_hex(64))"
```

### 2b — Generate a FERNET_KEY

This encrypts credentials (SSH passwords, integration API keys) at rest.

```bash
# Paste the output into .env as FERNET_KEY=<output>
docker run --rm python:3.12-slim python \
  -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2c — Set passwords

Set these four values in `.env` to something strong and unique:

```
POSTGRES_PASSWORD=        # PostgreSQL superuser password
DCM_DB_PASSWORD=          # Restricted app DB role password (different from above)
INITIAL_ADMIN_PASSWORD=   # Temporary password for first login (you will be forced to change it)
```

### 2d — Verify your `.env` looks like this

```env
DATABASE_URL=postgresql+asyncpg://dcm_app:YOUR_DCM_DB_PASSWORD@postgres:5432/datacenter
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
DCM_DB_PASSWORD=YOUR_DCM_DB_PASSWORD
SECRET_KEY=abc123...  (128 hex chars)
FERNET_KEY=xYz...=   (44 base64 chars ending with =)
INITIAL_ADMIN_PASSWORD=SomeTemporaryPassword!
ENVIRONMENT=development   # keep this for now
```

> **Important:** `DATABASE_URL` must contain the same password you put in `DCM_DB_PASSWORD`.
> They must match exactly.

---

## Step 3 — Create the TLS certificates directory

Even in development mode the nginx container expects the `nginx/certs/` directory
to exist (the dev config does not use the certs, but the volume mount still
requires the directory).

```bash
mkdir -p nginx/certs
```

**Development only — skip to Step 4.** Nginx in dev mode uses plain HTTP.

**Production only — generate a self-signed cert:**

```bash
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout nginx/certs/server.key \
  -out nginx/certs/server.crt \
  -subj "/CN=datacenter-manager"
```

For a real deployment with an internal CA, replace the two files above with
your CA-issued certificate and private key — same filenames.

---

## Step 4 — Build the Docker images

This downloads all dependencies and builds the backend and frontend.
This step takes 3–10 minutes the first time.

**Development:**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
```

**Production:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

---

## Step 5 — Start the database

The backend needs PostgreSQL to be running before it can run migrations.
Start only the database container first:

```bash
docker compose up -d postgres
```

Wait until it reports healthy:

```bash
docker compose ps postgres
# STATUS column must show: healthy
# If it shows "starting", wait a few seconds and check again.
```

---

## Step 6 — Run database migrations

This creates all tables, indexes, and constraints.
**This must be done before starting the backend for the first time,
and again after every upgrade that includes schema changes.**

```bash
docker compose run --rm backend alembic upgrade head
```

Expected output ends with something like:

```
INFO  [alembic.runtime.migration] Running upgrade  -> abc123def456, initial schema
```

If you see errors here, the most common cause is a wrong password in `DATABASE_URL`.
Double-check that `DCM_DB_PASSWORD` in `.env` matches the password in `DATABASE_URL`.

---

## Step 7 — Start the full stack

**Development** (hot-reload backend, Vite HMR frontend, plain HTTP):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

**Production** (built images, HTTPS, resource limits):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Step 8 — Verify everything started correctly

```bash
# All four containers (postgres, backend, frontend, nginx) must be Up
docker compose ps

# Check backend logs for startup errors
docker compose logs backend --tail=30
```

**Development — test the health endpoint:**

```bash
curl http://localhost/health
# Expected: {"status":"ok"}

curl http://localhost/readiness
# Expected: {"status":"ready"}
```

**Production — test over HTTPS:**

```bash
curl -k https://localhost/health
# -k skips certificate verification for self-signed certs
```

---

## Step 9 — Open the app and change the admin password

1. Open your browser and go to:
   - Development: `http://localhost`
   - Production: `https://<server-ip>`

2. Log in with:
   - **Username:** `admin` (or the value of `INITIAL_ADMIN_USERNAME` in `.env`)
   - **Password:** the value of `INITIAL_ADMIN_PASSWORD` you set in Step 2

3. You will be immediately redirected to a **Change Password** screen.
   The app will refuse all other actions until the password is changed.
   Set a strong password and save it.

4. After changing the password, go back to `.env` and clear the bootstrap password:

   ```env
   INITIAL_ADMIN_PASSWORD=
   ```

   Then restart the backend to clear it from memory:

   ```bash
   docker compose up -d backend
   ```

---

## Step 10 — Confirm the app is working

- Navigate to **Dashboard** — it should show zeros (no data yet, which is correct).
- Navigate to **Datacenters** → click **New Datacenter** → create a test entry.
- If you can create and see the entry, the database, backend, and frontend are
  all wired up correctly.

---

## What to do next

### Add your infrastructure

Start with the physical layer (top-down):
1. **Datacenters** → create your datacenter(s)
2. **Rooms** → add server rooms within each datacenter
3. **Racks** → add racks within each room
4. **Devices** → add servers, switches, PDUs, etc. to racks

Then build up the network layer (VLANs → IP Space → Connections) and connect
integrations (xClarity, vCenter, Proxmox, etc.) to auto-populate device data.

### Set up automatic backups

```bash
# Edit your crontab (as the user that owns the docker socket)
crontab -e

# Add this line — runs a backup daily at 02:00
0 2 * * * /path/to/datacenter-manager/backup/pg_backup.sh >> /var/log/dcm-backup.log 2>&1
```

Backups are written to `backup/data/` and pruned after 30 days by default.
See [backup/README.md](backup/README.md) for restore instructions.

### Create additional users

Go to **User Management** (visible only to admin accounts) to create operator
and read-only accounts for your team.

### Configure integrations

Go to **Integrations** → **New Integration** to connect your monitoring sources.
Each integration type has its own credential fields. Credentials are encrypted
before being stored — they are never visible in the UI or API after saving.

---

## Troubleshooting

### Backend won't start — "SECRET_KEY is not set"

Open `.env` and make sure `SECRET_KEY` has a value (not empty, not the placeholder text).

### Backend won't start — "FERNET_KEY is not valid"

The Fernet key must be exactly 44 characters of URL-safe base64 and end with `=`.
Re-run the generation command from Step 2b.

### Database migration fails — "password authentication failed"

The password in `DATABASE_URL` does not match `DCM_DB_PASSWORD`. They must be identical.

### Database migration fails — "role dcm_app does not exist"

The PostgreSQL init script only runs on the very first startup (when the data
volume is empty). If you recreated the postgres container without also deleting
the volume, the role was never created. Fix:

```bash
# Option A — delete the volume and start fresh (loses all data)
docker compose down -v
docker compose up -d postgres
# Then re-run Step 6

# Option B — create the role manually
docker compose exec postgres psql -U postgres -d datacenter -c \
  "CREATE ROLE dcm_app WITH LOGIN PASSWORD 'YOUR_DCM_DB_PASSWORD';"
docker compose exec postgres psql -U postgres -d datacenter -c \
  "GRANT CONNECT ON DATABASE datacenter TO dcm_app;"
docker compose exec postgres psql -U postgres -d datacenter -c \
  "GRANT USAGE ON SCHEMA public TO dcm_app;"
docker compose exec postgres psql -U postgres -d datacenter -c \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dcm_app;"
docker compose exec postgres psql -U postgres -d datacenter -c \
  "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dcm_app;"
```

### Frontend shows a blank page or 502 Bad Gateway

The frontend container may still be building. Check:

```bash
docker compose logs frontend --tail=20
docker compose logs nginx --tail=20
```

Wait 30 seconds and refresh. The frontend build takes longer on first start.

### Can't reach the app on production server from another machine

Check that ports 80 and 443 are open in the server's firewall:

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# RHEL/CentOS
sudo firewall-cmd --permanent --add-service=http --add-service=https
sudo firewall-cmd --reload
```

### Browser certificate warning on HTTPS

This is expected with a self-signed certificate. Either:
- Click **Advanced → Proceed** (acceptable for internal tools)
- Add `nginx/certs/server.crt` to your OS/browser trust store to suppress the warning
- Replace with a cert signed by your internal CA

---

## Useful commands

```bash
# View logs
docker compose logs -f backend       # backend logs (follow)
docker compose logs -f nginx         # nginx access logs

# Restart a single service (e.g. after changing .env)
docker compose up -d backend         # NOTE: use up -d, not restart

# Stop everything
docker compose down

# Stop and delete all data (irreversible)
docker compose down -v

# Open a database shell
docker compose exec postgres psql -U postgres -d datacenter

# Run a one-off Django-style shell (Python REPL with app context is not built in,
# but you can run raw SQL via psql above or use the API docs at /docs)
```

---

## File reference

| File | Purpose |
|------|---------|
| `.env` | All secrets and configuration — never commit this |
| `.env.example` | Template — safe to commit, contains no secrets |
| `docker-compose.yml` | Base stack definition |
| `docker-compose.dev.yml` | Development overrides (hot-reload, HTTP, exposed ports) |
| `docker-compose.prod.yml` | Production overrides (resource limits, pg_hba, metrics) |
| `nginx/nginx.conf` | Production nginx (HTTPS, security headers, rate limiting) |
| `nginx/nginx.dev.conf` | Development nginx (plain HTTP, HMR support) |
| `nginx/certs/` | TLS certificate and key — never commit, git-ignored |
| `postgres/init.sh` | Creates the `dcm_app` restricted role on first DB start |
| `postgres/pg_hba.conf` | Production: restricts DB access to Docker-internal network |
| `backup/pg_backup.sh` | Database backup script (run via cron) |
| `backup/README.md` | Backup and restore procedure |
| `docs/upgrade.md` | Step-by-step upgrade and rollback procedure |
