# APScheduler setup — Phase 8
#
# In-process async scheduler. No Celery or Redis required.
# On startup: loads all enabled integrations from DB and schedules
#             one job per integration at its configured polling_interval_sec.
# Jobs are also callable on-demand via POST /integrations/{id}/sync.

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()
