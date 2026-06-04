# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the frontend ----------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
# Using `npm install` (not `npm ci`) because the lock file is generated on macOS
# and is missing linux optional native deps (e.g. @emnapi/*) — npm ci is strict
# about cross-platform optionals; npm install resolves them at build time.
RUN npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build
# Output is /app/frontend/dist


# ---------- Stage 2: backend + provisioned venvs ----------
FROM python:3.12-slim AS runtime

# pyright's PyPI package downloads its Node-based core on first invocation.
# Installing Node at the OS layer lets the build-time warmup (below) cache the
# Node bundle inside the venv so first request after deploy isn't a cold download.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates nodejs \
    && rm -rf /var/lib/apt/lists/*

# uv for fast Python tooling; matches local dev workflow
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Backend deps first (separate layer for caching)
COPY backend/pyproject.toml backend/uv.lock* ./backend/
RUN cd backend && uv sync --no-dev

# Backend source
COPY backend/ ./backend/

# Provision checker venvs (baked into the image — immutable per CLAUDE.md rule)
RUN cd backend && uv run python provision_checkers.py

# Warm up pyright so its Node binary downloads at build time, not on first request
RUN /app/backend/.venvs/pyright-1.1.409/bin/pyright --version || true

# Built frontend bundle from stage 1
COPY --from=frontend-builder /app/frontend/dist/ ./backend/static/

EXPOSE 8080

# uvicorn binds 0.0.0.0 because the container is the network boundary
WORKDIR /app/backend
CMD ["uv", "run", "uvicorn", "app.app:app", "--host", "0.0.0.0", "--port", "8080"]
