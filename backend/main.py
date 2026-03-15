import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging_config import configure_logging
from app.api.v1.router import api_router

# Configure logging before any module-level loggers are used.
# JSON in production, human-readable in development.
configure_logging(
    log_level=settings.log_level,
    json_logs=(settings.environment != "development"),
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Bootstrap: create initial admin user if none exist ────────────────────
    if settings.initial_admin_password:
        try:
            async with AsyncSessionLocal() as db:
                from app.crud.user import crud_user  # noqa: PLC0415
                from app.schemas.user import UserCreate  # noqa: PLC0415
                from app.models.enums import UserRole  # noqa: PLC0415

                existing = await crud_user.get_by_username(db, settings.initial_admin_username)
                if existing is None:
                    new_user = await crud_user.create(
                        db,
                        obj_in=UserCreate(
                            username=settings.initial_admin_username,
                            password=settings.initial_admin_password,
                            role=UserRole.admin,
                        ),
                    )
                    # Force password change on first login — set on the already-loaded
                    # object and commit once to avoid a second round-trip.
                    new_user.must_change_password = True
                    await db.commit()
                    logger.info(
                        "Bootstrap: admin user '%s' created. Password change required on first login.",
                        settings.initial_admin_username,
                    )
        except Exception:
            logger.exception(
                "Bootstrap: failed to create initial admin user. "
                "Check DB connectivity and restart, or create the user manually."
            )

    # ── Phase 8: start APScheduler and load scheduled sync jobs ──────────────
    from app.tasks.scheduler import load_and_schedule_all, start, stop  # noqa: PLC0415

    try:
        start()
        async with AsyncSessionLocal() as db:
            await load_and_schedule_all(db)
    except Exception:
        logger.exception("Scheduler startup failed — integration sync jobs not scheduled")

    yield

    # ── Phase 8: graceful scheduler shutdown ──────────────────────────────────
    try:
        stop()
    except Exception:
        logger.exception("Scheduler shutdown error")


app = FastAPI(
    title="Datacenter Manager",
    description="On-premise datacenter infrastructure management",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

# ── Prometheus metrics (Phase 14) ─────────────────────────────────────────────
# Exposes GET /metrics in Prometheus text format.
# Nginx restricts /metrics to internal IPs only — see nginx/nginx.conf.
try:
    from prometheus_fastapi_instrumentator import Instrumentator  # noqa: PLC0415

    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        env_var_name="ENABLE_METRICS",
        excluded_handlers=["/metrics", "/health", "/readiness"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
    logger.info("Prometheus metrics enabled at /metrics")
except ImportError:
    logger.warning(
        "prometheus-fastapi-instrumentator not installed — /metrics endpoint disabled. "
        "Add it to requirements.txt to enable."
    )


@app.get("/health", tags=["health"])
async def health_check():
    """Liveness probe — returns ok if the process is running."""
    return {"status": "ok"}


@app.get("/readiness", tags=["health"])
async def readiness_check():
    """Readiness probe — confirms DB connectivity before accepting traffic."""
    async with AsyncSessionLocal() as db:
        await db.execute(text("SELECT 1"))
    return {"status": "ready"}
