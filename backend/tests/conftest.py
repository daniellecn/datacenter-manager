"""
Shared pytest fixtures for backend tests.

Database isolation strategy:
  - session-scoped engine; Base.metadata.create_all() creates all tables once.
  - function-scoped nested transaction (SAVEPOINT) rolled back after each test.
  - FastAPI dependency override injects the test session into route handlers.

Required environment variables (set here before any app imports):
  TEST_DATABASE_URL — defaults to postgresql+asyncpg://postgres:postgres@localhost:5432/datacenter_test
  SECRET_KEY        — fixed test value
  FERNET_KEY        — fixed test value (valid Fernet key)
"""
import os
import uuid

# ── Set env vars BEFORE any app code is imported ────────────────────────────
from cryptography.fernet import Fernet

_TEST_FERNET_KEY = Fernet.generate_key().decode()
os.environ.setdefault(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/datacenter_test",
)
_TEST_DB_URL = os.environ["TEST_DATABASE_URL"]

os.environ["DATABASE_URL"] = _TEST_DB_URL
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only-must-be-64-chars-padded-here!!"
os.environ["FERNET_KEY"] = _TEST_FERNET_KEY
os.environ["INITIAL_ADMIN_PASSWORD"] = "TestAdmin123!"
os.environ["ENVIRONMENT"] = "test"

# ── Now import app code ───────────────────────────────────────────────────────
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.enums import UserRole
from app.models.user import User
from main import app


# ── Engine & Schema ───────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
async def engine():
    """Session-scoped engine; creates all tables once, drops them on teardown."""
    eng = create_async_engine(_TEST_DB_URL, echo=False, pool_pre_ping=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


# ── Per-test DB session (nested transaction / SAVEPOINT) ─────────────────────

@pytest.fixture
async def db(engine):
    """
    Function-scoped async session.

    Uses join_transaction_mode='create_savepoint' so that every commit()
    inside a test or route handler releases a SAVEPOINT (not the outer
    transaction). The outer transaction is rolled back in teardown.
    """
    async with engine.connect() as connection:
        await connection.begin()
        session_factory = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with session_factory() as session:
            yield session
        await connection.rollback()


# ── HTTP client with dependency override ─────────────────────────────────────

@pytest.fixture
async def client(db):
    """AsyncClient with the test session injected for all requests."""

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


# ── User helpers ──────────────────────────────────────────────────────────────

async def _make_user(db: AsyncSession, role: UserRole, **kwargs) -> User:
    user = User(
        id=uuid.uuid4(),
        username=kwargs.pop("username", f"user_{uuid.uuid4().hex[:8]}"),
        email=kwargs.pop("email", None),
        hashed_password=hash_password(kwargs.pop("password", "Testpass123!")),
        role=role,
        is_active=kwargs.pop("is_active", True),
        must_change_password=kwargs.pop("must_change_password", False),
        **kwargs,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.fixture
async def admin_user(db):
    return await _make_user(db, UserRole.admin, username="admin_user")


@pytest.fixture
async def operator_user(db):
    return await _make_user(db, UserRole.operator, username="operator_user")


@pytest.fixture
async def readonly_user(db):
    return await _make_user(db, UserRole.read_only, username="readonly_user")


# ── Token helpers ─────────────────────────────────────────────────────────────

def _auth_headers(user: User) -> dict[str, str]:
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(admin_user):
    return _auth_headers(admin_user)


@pytest.fixture
def operator_headers(operator_user):
    return _auth_headers(operator_user)


@pytest.fixture
def readonly_headers(readonly_user):
    return _auth_headers(readonly_user)


# ── Convenience: authenticated clients ───────────────────────────────────────

@pytest.fixture
async def admin_client(db, admin_user):
    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=_auth_headers(admin_user),
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
async def operator_client(db, operator_user):
    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=_auth_headers(operator_user),
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
async def readonly_client(db, readonly_user):
    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=_auth_headers(readonly_user),
    ) as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)
