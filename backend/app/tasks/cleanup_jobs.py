"""
Maintenance / cleanup jobs — Phase 14

Three daily tasks scheduled by APScheduler (see scheduler.py):

  cleanup:token_revocations  — purge expired rows from token_revocations
  cleanup:power_readings     — purge power_readings older than retention window
  cleanup:sync_logs          — purge sync_logs older than 90 days

All jobs open their own DB session (not request-scoped) and commit once.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.integration import SyncLog
from app.models.power_reading import PowerReading
from app.models.token_revocation import TokenRevocation

logger = logging.getLogger(__name__)

# Sync log retention is fixed; not configurable via env (no need yet).
_SYNC_LOG_RETENTION_DAYS = 90


async def purge_expired_token_revocations() -> None:
    """Delete token_revocations rows whose expires_at has passed.

    These rows exist solely to block replayed refresh tokens; once the token
    has expired naturally it can no longer be used regardless of the denylist,
    so the row is safe to remove.
    """
    now = datetime.now(tz=timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(TokenRevocation).where(TokenRevocation.expires_at < now)
        )
        await db.commit()
    logger.info(
        "Cleanup: purged %d expired token revocation(s)",
        result.rowcount,
        extra={"job": "cleanup:token_revocations", "rows_deleted": result.rowcount},
    )


async def purge_old_power_readings() -> None:
    """Delete power_readings older than POWER_READINGS_RETENTION_DAYS (default 90).

    Power readings are time-series data used for trending / capacity planning.
    Beyond the retention window they are too old to be actionable.
    """
    retention_days = settings.power_readings_retention_days
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(PowerReading).where(PowerReading.recorded_at < cutoff)
        )
        await db.commit()
    logger.info(
        "Cleanup: purged %d power reading(s) older than %d day(s)",
        result.rowcount,
        retention_days,
        extra={
            "job": "cleanup:power_readings",
            "rows_deleted": result.rowcount,
            "retention_days": retention_days,
        },
    )


async def purge_old_sync_logs() -> None:
    """Delete sync_logs rows whose started_at is older than 90 days.

    Sync logs are useful for short-term debugging and reporting; keeping them
    indefinitely would cause the table to grow unboundedly on active setups.
    The 90-day window covers ~3 months of history which is sufficient for
    operational review.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=_SYNC_LOG_RETENTION_DAYS)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(SyncLog).where(SyncLog.started_at < cutoff)
        )
        await db.commit()
    logger.info(
        "Cleanup: purged %d sync log(s) older than %d day(s)",
        result.rowcount,
        _SYNC_LOG_RETENTION_DAYS,
        extra={
            "job": "cleanup:sync_logs",
            "rows_deleted": result.rowcount,
            "retention_days": _SYNC_LOG_RETENTION_DAYS,
        },
    )
