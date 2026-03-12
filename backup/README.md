# Backup & Restore

## Automated backups

Schedule `pg_backup.sh` to run via crontab on the Docker host:

```bash
# Run daily at 02:00, append to log file
0 2 * * * /opt/datacenter-manager/backup/pg_backup.sh >> /var/log/dcm-backup.log 2>&1
```

Backups are written to `backup/data/` as gzip-compressed SQL dumps named
`datacenter_YYYYMMDD_HHMMSS.sql.gz`. By default, backups older than 30 days are
automatically pruned. Override with `BACKUP_RETENTION_DAYS=60` in the environment.

## Manual backup

```bash
bash backup/pg_backup.sh
```

Or run pg_dump directly:

```bash
docker compose exec postgres pg_dump -U postgres datacenter \
  | gzip > backup/data/datacenter_manual.sql.gz
```

## Restore procedure

> Warning: restoring overwrites all existing data in the database.

1. Stop the backend to prevent writes during restore:
   ```bash
   docker compose stop backend
   ```

2. Drop and recreate the database:
   ```bash
   docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS datacenter;"
   docker compose exec postgres psql -U postgres -c "CREATE DATABASE datacenter;"
   ```

3. Restore the chosen backup:
   ```bash
   gunzip -c backup/data/datacenter_TIMESTAMP.sql.gz \
     | docker compose exec -T postgres psql -U postgres -d datacenter
   ```

4. Re-run migrations to ensure schema is at the latest version:
   ```bash
   docker compose run --rm backend alembic upgrade head
   ```

5. Restart all services:
   ```bash
   docker compose up -d
   ```

## Notes

- The `backup/data/` directory is git-ignored. Store backups on a separate volume
  or remote location — never in the same place as the data being backed up.
- The restricted app role (`dcm_app`) is created by `postgres/init.sh` only on
  first PostgreSQL startup. After a restore, if the role is missing, re-run:
  ```bash
  docker compose exec postgres bash /docker-entrypoint-initdb.d/01-init.sh
  ```
  Or create it manually:
  ```bash
  docker compose exec postgres psql -U postgres -c \
    "CREATE ROLE dcm_app WITH LOGIN PASSWORD 'your_password';"
  docker compose exec postgres psql -U postgres -d datacenter -c \
    "GRANT CONNECT ON DATABASE datacenter TO dcm_app;"
  docker compose exec postgres psql -U postgres -d datacenter -c \
    "GRANT USAGE ON SCHEMA public TO dcm_app;"
  docker compose exec postgres psql -U postgres -d datacenter -c \
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dcm_app;"
  docker compose exec postgres psql -U postgres -d datacenter -c \
    "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dcm_app;"
  ```
