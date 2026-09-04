#!/usr/bin/env bash
# Deploy web and/or worker to Railway from a clean checkout, stamped with the commit being deployed.
#
# Why this exists: Railway has no auto-deploy on this project, `railway up` uploads a tarball with no
# git context, and Railway only injects RAILWAY_GIT_COMMIT_SHA for GitHub-triggered deploys. So a
# hand-run deploy produced an image that could not say what it was. On 2026-09-04 that let the worker
# sit two days and two commits behind the web service with nothing reporting it, which would have
# silently voided the Phase 0 forced-recovery lap: the boundary it was meant to fail at was not in the
# running build at all.
#
# This script closes both halves. It refuses to deploy anything but a clean, pushed commit, and it
# leaves a .build-commit stamp in the upload context that the image reads back at runtime
# (packages/core/src/build-info.ts), so both services report their own commit afterwards.
#
# Usage:
#   scripts/deploy-railway.sh web        # web only (its pre-deploy runs migrations)
#   scripts/deploy-railway.sh worker     # worker only
#   scripts/deploy-railway.sh all        # web, then worker, only if web succeeded
#
#   ALLOW_UNPUSHED=1 scripts/deploy-railway.sh web   # escape hatch, prints a loud warning
#
# Invariants it will not let you break (specs/phase0-deployment.md):
#   - migrations run from web's pre-deploy command only, so web goes first;
#   - never deploy the worker while a render is active — it checks and asks.

set -euo pipefail

cd "$(dirname "$0")/.."

STAMP=.build-commit
HEALTH_URL=${HEALTH_URL:-https://app.kendrix.io/api/health}

# The stamp is intentionally NOT in .gitignore. Railway's uploader does not honor .gitignore — that is
# the whole reason .railwayignore exists — and an untracked-but-unignored file is the one thing certain
# to reach the image. It is written just before the upload and removed on every exit path.
cleanup() { rm -f "$STAMP"; }
trap cleanup EXIT

target=${1:-}
case "$target" in
  web | worker | all) ;;
  *)
    echo "usage: $0 web|worker|all" >&2
    exit 2
    ;;
esac

# 1. A stale stamp from an interrupted run must not be mistaken for local edits below.
rm -f "$STAMP"

# 2. Deploy only what is reviewable. A dirty tree is how "the build we verified" quietly becomes
#    something else, and this deploy path uploads the working directory rather than a git ref.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree is dirty. Commit or stash first — this uploads the directory, not a commit." >&2
  git status --short >&2
  exit 1
fi

COMMIT=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short=7 HEAD)

# 3. Deploy only what someone else can fetch. An unpushed commit cannot be reviewed, bisected, or
#    named as the acceptance build afterwards.
if ! git branch -r --contains "$COMMIT" 2>/dev/null | grep -q .; then
  if [[ "${ALLOW_UNPUSHED:-}" == "1" ]]; then
    echo "⚠ $SHORT is on no remote branch. Deploying anyway (ALLOW_UNPUSHED=1)."
  else
    echo "✗ $SHORT is not on any remote branch. Push it first, or set ALLOW_UNPUSHED=1." >&2
    exit 1
  fi
fi

deploy() {
  local service=$1
  echo "→ Deploying $service at $SHORT"
  printf '%s\n' "$COMMIT" > "$STAMP"
  railway up -s "$service" -c
  rm -f "$STAMP"
  echo "✓ $service upload + build finished"
}

# Poll the public probe until it reports the commit we just deployed. This is the point of the whole
# exercise: the deploy is not "done" because a command exited, it is done when the running service
# says which build it is.
verify_web() {
  echo "→ Waiting for $HEALTH_URL to report build=$SHORT"
  for _ in $(seq 1 40); do
    local body
    body=$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)
    if [[ "$body" == *"\"build\":\"$SHORT\""* ]]; then
      echo "✓ web reports build=$SHORT"
      return 0
    fi
    sleep 5
  done
  echo "⚠ web never reported build=$SHORT. Last response: ${body:-<none>}" >&2
  echo "  Check 'railway deployment list -s web' — the rollout may still be in progress." >&2
  return 1
}

# The worker is private and has no HTTP surface, so its boot line is the only readable answer.
verify_worker() {
  echo "→ Waiting for the worker boot log to report build=$SHORT"
  for _ in $(seq 1 40); do
    if railway logs -s worker --lines 200 2>/dev/null | grep -q "build=$SHORT"; then
      echo "✓ worker reports build=$SHORT"
      return 0
    fi
    sleep 5
  done
  echo "⚠ worker never logged build=$SHORT. Check 'railway logs -s worker --lines 200'." >&2
  return 1
}

# A render in flight is the one documented reason not to touch the worker. Durable checkpoints and
# cost-idempotent Retry are the real recovery mechanism, but restarting mid-render still throws away
# paid work that did not have to be thrown away.
confirm_worker_idle() {
  echo "→ Checking the worker for an active render"
  local recent
  recent=$(railway logs -s worker --lines 40 2>/dev/null || true)
  if grep -qE '^\[(pipeline|render)\] (render|generate_|mix_|rank_)' <<<"$recent" &&
    ! grep -qE '(✓ render_qa|render_qa done|✓ render )' <<<"$recent"; then
    echo "⚠ Recent worker logs look like an in-flight pipeline job:" >&2
    grep -E '^\[(pipeline|render)\]' <<<"$recent" | tail -5 >&2
    read -r -p "Deploy the worker anyway? [y/N] " reply
    [[ "$reply" == [yY] ]] || {
      echo "Aborted." >&2
      exit 1
    }
  fi
}

case "$target" in
  web)
    deploy web
    verify_web
    ;;
  worker)
    confirm_worker_idle
    deploy worker
    verify_worker
    ;;
  all)
    # Web first: its pre-deploy runs the migrations the worker may depend on.
    deploy web
    verify_web
    confirm_worker_idle
    deploy worker
    verify_worker
    ;;
esac

echo
echo "Deployed $SHORT to: $target"
echo "Record the canary checks in specs/phase0-deployment.md's canary log."
