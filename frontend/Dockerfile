FROM node:20-alpine AS base

WORKDIR /app
COPY package*.json ./
RUN npm ci

# ─── Dev stage ────────────────────────────────────────────────────────────────
FROM base AS dev
# Source code is mounted as a volume in docker-compose.dev.yml

# ─── Build stage ──────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
RUN npm run build

# ─── Production stage — static files served by Nginx ─────────────────────────
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# Serve index.html for all routes (SPA fallback)
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri /index.html; } }' \
    > /etc/nginx/conf.d/default.conf
