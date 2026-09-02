#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

export NODE_ENV=production
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

bash scripts/ensure-db.sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm --filter web build
pnpm --filter worker build

echo "Production build is ready."
