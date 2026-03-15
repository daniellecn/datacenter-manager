"""
APScheduler Setup — Phase 8

In-process async scheduler (no Celery/Redis required).
On startup: loads all enabled integrations from DB and schedules one job per
            integration at its configured polling_interval_sec.

Jobs are also callable on-demand via POST /integrations/{id}/sync.
Job ID is always str(integration.id) for easy lookup/cancellation.
"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integration import Integration

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Module-level scheduler — created once, started in lifespan
scheduler = AsyncIOScheduler(timezone="UTC")


async def load_and_schedule_all(db: AsyncSession) -> None:
    """
    Query all enabled integrations and schedule a recurring job for each.
    Called once during application startup.
    """
    from app.tasks.sync_jobs import dispatch_integration_sync  # noqa: PLC0415

    result = await db.execute(
        select(Integration).where(Integration.enabled == True)  # noqa: E712
    )
    integrations = result.scalars().all()

    for integration in integrations:
        _schedule_one(integration)

    logger.info("Scheduler: %d integration job(s) scheduled", len(integrations))

    # ── Daily maintenance jobs (Phase 14) ─────────────────────────────────────
    from app.tasks.cleanup_jobs import (  # noqa: PLC0415
        purge_expired_token_revocations,
        purge_old_power_readings,
        purge_old_sync_logs,
    )

    _cleanup_jobs = [
        ("cleanup_token_revocations", "cleanup:token_revocations", purge_expired_token_revocations, 3, 0),
        ("cleanup_power_readings",    "cleanup:power_readings",    purge_old_power_readings,          3, 15),
        ("cleanup_sync_logs",         "cleanup:sync_logs",         purge_old_sync_logs,               3, 30),
    ]
    for job_id, job_name, func, hour, minute in _cleanup_jobs:
        scheduler.add_job(
            func,
            trigger=CronTrigger(hour=hour, minute=minute, timezone="UTC"),
            id=job_id,
            name=job_name,
            replace_existing=True,
            max_instances=1,
        )
    logger.info("Scheduler: 3 cleanup job(s) scheduled (daily 03:00–03:30 UTC)")


def _schedule_one(integration: Integration) -> None:
    """Add or replace a scheduled job for one integration."""
    from app.tasks.sync_jobs import dispatch_integration_sync  # noqa: PLC0415

    job_id = str(integration.id)
    interval_sec = max(integration.polling_interval_sec or 3600, 60)  # min 60s

    # Remove existing job if any (handles re-schedule on update)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    scheduler.add_job(
        dispatch_integration_sync,
        trigger=IntervalTrigger(seconds=interval_sec),
        id=job_id,
        name=f"sync:{integration.name}",
        args=[str(integration.id)],
        replace_existing=True,
        max_instances=1,          # never overlap
        misfire_grace_time=300,   # allow up to 5 min late start
    )
    logger.debug(
        "Scheduler: job %s scheduled every %ds for integration '%s'",
        job_id, interval_sec, integration.name,
    )


def schedule_integration(integration: Integration) -> None:
    """
    Public function — add or update the scheduled job for a single integration.
    Called when an integration is created or updated via the API.
    """
    if not integration.enabled:
        unschedule_integration(integration.id)
        return
    _schedule_one(integration)


def unschedule_integration(integration_id: uuid.UUID | str) -> None:
    """Remove the scheduled job for an integration (on delete or disable)."""
    job_id = str(integration_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.debug("Scheduler: job %s removed", job_id)


def start() -> None:
    """Start the scheduler. No-op if already running."""
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")


def stop() -> None:
    """Graceful shutdown — wait for running jobs to finish."""
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("APScheduler stopped")
