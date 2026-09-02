#!/usr/bin/env bash
set -euo pipefail

KENDRIX_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KENDRIX_TUNNEL_TOKEN="$KENDRIX_ROOT/.local-prod/cloudflared/token"
KENDRIX_TUNNEL_CONTAINER="kendrix-cloudflared"

if [[ ! -s "$KENDRIX_TUNNEL_TOKEN" ]]; then
  echo "Missing Cloudflare tunnel token: $KENDRIX_TUNNEL_TOKEN" >&2
  echo "Create the kendrix-local connector in Cloudflare, then save its token in that file with mode 0600." >&2
  exit 1
fi

if docker inspect "$KENDRIX_TUNNEL_CONTAINER" >/dev/null 2>&1; then
  if [[ "$(docker inspect --format '{{.State.Running}}' "$KENDRIX_TUNNEL_CONTAINER")" == "true" ]]; then
    echo "Cloudflare tunnel is already running."
    exit 0
  fi

  docker start "$KENDRIX_TUNNEL_CONTAINER" >/dev/null
  echo "Started the existing Cloudflare tunnel container."
  exit 0
fi

docker run \
  --detach \
  --name "$KENDRIX_TUNNEL_CONTAINER" \
  --restart unless-stopped \
  --user "$(id -u):$(id -g)" \
  --workdir /tmp \
  --volume "$KENDRIX_TUNNEL_TOKEN:/run/secrets/cloudflared-token:ro" \
  cloudflare/cloudflared:latest \
  tunnel --no-autoupdate run --token-file /run/secrets/cloudflared-token >/dev/null

echo "Installed and started the Cloudflare tunnel container."
