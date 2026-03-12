FROM python:3.12-slim AS base

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Dev stage ────────────────────────────────────────────────────────────────
FROM base AS dev
# Source code is mounted as a volume in docker-compose.dev.yml

# ─── Production stage ─────────────────────────────────────────────────────────
FROM base AS production

COPY . .

# Migrations are NOT run here. Run them as a separate step before starting the app:
#   docker compose run --rm backend alembic upgrade head
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
