# Backend Tests

## Running Tests

### Prerequisites

1. Start PostgreSQL with the test database:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d postgres
   ```
   This creates both `datacenter` (dev) and `datacenter_test` (test) databases.

2. Install test dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Run all tests
```bash
# From backend/
pytest

# With coverage
pytest --cov=app --cov-report=term-missing

# Verbose
pytest -v

# Specific file
pytest tests/api/test_auth.py -v

# Specific test
pytest tests/api/test_devices.py::test_create_device -v
```

### Environment

Tests use `TEST_DATABASE_URL` (default: `postgresql+asyncpg://postgres:postgres@localhost:5432/datacenter_test`).

Override via environment variable:
```bash
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/mytest_db pytest
```

## Test Structure

```
tests/
├── conftest.py              ← Session engine, per-test transaction rollback, auth fixtures
├── factories.py             ← Factory helpers for all ORM models
│
├── unit/
│   ├── test_crypto.py       ← Fernet encrypt/decrypt
│   ├── test_topology_service.py  ← networkx graph, path tracing, edge cases
│   └── test_sync_engine.py  ← upsert, diff accuracy, idempotency, inactive-not-delete
│
├── api/
│   ├── test_auth.py         ← Login, refresh rotation, revocation, forced PW change
│   ├── test_devices.py      ← Device CRUD, soft-delete, audit, RBAC
│   ├── test_physical.py     ← Datacenters, rooms, racks, licenses
│   ├── test_network.py      ← Interfaces, links, VLANs, IPs, SAN fabrics
│   ├── test_virtual.py      ← Clusters, hosts, VMs, datastores
│   ├── test_pagination.py   ← Edge cases: beyond-last-page, invalid size
│   ├── test_audit.py        ← Audit log API + meta-test (every mutation writes audit)
│   ├── test_alerts.py       ← Alert CRUD, summary, acknowledge, RBAC
│   ├── test_topology_api.py ← Path tracing, physical/network topology, floor plan
│   └── test_search.py       ← Global search
│
└── security/
    ├── test_encrypted_fields.py  ← Scan all responses for leaked _enc / password fields
    ├── test_jwt_rotation.py      ← Refresh rotation, reuse rejection, logout revocation
    └── test_rbac_matrix.py       ← Every mutating endpoint × read_only / unauth / operator
```

## Key Design Decisions

- **Real PostgreSQL** — no SQLite (required for INET/CIDR/MACADDR column types)
- **Nested transaction rollback** — each test wraps work in a SAVEPOINT, rolled back on teardown
- **No Alembic in tests** — `Base.metadata.create_all()` is sufficient and avoids sync driver issues
- **factory.Factory** (not SQLAlchemyModelFactory) — pure Python factories with `create_async()` methods
