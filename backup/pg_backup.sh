#!/usr/bin/env bash
# PostgreSQL backup script for Datacenter Manager.
# Performs a gzip-compressed pg_dump and prunes old backups.
#
# Usage:
#   bash backup/pg_backup.sh
#
# Crontab example (runs daily at 02:00):
#   0 2 * * * /opt/datacenter-manager/backup/pg_backup.sh >> /var/log/dcm-backup.log 2>&1
#
# Environment variables (read from shell or .env):
#   POSTGRES_USER             — defaults to "postgres"
#   BACKUP_RETENTION_DAYS     — how many days of backups to keep (default: 30)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$SCRIPT_DIR/data"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/datacenter_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PG_USER="${POSTGRES_USER:-postgres}"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting backup → $BACKUP_FILE"

docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
    pg_dump -U "$PG_USER" datacenter \
    | gzip > "$BACKUP_FILE"

SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Backup complete (${SIZE})"

# Prune backups older than RETENTION_DAYS
PRUNED="$(find "$BACKUP_DIR" -name "datacenter_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pruned ${PRUNED} backup(s) older than ${RETENTION_DAYS} days"
