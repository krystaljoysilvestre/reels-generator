# Hypothesis: Scaling to concurrent users — a phased job system, not a bigger box

Status: **hypothesis, written down** — NOT committed architecture. Nothing here is built. The app-layer tenancy it builds on (auth + `channels.userId`) *is* committed (see [multi-tenant.md](multi-tenant.md) update note); this doc concerns the **async pipeline tier** underneath it. · Owner: PM · Eng: senior

> Sibling to [multi-tenant.md](multi-tenant.md), one layer down. That doc answered *"should we let other people in?"* (deferral, since overridden by owner decision — app-layer tenancy is now built). This one answers *"once many of them are in, how does the work get done?"* Like its sibling it is **the inverse of the narrative hypotheses**: it names bottlenecks and a target shape, and holds each piece off behind a measurable trigger so we scale on evidence, not fear. Leave implementation untouched.

## The reframe (the load-bearing idea)

"Concurrent users" splits into two workloads with opposite economics, and conflating them is the mistake to avoid:

- **Interactive web tier** (login, dashboards, storyboard editing, reads): request/response, sub-second, cheap. Already **stateless** — JWT sessions ([auth.ts](apps/web/src/auth.ts)), stateless Next.js. Scales horizontally behind a load balancer with essentially no design work. *This is not the problem.*
- **Async pipeline tier** (generate → images → TTS → render): minutes-long, **costs real provider money per job**, resource-heavy. This is a **job system**, and for a generation product "handle concurrent users" means **fair, reliable, cost-bounded throughput** — not instant results. The product is already async (review gates, spot-check), so the UX contract — *"your reel is being made; we'll notify you"* — already fits. **Scale the queue, not the latency.**

Everything below is about the second tier.

## Why now — five bottlenecks observed in the current code (not intuition)

1. **One worker, one queue, global `concurrency = 2`.** [apps/worker/src/index.ts](apps/worker/src/index.ts) runs a single PIPELINE worker at concurrency 2; *every* step class — story generation, images, TTS, and **render** — flows through it. So at most two operations run at once across **all users combined**, and a multi-minute render occupies a slot a 10-second generation needs. Head-of-line blocking is the first thing to fail under concurrency.
2. **The provider throttle is in-process, so it silently breaks the moment you scale out.** [packages/providers/src/shared/limiter.ts](packages/providers/src/shared/limiter.ts) is a module-level semaphore (openai 8 / anthropic 4 / elevenlabs 4 / fal 4). Run *N* worker processes and effective concurrency becomes *N × cap* — blowing past provider rate limits and, worse, past spend controls, with no error until the provider 429s or the bill arrives. This is a **correctness prerequisite** for horizontal scale, not a tuning knob.
3. **The distributed-throttle seam already exists but is inert.** [apps/worker/src/queues/index.ts](apps/worker/src/queues/index.ts) defines per-provider BullMQ queues with Redis rate-limiters (`FAL_VIDEO: max 5/min`, etc.), but provider calls run in-process inside steps and are never enqueued to them, so the limiters do nothing. The intended design — route provider calls through Redis-backed queues for a *true global* cap across a worker fleet — is half-present and unwired.
4. **No fairness and no quotas.** Global FIFO means one power user (or one runaway `auto-produce` channel) monopolizes throughput; and every job spends metered OpenAI/fal/ElevenLabs money with **no per-user budget**. `reels.costCents` is accrued faithfully ([harness.ts](apps/worker/src/pipeline/harness.ts)) but only ever **reported**, never **enforced**. Concurrent users = concurrent, unbounded spend.
5. **The scheduler is a single global worker at `concurrency = 1`.** Auto-produce + digest + metrics-poll ([index.ts](apps/worker/src/index.ts)) run on one worker across all channels — fine for a handful, unable to keep up across thousands, and a single point of failure for all background cadence.

The fact in our favor (same as its sibling): **everything roots at `channels`, and `channels.userId` now exists** (committed 2026-07-21). The tenant boundary that makes per-user fairness, quotas, and billing *possible* is already in the schema — this doc is about teaching the **job system** to respect it.

## Target architecture (what "scaled" looks like)

- **Split the pipeline into queues by workload class** — a generation queue (IO/provider-bound, high concurrency), an audio queue, and a **render queue** (CPU/RAM-bound, low concurrency), each with its own worker pool sized to its resource + provider profile. Kills head-of-line blocking; lets render churn without starving quick generations.
- **Horizontal, elastic workers** — BullMQ + Redis is built for many worker processes across many machines pulling shared queues; autoscale the render pool on queue depth. This is *the* throughput lever, and it is why (2) must be fixed first.
- **Distributed provider throttling** — activate the inert per-provider queues/limiters (or a Redis token-bucket) so the global in-flight cap holds across the whole fleet, replacing the per-process semaphore.
- **Per-user fairness + quotas** — weighted or round-robin scheduling across tenants so none starves the others, plus plan-based caps (e.g. N reels/day). Enabled by `channels.userId`.
- **Enforced cost governance** — per-user budgets with hard cutoffs, global spend monitoring + a kill-switch, built on the existing `costCents` accrual. For a generation SaaS this is the **first-order scaling risk** — provider spend and provider rate limits become the ceiling long before CPUs do.
- **Render as its own fleet — or serverless** — Remotion + `ffmpeg` ([render-step.ts](apps/worker/src/pipeline/steps/render-step.ts)) is CPU/RAM-bound and shouldn't share a box with the API at scale. Options: a dedicated autoscaled render fleet, or **Remotion Lambda** (scales per-render, pay-per-render — ideal for spiky concurrent render load without provisioning for peak).
- **Data tier** — PgBouncer once web+worker instance counts multiply (the pool is `max: 10` *per process* in [client.ts](packages/db/src/client.ts); processes × pool exhausts Postgres connections fast); read replicas later. R2 object storage already scales; add a CDN for delivery.

## Adoption thresholds — build each piece only when its trigger fires

This tier's bar is *"the engine is blocked without it."* Each piece below states the measurable signal that blocks progress without it, so we scale on evidence and don't over-provision (owner is cost-conscious):

| Piece | Build when… |
|---|---|
| Enforced per-user budgets/quotas | **the first non-team user** can self-serve generation (cost safety gate — near-term, precedes real testers spending money) |
| Distributed provider limiter | **the day before** a 2nd worker process runs (correctness prerequisite — (2) breaks silently otherwise) |
| Dedicated render queue/worker | render wait starves interactive generation — sustained non-render queue wait while a render holds a slot |
| Horizontal worker autoscale | p95 job wait exceeds target under real load, or sustained queue depth > threshold |
| Per-user fair scheduling | one tenant's backlog measurably delays others (starvation observed) |
| PgBouncer | live Postgres connection count approaches its max (processes × pool) |
| Render fleet / Remotion Lambda | render CPU is saturated / render throughput is the binding ceiling |

**Calibration inputs still needed from the owner** (these set the threshold *numbers* above, and the single-box-vs-fleet-vs-serverless choice): target concurrent users, renders/day at launch and at 6-month horizon, and a monthly provider-spend ceiling. Until provided, thresholds are relative, not absolute.

## Non-goals

> This hypothesis does **not** design the billing system, the pricing plans, auth/roles (those are built or belong elsewhere), or a specific cloud vendor/orchestrator. It does **not** own the tenant *data model* (that's `channels.userId`, already committed). It does **not** mandate microservices — the target is the *same* monolith-plus-workers, scaled out, not a rewrite. It **does not drive implementation**; each row above graduates to `/specs` (then code) only when its trigger fires.

## Strongest known objection

*(Required — the doc's own best counter-argument, held to the same rigor.)*

**"Two of these — the distributed limiter and enforced budgets — aren't 'scale later,' they're latent bugs you should fix now, so the trigger framing is a dodge that ships a known footgun."** Conceded, and it's the most important thing in the doc: those two are marked **near-term / prerequisite precisely because they are correctness and cost-safety issues, not throughput luxuries.** The in-process semaphore is safe *today* only because there is exactly one worker process; the moment anyone scales workers or admits a spending stranger, it is wrong. So the honest position is not "defer everything" but "**the throughput pieces are demand-gated; the safety pieces are gates on specific unsafe actions** (2nd worker, 1st paying user)" — and naming which is which is the doc's main job.

The opposite objection also holds: **maybe this never needs most of the table — the business could stay a handful of owner-run channels, and building a render fleet would be the classic premature-scale mistake.** True, and that's why every row is trigger-gated rather than scheduled. The doc's value even in that world is that the "how do we handle load?" conversation resolves against a table of measurable signals instead of being re-argued from vibes each time traffic ticks up.

## Death path

Retire to `hypotheses/retired/` (with *why it died* + evidence) if: (a) the owner commits to owner-operated / low-fixed-scale as the business, making horizontal scale moot (the two safety items would then fold into ops hygiene, not this doc); or (b) the pieces graduate individually to `/specs` as their triggers fire — at which point the graduated rows leave this doc and the spec supersedes them. Partial graduation is expected and healthy; the doc shrinks as reality claims each row.

Related: [multi-tenant.md](multi-tenant.md) (the tenancy predecessor) · [`limiter.ts`](packages/providers/src/shared/limiter.ts) · [`queues/index.ts`](apps/worker/src/queues/index.ts) · [`harness.ts`](apps/worker/src/pipeline/harness.ts) (cost accrual = the enforcement seam) · ROADMAP.md · [Kendrix Constitution](ARCHITECTURE.md).
