# Multi-tenancy hardening — status & roadmap

Status of the tenant-safety work and the deliberately-deferred remainder. Written 2026-07-21 after the
P0/P1/P2-liveness sweep landed on `main` (commits `93d2592`…`27da63b`).

## Context

Multi-tenancy (users, `channels.userId`, per-user caps) was added in migrations 0040–0041. The data model
and the page layer enforced ownership, but the **API layer and the cost/ops layers had not caught up**. A
full-app audit found systemic broken access control plus cost-runaway and liveness gaps. This roadmap
records what was fixed and what remains.

## Shipped (on `main`)

| Area | Fix |
|---|---|
| **Tenant isolation** | `lib/api-access.ts` gates (`requireApiUser` / `require{Reel,Channel,Story}Owner`, admin bypass, uuid-guard, 404-hides-existence) applied to all ~47 API routes; `/api/asset` authorizes by key; `callerMayUseStorageKey` blocks client keys pointing at another tenant's `reels/` object; coarse cookie pre-filter middleware. |
| **Account gating** | Every API gate requires `status === 'active'` (pending/suspended can no longer drive the API on a valid JWT). Invite email-binding enforced + single-use made atomic. Register/sign-in rate-limited. `AUTH_SECRET` documented. |
| **Cost safety** | Global daily spend kill-switch (`GLOBAL_DAILY_SPEND_CAP_CENTS`, default off). Per-user monthly budget enforced **mid-pipeline** (terminal) + in-flight reel concurrency cap. Partial-failure cost capture (the harness cost sink persists spend on failure too, so the budget stops under-counting). |
| **Pipeline liveness** | Per-step job timeout frees the BullMQ slot on a hung call (instead of parking it forever and starving tenants); boot-time reaper recovers reels a dead worker left `running`. |

Each unit was typecheck + lint clean and live-smoke-tested.

## Deferred — architecture (needs a design decision, NOT to be bolted on blind)

Ordered by recommended priority. Each is genuinely architectural; per the repo's evidence-first / RFC
convention these should be designed + reviewed before implementation, not merged autonomously.

### 1. Postgres RLS backstop  — highest defense-in-depth value, highest retrofit risk
Make the database refuse cross-tenant rows even if an app query forgets its ownership filter — the "belt"
under the app-layer "suspenders" that would have neutralized the entire P0 IDOR class.
**Non-obvious gotchas a future implementer must handle:**
- The app connects as a role that likely **owns** the tables (or is superuser in dev) → RLS is **bypassed**
  unless you either connect as a non-owner role or `ALTER TABLE … FORCE ROW LEVEL SECURITY`.
- Ownership lives only on `channels.userId`; child tables (reels/scenes/assets/…) have no `userId`, so their
  policies need a subquery join to `channels` — watch the per-query cost and add supporting indexes.
- The current tenant must be set per request/transaction (`SET LOCAL app.user_id = …`) — but the app uses a
  **pooled** `postgres-js` connection (`max: 10`), so the var must be set inside each transaction, never
  once per connection, or a pooled connection leaks one tenant's context into another's query.
- Admins need a bypass path; background workers (no user context) need a service path.
**Recommendation:** RFC + staged rollout (policies in `permissive`/log-only first), not a big-bang migration.

### 2. Per-call idempotency to *prevent* retry re-bill
Today a retried step re-runs its paid provider calls. The cost-capture fix makes this **accounted for**
(the budget sees the real spend), but doesn't prevent the double charge. Prevention = cache each paid
call's result keyed by a hash of its inputs (provider + model + prompt/params) and reuse it on retry.
Touches the provider layer; medium effort. Value is bounded because deterministic 4xx is already terminal
(no retry) — only transient (429/5xx/network) retries re-bill.

### 3. Queue tenant-fairness (noisy-neighbor)
The pipeline queue is a single FIFO; one tenant's burst can dominate the worker slots. **Largely mitigated**
by the P1 in-flight reel cap (a tenant can have ≤ N reels building), so this is lower priority now. Full
weighted-fair scheduling needs jobs keyed by tenant + a fair dispatcher (BullMQ groups are a Pro feature) —
a real project for marginal added benefit given the cap.

### 4. Per-token cost ledger
LLM token counts are computed then discarded into a lump `costCents`. A per-call ledger (new table: provider,
model, input/output tokens, reel/channel, cost) enables per-model/per-tenant analytics and future usage-based
pricing. New subsystem; not urgent for correctness.

### 5. Per-provider AbortSignal timeouts
The liveness job-timeout frees the worker slot but (via `Promise.race`) can't cancel the underlying hung
call, which lingers until its socket errors. Adding real deadlines to the LLM + ElevenLabs + ffmpeg calls
(fal already has them) would cancel the work outright. Low-risk with generous values; a natural completion
of the liveness work.

## Not worth doing (acceptable permanent states)

- **DB-verify ownership for avatar/upload keys** — these are random-UUID keys that no longer leak after the
  P0 metadata-IDOR fixes, so guessing one is infeasible; the current "any active user" rule on non-`reels/`
  keys is fine. (Revisit only if these keys ever become enumerable.)
- **Split-config `authorized` middleware** — the per-route gates already fully enforce auth + ownership; a
  cryptographic middleware would be redundant. The current coarse cookie pre-filter is adequate defense-in-depth.
