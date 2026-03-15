# Upgrade Procedure

This document describes how to upgrade Datacenter Manager to a new version
without data loss.

---

## Prerequisites

- `docker compose` v2.x or later
- Access to the server running the stack
- A current database backup (see [Backup & Restore](#backup--restore-before-upgrading))

---

## Backup & Restore Before Upgrading

**Always take a backup before upgrading.**

```bash
# Run from the project root directory
bash backup/pg_backup.sh
```

Verify the backup file was created:

```bash
ls -lh backup/data/
```

If anything goes wrong during the upgrade, follow the restore procedure in
[backup/README.md](../backup/README.md).

---

## Standard Upgrade (no schema changes)

Use this procedure when the release notes say "no migration required".

```bash
# 1. Pull the latest code
git pull

# 2. Rebuild images with updated code / dependencies
docker compose build backend frontend

# 3. Restart services (zero-downtime rolling restart)
docker compose up -d --no-deps backend frontend nginx
```

The `--no-deps` flag prevents Compose from also restarting postgres, which
would cause a brief connection interruption.

---

## Upgrade with Database Migration

Use this procedure whenever the release notes mention Alembic migrations or
schema changes.

```bash
# 1. Pull the latest code
git pull

# 2. Rebuild the backend image first (migrations use the new image)
docker compose build backend

# 3. Run migrations as a separate, explicit step BEFORE starting the app.
#    This is the only safe ordering — running migrations inside startup causes
#    race conditions when multiple replicas start concurrently.
docker compose run --rm backend alembic upgrade head

# 4. Restart the full stack
docker compose up -d
```

### Verifying the migration

```bash
# Check that alembic reports the correct revision
docker compose run --rm backend alembic current

# Check backend logs for startup errors
docker compose logs --tail=50 backend
```

---

## Production Upgrade (with prod overlay)

If running with the production override file:

```bash
# Rebuild
docker compose -f docker-compose.yml -f docker-compose.prod.yml build backend frontend

# Migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head

# Restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Rollback

If the new version has a critical bug, roll back as follows:

### Code-only rollback (no migration)

```bash
git checkout <previous-tag-or-commit>
docker compose build backend frontend
docker compose up -d --no-deps backend frontend
```

### Rollback with migration downgrade

```bash
# Downgrade the schema one step at a time
docker compose run --rm backend alembic downgrade -1

# Or downgrade to a specific revision
docker compose run --rm backend alembic downgrade <revision>

# Then revert the code
git checkout <previous-tag-or-commit>
docker compose build backend
docker compose up -d
```

### Full rollback from backup

If a migration cannot be reversed cleanly, restore from the pre-upgrade backup:

1. Follow the restore procedure in [backup/README.md](../backup/README.md).
2. Revert the code: `git checkout <previous-tag-or-commit>`
3. Restart: `docker compose up -d`

---

## Updating Environment Variables

When a new release adds environment variables:

1. Copy the new entries from `.env.example` into your `.env` file.
2. Fill in values for any new required variables.
3. Restart the affected services:

```bash
# Environment changes require a full up (not just restart) to re-read .env
docker compose up -d
```

> `docker compose restart` does **not** re-read `.env`. Always use `up -d`.

---

## Dependency Updates Only (no code changes)

When you want to update Python or npm packages without changing application code:

```bash
# Backend
docker compose build --no-cache backend

# Frontend
docker compose build --no-cache frontend

docker compose up -d --no-deps backend frontend
```

---

## Checking the Stack is Healthy

After any upgrade:

```bash
# All containers should be "Up" or "healthy"
docker compose ps

# Backend liveness probe
curl -k https://localhost/health

# Backend readiness probe (confirms DB connectivity)
curl -k https://localhost/readiness

# Review recent logs for errors
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
```

---

## Version History

Maintain a brief summary here as part of each release commit.

| Version | Date       | Notes                                  |
|---------|------------|----------------------------------------|
| 1.0.0   | 2026-03-15 | Initial production release (Phase 1–14) |
