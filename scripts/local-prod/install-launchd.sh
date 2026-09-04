#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMPLATE_DIR="$PROJECT_ROOT/deploy/local"
LOG_DIR="$PROJECT_ROOT/.local-prod/logs"
AGENT_DIR="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

mkdir -p "$LOG_DIR" "$AGENT_DIR"

for service in data web worker; do
  label="com.kendrix.$service"
  target="$AGENT_DIR/$label.plist"
  sed "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" "$TEMPLATE_DIR/$label.plist.template" > "$target"
  plutil -lint "$target" >/dev/null
  launchctl bootout "$DOMAIN/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "$DOMAIN" "$target"
done

echo "Kendrix services installed for this macOS user."
echo "Logs: $LOG_DIR"
