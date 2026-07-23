#!/bin/bash
# PostToolUse hook: when Claude edits multi-tenancy-relevant code, inject a
# reminder to run the multi-tenancy-checklist skill before finishing the task.
# Reminds at most once per session per hour so multi-file changes aren't spammed.

input=$(cat)
fp=$(jq -r '.tool_input.file_path // empty' <<<"$input")
sid=$(jq -r '.session_id // "nosession"' <<<"$input")

[ -n "$fp" ] || exit 0

case "$fp" in
  */apps/web/src/app/api/*) ;;
  */apps/web/src/middleware.ts) ;;
  */apps/web/src/auth.ts) ;;
  */apps/web/src/lib/api-access.ts) ;;
  */apps/web/src/lib/access.ts) ;;
  */apps/web/src/lib/auth.ts) ;;
  */apps/web/src/lib/invite.ts) ;;
  */packages/db/*) ;;
  */apps/worker/src/pipeline/*) ;;
  */packages/core/src/types/cost.ts) ;;
  */packages/core/src/state-machine/*) ;;
  *) exit 0 ;;
esac

marker="${TMPDIR:-/tmp}/tenancy-checklist-reminder-${sid}"
if [ -f "$marker" ] && [ -n "$(find "$marker" -mmin -60 2>/dev/null)" ]; then
  exit 0
fi
touch "$marker"

cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"This edit touched multi-tenancy-relevant code (API routes / db schema / pipeline / access-auth libs). Before finishing this task, run the multi-tenancy-checklist skill against the full set of changes and report the seven-point result."},"suppressOutput":true}
EOF
