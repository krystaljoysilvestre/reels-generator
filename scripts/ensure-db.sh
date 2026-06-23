#!/usr/bin/env bash
# Ensure the local Postgres + Redis containers are running before dev.
# Idempotent: safe to run repeatedly. Starts Docker Desktop if needed (macOS).
set -euo pipefail

cd "$(dirname "$0")/.."

compose() { docker compose "$@"; }

# 1. Make sure the Docker daemon is reachable; on macOS, boot Docker Desktop.
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "→ Docker daemon not running; launching Docker Desktop…"
    open -a Docker
    for _ in $(seq 1 60); do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker daemon is not available. Start Docker and retry." >&2
    exit 1
  fi
fi

# 2. Bring up the data services (no-op if already running).
echo "→ Ensuring postgres + redis containers are up…"
compose up -d postgres redis >/dev/null

# 3. Wait for Postgres to accept connections.
for _ in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "✓ Database is ready (postgres on :5433, redis on :6379)"
    exit 0
  fi
  sleep 1
done

echo "✗ Postgres did not become ready in time." >&2
exit 1
