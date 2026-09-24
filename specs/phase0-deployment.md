# Phase 0 always-on deployment

**Status:** Accepted
**Date:** 2026-09-01
**Decider:** Founder

## Context

The Phase 0 exit gate requires one product-only acceptance lap without the builder acting as an invisible pipeline
stage. A deployment on the founder's Mac cannot satisfy that boundary because closing or sleeping the Mac stops
the web process, queues, worker, scheduler, and metrics polling.

The deployment is internal-only and serves one operator. It must be reliable enough to run a standard short-form
reel and its forced-recovery lap, but it must not introduce Private Alpha or public-launch infrastructure early.

## Decision

Deploy the operator app to one Railway Hobby project in Singapore:

- one public Next.js web service;
- one private `WORKER_ROLE=all` worker, with one replica and one render at a time;
- one private Postgres service with persistent storage and backups;
- one private Redis service used only by BullMQ;
- existing Cloudflare R2 for durable creative assets; and
- `app.kendrix.io` as the stable HTTPS origin after the hosted stack passes its canary checks.

The existing Postgres data is migrated once so Crossroads' channel DNA, production ledger, cost history, and
encrypted publishing grants remain intact. Redis is not migrated: the hosted worker recreates repeatable schedules
against an empty queue, avoiding stale jobs and locks.

Railway service-to-service traffic uses private URLs. Postgres, Redis, the worker, and Bull Board receive no public
domain. The web health endpoint returns only a generic readiness result after Postgres and Redis respond.

Start on Hobby. Set a $30 usage alert and a $50 monthly compute hard limit. Review one measured week before
changing plan or capacity. Pro, multiple replicas, autoscaling, HA, multi-region, worker splitting, and public
launch infrastructure remain deferred.

## Options considered

### Founder Mac plus Cloudflare Tunnel

Lowest direct cost, but invalidated by the founder's availability constraint. It cannot prove unattended operation.

### Railway web, worker, Postgres, and Redis

Matches the existing Next.js + BullMQ topology, provides private networking and an Asia region, and avoids server
administration. Usage-based cost is expected to be roughly $15–25/month during Phase 0.

### Single unmanaged VPS

Potentially cheaper, but shifts database patching, backups, process supervision, TLS, monitoring, and host recovery
onto the solo founder. That saves infrastructure dollars by buying operator work—the wrong trade for this gate.

### Vercel web plus a separate worker host

Rejected for Phase 0. It adds a cross-provider failure boundary and conflicts with the app's existing large upload
routes. Direct-to-R2 upload redesign is not required to prove the current workflow.

## Consequences

- The Mac may be closed without stopping production or schedules.
- Hosting becomes a small recurring business cost; no creative model or quality gate is downgraded.
- The worker image must include FFmpeg, Remotion's pinned browser, and its Linux libraries.
- Deploys must not interrupt an active render. Durable checkpoints and cost-idempotent Retry remain the actual
  recovery mechanism; deployment draining is only a shutdown courtesy.
- The local deployment remains a rollback path only until Railway passes login, health, persistence, render, and
  recovery checks. It does not count as Phase 0 deployment evidence.

## Deploy trigger and build identity

Railway has **no GitHub auto-deploy** on either service. Both are deployed by hand with `railway up -s <service>`
from a clean checkout, which is why `.railwayignore` bounds the upload context. Verified 2026-09-04 from
deployment history: pushing `e3f8c9b` to `main` triggered nothing.

The cost of that is drift, and the drift already happened. On 2026-09-04 `web` was running `fb53e7d` (deployed
09-03 09:58 +08) while `worker` was still running `fa156da` (deployed 09-02 19:06 +08) — so the worker was
missing both the in-product Retry restore for stranded reels (`2096af3`) and the forced-failure boundary
(`6e9ff51`). Arming `FORCE_STEP_FAILURE` against that worker would have read nothing and produced a clean reel
that proved neither criterion 3 nor criterion 4.

`/api/health` used to return only `{"ok": true}`, so nothing on the running stack reported which commit it was —
the same event-versus-state gap the metrics poller taught, one layer out in the infrastructure.

**Build identity is now reported (2026-09-04).** `/api/health` returns `build` and `buildSource` beside `ok`: the
short commit the running **web** service was stamped with, or `unknown`. It never infers one — a value that is not
a plausible SHA reads as unstamped, because a wrong commit would be asserted with the same confidence as a right
one. The worker is private and has no HTTP surface, so it logs `[worker] build=<short> (source=<source>)` on every
boot; `railway logs -s worker` is where the worker's build is read. Resolution order is `BUILD_COMMIT`, then
`RAILWAY_GIT_COMMIT_SHA` (which Railway injects only for GitHub-triggered deploys), then the `/app/.build-commit`
stamp, then `unknown`.

**`scripts/deploy-railway.sh web|worker|all` is now the deploy path.** `railway up` uploads a tarball with no git
context, so a hand deploy could not otherwise say what it was. The script refuses a dirty tree, refuses a commit
that is on no remote branch (`ALLOW_UNPUSHED=1` overrides, loudly), writes the `.build-commit` stamp into the
upload context, deploys web before worker because migrations run from web's pre-deploy command only, asks before
restarting a worker whose recent logs look mid-render, and then polls until the running service reports the commit
it just deployed — a deploy is finished when the service says which build it is, not when a command exits. The
stamp is deliberately untracked **and** unignored: Railway's uploader does not honor `.gitignore`, which is why
`.railwayignore` exists, so an unignored file is the one thing certain to reach the image. It is removed on every
exit path.

**Verified hosted 2026-09-04 by its own first run.** `scripts/deploy-railway.sh all` deployed `d0a0c59` to both
services (web SUCCESS 17:31 +08, worker SUCCESS 17:34 +08) and would not report success until each one said so.
`https://app.kendrix.io/api/health` returns `{"ok":true,"build":"d0a0c59","buildSource":"stamp"}` and the worker
logs `[worker] build=d0a0c59 (source=stamp)`. `buildSource: stamp` is the load-bearing detail: Railway injected no
git metadata, exactly as expected for a `railway up` deploy, so without the stamp both services would have
reported `unknown` and the feature would have been decoration.

**Auto-deploy on `main` remains unmade, and is a founder decision.** It would have prevented the 09-04 drift; it
also means every push to `main` deploys production.

## Canary check log

The five checks that gate removing the Cloudflare Tunnel rollback. Each row records what was actually run, not
what is believed.

| Check | State | Evidence |
| ----- | ----- | -------- |
| `/api/health` returns 200 | **Pass** | External probe 2026-09-03 with Railway edge headers; re-probed 2026-09-09 on `d0a0c59`, body `{"ok":true,"build":"d0a0c59","buildSource":"stamp"}` |
| Operator sign-in and protected-page redirect | **Pass** | Anonymous protections passed on 2026-09-04. On 2026-09-10 the operator completed Google sign-in in Chrome and used the authenticated storyboard through production, review, approval and export |
| Migrated channel / reel / publication / spend totals match | **Pass** | Read-only hosted check 2026-09-09: 1 user / 4 channels / 14 reels / 5 publications; all five publication identities and fields match; spend ledger still exactly 163 rows / 225¢. The one extra hosted reel and reel-cost difference reconcile below |
| One provider-free queue job completes and survives a worker restart | **Pass for durable recovery** | On 2026-09-10 the forced render failure and its committed visual checkpoint survived worker redeploy `d82b8a96-2490-4d27-aba1-d102725b2769`; one UI Retry resumed from the durable track and completed locally/provider-free. The ledger stayed at 786¢. This proves persisted recovery across restart, not automatic pickup of a still-running job |
| R2 reads and writes succeed without exposing credentials | **Pass** | Acceptance reel `b2ce55d3` sourced and read reference pixels, wrote scene images, three motion clips, voice, effects, music, `visual.mp4` and final `render.mp4`, played the final asset in the authenticated UI, and downloaded the post package without exposing credentials |

### Reading the parity check

This check was written as a **migration-time** comparison — step 6 of the data migration, run before accepting the
import. It was not recorded on 2026-09-02, and it can no longer be read as "the two databases match", because
production has legitimately diverged since: a full render completed hosted, the metrics poll has been writing
snapshots, and `trending_refresh` has spent. Equal counts would now be the *wrong* result.

What is still worth verifying is that the migration lost and corrupted nothing: the publication history, the
channels, and the recorded costs of the paid reels should all still be present in the hosted database with the
same values. Judge the check against that, and do not mark it pass on equal totals.

The local baseline, captured 2026-09-04 from `reels_dev` (read-only):

| | Local (`reels_dev`) |
| - | - |
| users / channels / reels | 1 / 4 / 13 |
| publications (all `published`, all `yt`, all disclosure applied) | 5 — `RRvU0b1TFAc` (08-11), `6gcyx9bK2mE` (08-24), `DTi3ZhEuPpk` (08-26), `xIeZIn46B_o` (08-29), `WCRkYws2Kho` (09-01) |
| `sum(reels.cost_cents)` | 6050 (\$60.50) |
| `spend_events` rows / `sum(cost_cents)` | 163 / 225 (\$2.25) |
| paid Crossroads reels, cents | 1063, 932, 793, 683, 670, 521, 10, 9 |

The hosted side was captured read-only on 2026-09-09:

| | Hosted production |
| - | - |
| users / channels / reels | 1 / 4 / 14 |
| publications | The same five YouTube IDs, dates, `published` statuses and disclosure flags as the local baseline |
| `sum(reels.cost_cents)` | 6734 (\$67.34) |
| `spend_events` rows / `sum(cost_cents)` | 163 / 225 (\$2.25) |

The apparent 28¢ mismatch is post-migration divergence, not corruption. Production has the expected hosted-only
reel `a0b521b1` at 712¢. Removing it leaves 6022¢, while the later local snapshot is 6050¢. The difference is
reel `38f08fcf`: production holds 655¢ with `updated_at` 2026-08-24, before the 2026-09-02 migration, while the
2026-09-04 local snapshot records 683¢. The extra 28¢ was therefore added only to the local copy after the two
databases split. Production preserved the older imported value. No migrated publication, channel, user or spend
event is missing, and the one extra hosted reel is the known hosted render.

The query used for the hosted side was:

```sql
select (select count(*) from users) as users,
       (select count(*) from channels) as channels,
       (select count(*) from reels) as reels,
       (select count(*) from publications) as publications,
       (select coalesce(sum(cost_cents),0) from reels) as reel_cents,
       (select count(*) from spend_events) as spend_rows,
       (select coalesce(sum(cost_cents),0) from spend_events) as spend_cents;

select platform, platform_post_id, status, disclosure_applied,
       to_char(published_at,'YYYY-MM-DD') as published
from publications order by published_at;
```

**Unverified observation, not a finding:** locally `sum(reels.cost_cents)` is \$60.50 while `sum(spend_events.cost_cents)`
is \$2.25 across 163 rows. The two are not required to agree — the ledger post-dates most of that spend — but the
gap is large enough to be worth one deliberate look before per-reel unit economics are used for pricing.

The remaining checks land naturally in the acceptance reel rather than as separate ceremonies: the
acceptance reel signs in, writes and reads R2 for every image, audio file and render, and drives the queue end to
end, so three of the five are lap outputs. The stronger reading of queue survival (a job in flight when the
process dies, resuming from durable work) is exactly what the forced-recovery lap demonstrates; it does not need
its own separate test. The parity read was the only standalone remainder, and it passed on 2026-09-09.

Hosted behavior observed 2026-09-04 from worker logs, recorded because it is evidence either way:

- The scheduled metrics poll runs hosted (`refreshed 4 video(s) across 1 channel(s)`), so the audience instrument
  no longer depends on the founder's Mac being awake.
- A full render completed hosted (reel `a0b521b1`): cached visual reused, audio re-muxed, uploaded, `render_qa`
  passed on bed presence and ending music.
- `trending_refresh` spends autonomously on the hosted worker — 2¢ on 2026-09-03.
- Every hosted render re-bundles from scratch: `EACCES: permission denied, mkdir
  '/app/packages/render/node_modules/.cache'`. Not fatal, pure waste on every render, unfixed.

## Rollback

Before import, keep an encrypted local database dump and leave the existing local database untouched. If the hosted
canary fails before DNS cutover, keep `app.kendrix.io` on the local tunnel while fixing or deleting the new Railway
services. After DNS cutover, roll back the web route only if health, sign-in, storage access, or queue processing
fails. Database migrations remain additive and replay-safe; never attempt a destructive schema rollback.

## Review triggers

Revisit the plan or topology when measured usage exceeds Hobby limits, before Private Alpha, when one worker can no
longer meet the production schedule, or when 30-day logs/support/availability materially change creator success.
