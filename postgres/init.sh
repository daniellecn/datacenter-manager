#!/usr/bin/env bash
# Creates the restricted application role used by the backend service.
# PostgreSQL runs this script once on first startup when the data directory is empty.
# DCM_DB_USER and DCM_DB_PASSWORD are injected as container environment variables
# via docker-compose.yml.
set -euo pipefail

echo "[init] Creating restricted application role: ${DCM_DB_USER}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE ${DCM_DB_USER} WITH LOGIN PASSWORD '${DCM_DB_PASSWORD}';
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${DCM_DB_USER};
    GRANT USAGE ON SCHEMA public TO ${DCM_DB_USER};

    -- Grant DML on all future tables and sequences created by the superuser.
    -- Alembic migrations run as the superuser (POSTGRES_USER), so this ensures
    -- the app role automatically gets access to every migrated table.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${DCM_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${DCM_DB_USER};
EOSQL

echo "[init] Role '${DCM_DB_USER}' created successfully."
