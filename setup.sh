#!/usr/bin/env bash
# setup.sh — One-shot setup for Datacenter Manager
# Run once after cloning the repository:
#   bash setup.sh
#
# What it does:
#   1. Checks prerequisites (Docker, Docker Compose, OpenSSL)
#   2. Asks: development or production mode?
#   3. Collects passwords interactively
#   4. Generates SECRET_KEY and FERNET_KEY using Docker
#   5. Writes a complete .env file
#   6. Creates nginx/certs/ and optionally generates a self-signed TLS cert
#   7. Builds Docker images
#   8. Starts PostgreSQL and waits until healthy
#   9. Runs Alembic migrations
#  10. Starts the full stack
#  11. Waits for the backend health probe
#  12. Prints a summary with login instructions

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }
header()  { echo -e "\n${BOLD}━━━  $*  ━━━${NC}"; }

# ── Resolve script directory (works from any working directory) ───────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
header "Datacenter Manager — Setup"
echo ""
echo "  This script will configure and start the application."
echo "  You will be asked a few questions. Everything else is automatic."
echo ""

# ── Step 1: Check prerequisites ───────────────────────────────────────────────
header "Step 1/10 — Checking prerequisites"

check_cmd() {
    if command -v "$1" &>/dev/null; then
        success "$1 found"
    else
        die "$1 is not installed or not in PATH. See INSTALL.md for prerequisites."
    fi
}

check_cmd docker
check_cmd openssl

# Docker Compose v2 (plugin) or standalone
if docker compose version &>/dev/null 2>&1; then
    COMPOSE="docker compose"
    success "docker compose (plugin) found"
elif command -v docker-compose &>/dev/null; then
    COMPOSE="docker-compose"
    success "docker-compose (standalone) found"
else
    die "Docker Compose not found. Install it from https://docs.docker.com/compose/install/"
fi

# Make sure Docker daemon is actually running
if ! docker info &>/dev/null; then
    die "Docker daemon is not running. Start Docker Desktop (or 'sudo systemctl start docker') and try again."
fi
success "Docker daemon is running"

# ── Step 2: Choose mode ───────────────────────────────────────────────────────
header "Step 2/10 — Choose deployment mode"
echo ""
echo "  [1] Development  — plain HTTP, hot-reload, ports 80 / 8000 / 5173"
echo "  [2] Production   — HTTPS with TLS certificate, resource limits"
echo ""
while true; do
    read -rp "  Enter choice [1/2]: " MODE_CHOICE
    case "$MODE_CHOICE" in
        1) MODE="dev";  break ;;
        2) MODE="prod"; break ;;
        *) warn "Please enter 1 or 2." ;;
    esac
done
info "Mode: $MODE"

# ── Step 3: Collect passwords ─────────────────────────────────────────────────
header "Step 3/10 — Set passwords"

# Helper: prompt for a password, confirm, enforce minimum length
prompt_password() {
    local label="$1"
    local varname="$2"
    local minlen="${3:-12}"
    local pw pw2
    while true; do
        read -rsp "  $label: " pw; echo ""
        if [[ ${#pw} -lt $minlen ]]; then
            warn "Password must be at least $minlen characters. Try again."
            continue
        fi
        read -rsp "  Confirm $label: " pw2; echo ""
        if [[ "$pw" != "$pw2" ]]; then
            warn "Passwords do not match. Try again."
            continue
        fi
        printf -v "$varname" '%s' "$pw"
        break
    done
}

echo ""
echo "  These passwords will be written to .env (not committed to git)."
echo ""

prompt_password "PostgreSQL superuser password (POSTGRES_PASSWORD)" POSTGRES_PASSWORD
prompt_password "App DB role password         (DCM_DB_PASSWORD)" DCM_DB_PASSWORD
prompt_password "Admin account temp password  (INITIAL_ADMIN_PASSWORD, min 8 chars)" INITIAL_ADMIN_PASSWORD 8

echo ""
read -rp "  Admin username [admin]: " INITIAL_ADMIN_USERNAME
INITIAL_ADMIN_USERNAME="${INITIAL_ADMIN_USERNAME:-admin}"

# ── Step 4: Generate cryptographic keys ──────────────────────────────────────
header "Step 4/10 — Generating SECRET_KEY and FERNET_KEY"

info "Pulling python:3.12-slim (used only for key generation)..."
docker pull --quiet python:3.12-slim

info "Generating SECRET_KEY..."
SECRET_KEY=$(docker run --rm python:3.12-slim \
    python -c "import secrets; print(secrets.token_hex(64))")
success "SECRET_KEY generated (${#SECRET_KEY} chars)"

info "Generating FERNET_KEY..."
FERNET_KEY=$(docker run --rm python:3.12-slim \
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
success "FERNET_KEY generated (${#FERNET_KEY} chars)"

# ── Step 5: Write .env ────────────────────────────────────────────────────────
header "Step 5/10 — Writing .env"

if [[ -f .env ]]; then
    warn ".env already exists — backing it up to .env.bak"
    cp .env .env.bak
fi

# Set environment-specific values
if [[ "$MODE" == "prod" ]]; then
    ENVIRONMENT="production"
    LOG_LEVEL="WARNING"
    CORS_ORIGINS="https://localhost"
else
    ENVIRONMENT="development"
    LOG_LEVEL="DEBUG"
    CORS_ORIGINS="http://localhost:5173,http://localhost:80,http://localhost"
fi

# Use printf '%s\n' to safely write values that may contain special characters.
# This avoids any shell interpretation of $, `, \, etc. inside the passwords.
{
    printf '# Generated by setup.sh — do not commit this file\n'
    printf '\n'
    printf '# ─── Database ───────────────────────────────────────────────────────────────\n'
    printf 'DATABASE_URL=postgresql+asyncpg://dcm_app:%s@postgres:5432/datacenter\n' "$DCM_DB_PASSWORD"
    printf 'MIGRATION_DATABASE_URL=postgresql+asyncpg://postgres:%s@postgres:5432/datacenter\n' "$POSTGRES_PASSWORD"
    printf '\n'
    printf 'POSTGRES_USER=postgres\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
    printf 'POSTGRES_DB=datacenter\n'
    printf '\n'
    printf 'DCM_DB_USER=dcm_app\n'
    printf 'DCM_DB_PASSWORD=%s\n' "$DCM_DB_PASSWORD"
    printf '\n'
    printf '# ─── Security ───────────────────────────────────────────────────────────────\n'
    printf 'SECRET_KEY=%s\n' "$SECRET_KEY"
    printf 'FERNET_KEY=%s\n' "$FERNET_KEY"
    printf 'ACCESS_TOKEN_EXPIRE_MINUTES=15\n'
    printf 'REFRESH_TOKEN_EXPIRE_DAYS=7\n'
    printf '\n'
    printf '# ─── TLS ─────────────────────────────────────────────────────────────────────\n'
    printf 'TLS_CERT_PATH=/etc/nginx/certs/server.crt\n'
    printf 'TLS_KEY_PATH=/etc/nginx/certs/server.key\n'
    printf '\n'
    printf '# ─── App ─────────────────────────────────────────────────────────────────────\n'
    printf 'CORS_ORIGINS=%s\n' "$CORS_ORIGINS"
    printf 'ENVIRONMENT=%s\n' "$ENVIRONMENT"
    printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
    printf '\n'
    printf '# ─── Retention ───────────────────────────────────────────────────────────────\n'
    printf 'POWER_READINGS_RETENTION_DAYS=90\n'
    printf '\n'
    printf '# ─── Initial admin ───────────────────────────────────────────────────────────\n'
    printf 'INITIAL_ADMIN_USERNAME=%s\n' "$INITIAL_ADMIN_USERNAME"
    printf 'INITIAL_ADMIN_PASSWORD=%s\n' "$INITIAL_ADMIN_PASSWORD"
    printf '\n'
    if [[ "$MODE" == "prod" ]]; then
        printf '# ─── Prometheus metrics ──────────────────────────────────────────────────────\n'
        printf 'ENABLE_METRICS=true\n'
    fi
} > .env

success ".env written"

# ── Step 6: TLS certificates ──────────────────────────────────────────────────
header "Step 6/10 — TLS certificates"

mkdir -p nginx/certs

if [[ "$MODE" == "dev" ]]; then
    info "Development mode — TLS not required (nginx uses plain HTTP)"
    success "nginx/certs/ directory created"
else
    if [[ -f nginx/certs/server.crt && -f nginx/certs/server.key ]]; then
        warn "nginx/certs/server.crt already exists — skipping cert generation"
        warn "Delete nginx/certs/server.{crt,key} and re-run to regenerate."
    else
        info "Generating self-signed TLS certificate (valid 10 years)..."
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout nginx/certs/server.key \
            -out nginx/certs/server.crt \
            -subj "/CN=datacenter-manager" \
            2>/dev/null
        success "Self-signed certificate written to nginx/certs/"
        warn "Browsers will show a certificate warning for self-signed certs."
        warn "To suppress it: add nginx/certs/server.crt to your OS trust store,"
        warn "or replace it with a cert signed by your internal CA."
    fi
fi

# ── Step 7: Build Docker images ───────────────────────────────────────────────
header "Step 7/10 — Building Docker images"
info "This may take 5–10 minutes on first run..."

if [[ "$MODE" == "dev" ]]; then
    $COMPOSE -f docker-compose.yml -f docker-compose.dev.yml build
else
    $COMPOSE -f docker-compose.yml -f docker-compose.prod.yml build
fi

success "Images built"

# ── Step 8: Start PostgreSQL and wait for healthy ─────────────────────────────
header "Step 8/10 — Starting PostgreSQL"

if [[ "$MODE" == "dev" ]]; then
    $COMPOSE -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
else
    $COMPOSE -f docker-compose.yml -f docker-compose.prod.yml up -d postgres
fi

info "Waiting for PostgreSQL to be healthy..."
RETRIES=30
until $COMPOSE exec -T postgres pg_isready -U postgres -d datacenter &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [[ $RETRIES -le 0 ]]; then
        die "PostgreSQL did not become healthy within 60 seconds. Check: $COMPOSE logs postgres"
    fi
    sleep 2
done
success "PostgreSQL is healthy"

# ── Step 9: Run database migrations ──────────────────────────────────────────
header "Step 9/10 — Running database migrations"

if [[ "$MODE" == "dev" ]]; then
    $COMPOSE -f docker-compose.yml -f docker-compose.dev.yml run --rm backend alembic upgrade head
else
    $COMPOSE -f docker-compose.yml -f docker-compose.prod.yml run --rm backend alembic upgrade head
fi

success "Migrations applied"

# ── Step 10: Start the full stack ─────────────────────────────────────────────
header "Step 10/10 — Starting the full stack"

if [[ "$MODE" == "dev" ]]; then
    $COMPOSE -f docker-compose.yml -f docker-compose.dev.yml up -d
else
    $COMPOSE -f docker-compose.yml -f docker-compose.prod.yml up -d
fi

# Wait for backend health probe
info "Waiting for the backend to be ready..."
RETRIES=30
if [[ "$MODE" == "dev" ]]; then
    HEALTH_URL="http://localhost/health"
    CURL_FLAGS=""
else
    HEALTH_URL="https://localhost/health"
    CURL_FLAGS="-k"  # -k: skip cert verification for self-signed
fi

until curl -sf $CURL_FLAGS "$HEALTH_URL" &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [[ $RETRIES -le 0 ]]; then
        warn "Backend health check timed out."
        warn "The stack may still be starting. Check: $COMPOSE logs backend"
        break
    fi
    sleep 2
done

if curl -sf $CURL_FLAGS "$HEALTH_URL" &>/dev/null; then
    success "Backend is healthy"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Setup complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [[ "$MODE" == "dev" ]]; then
    echo -e "  App URL:      ${CYAN}http://localhost${NC}"
    echo -e "  API docs:     ${CYAN}http://localhost/docs${NC}"
    echo -e "  Backend port: ${CYAN}http://localhost:8000${NC}  (direct, bypasses nginx)"
    echo -e "  Frontend HMR: ${CYAN}http://localhost:5173${NC}  (Vite dev server)"
else
    echo -e "  App URL:      ${CYAN}https://localhost${NC}  (or https://<server-ip>)"
    echo -e "  Metrics:      ${CYAN}https://localhost/metrics${NC}  (internal only)"
fi

echo ""
echo -e "  Login credentials:"
echo -e "    Username: ${BOLD}${INITIAL_ADMIN_USERNAME}${NC}"
echo -e "    Password: ${BOLD}(the INITIAL_ADMIN_PASSWORD you entered)${NC}"
echo ""
echo -e "  ${YELLOW}⚠  You will be forced to change the password on first login.${NC}"
echo -e "  ${YELLOW}   After changing it, clear INITIAL_ADMIN_PASSWORD in .env${NC}"
echo -e "  ${YELLOW}   and run: $COMPOSE up -d backend${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    $COMPOSE logs -f backend      # follow backend logs"
echo -e "    $COMPOSE ps                   # check container status"
echo -e "    $COMPOSE down                 # stop everything"
echo ""
echo -e "  See ${BOLD}INSTALL.md${NC} for next steps (adding infrastructure, backups, users)."
echo ""
