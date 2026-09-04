#!/usr/bin/env bash
set -euo pipefail

AGENT_DIR="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

for service in data web worker; do
  label="com.kendrix.$service"
  launchctl bootout "$DOMAIN/$label" >/dev/null 2>&1 || true
  rm -f "$AGENT_DIR/$label.plist"
done

echo "Kendrix launch agents removed. Postgres and Redis data were preserved."
