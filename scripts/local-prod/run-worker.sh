#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT/apps/worker"

export NODE_ENV=production
export WORKER_ROLE=all
export PIPELINE_CONCURRENCY="${PIPELINE_CONCURRENCY:-2}"
export RENDER_CONCURRENCY="${RENDER_CONCURRENCY:-1}"
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

exec pnpm start
