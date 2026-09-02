#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "Data services"
docker compose ps postgres redis

echo
echo "Web + dependencies"
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
echo

echo
echo "Private queue monitor"
curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3001/queues
echo "Bull Board is reachable on loopback."

echo
echo "Public tunnel"
if [[ "$(docker inspect --format '{{.State.Running}}' kendrix-cloudflared 2>/dev/null || true)" != "true" ]]; then
  echo "kendrix-cloudflared is not running." >&2
  exit 1
fi
curl --fail --silent --show-error https://app.kendrix.io/api/health
echo
