import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.api.v1.router import api_router

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

    # TODO Phase 8: start APScheduler, load sync jobs from integrations table
    yield
    # TODO Phase 8: stop APScheduler


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
