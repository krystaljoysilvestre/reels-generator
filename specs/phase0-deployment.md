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

## Rollback

Before import, keep an encrypted local database dump and leave the existing local database untouched. If the hosted
canary fails before DNS cutover, keep `app.kendrix.io` on the local tunnel while fixing or deleting the new Railway
services. After DNS cutover, roll back the web route only if health, sign-in, storage access, or queue processing
fails. Database migrations remain additive and replay-safe; never attempt a destructive schema rollback.

## Review triggers

Revisit the plan or topology when measured usage exceeds Hobby limits, before Private Alpha, when one worker can no
longer meet the production schedule, or when 30-day logs/support/availability materially change creator success.
