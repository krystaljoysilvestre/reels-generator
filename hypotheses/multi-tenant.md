# Hypothesis: Multi-tenancy — a trigger, not an architecture

Status: **partially overridden by owner decision (2026-07-21).** The original deferral (below) stood until the owner chose to build production auth + the app-layer tenant boundary ahead of the trigger — now committed: Auth.js v5 accounts (Google SSO + email/password), open-signup-with-admin-approval + invite links, `channels.userId` (migration `0040`), and an `/admin` console. What was **not** built, and what the deferral's cost/quota reasoning still rightly warns about, is the **job-tier scaling** (per-tenant fairness, enforced budgets/quotas, provider-throttle-under-scale) — that moved to [scaling-concurrent-users.md](scaling-concurrent-users.md). The trigger analysis below is preserved as the record of *why* deferral was the default and what the owner traded away by overriding it.

Original status (for the record): **hypothesis, written down** — NOT committed architecture. Nothing multi-tenant exists or should be built yet: no auth, no users/orgs tables, no per-tenant isolation, quotas, or billing. · Owner: PM · Eng: senior

> This document's job is the **inverse** of its siblings. The others (Evidence Bible, Narrative Planning Grammar) argue *for* a new responsibility. This one exists to **name a build we keep being tempted into and to hold it off until specific conditions fire** — and to record the cheap discipline that keeps the eventual build small. Leave implementation completely untouched. If you are reading this because "we should probably add users while we're in here," the answer is in [The trigger](#the-trigger).

## Why now — a recurring temptation, not a failure

Every other hypothesis in this tier emerged from a *product failure no existing layer caught*. This one is different, and the difference is the point: multi-tenancy has produced **no failure** — it is a **recurring pull** ("let other people test channel creation → render", "productize"), and pulls that feel obviously-right are exactly the ones that get built before they're earned. Three standing observations:

- **The engine is single-operator by design and nothing hurts for it.** ROADMAP is explicit: *"we run it ourselves first on our own Filipino-horror channel(s)… and productize as SaaS only after a channel proves traction. Model today: one operator, multiple channels."* The dashboard is one operator's channel portfolio. Nothing in the current product is blocked on tenancy.
- **The honest readiness state is "unproven loop."** We have not yet run **one** channel hands-off, profitably, with real published output and a quality bar we trust. Our own evidence points the other way — the fingerprint audit failed 12/12 on believability, and the final gate is still *advisory* (it ships to human review regardless). Inviting external testers into that flow would have them judge output that fails our own bar, spending first impressions we don't get back.
- **The cost surface is real and per-tenant.** Every reel burns metered OpenAI / fal / ElevenLabs spend. Multi-tenant *without* metering and quotas is an uncapped bill on strangers' usage — which collides head-on with being cost-conscious. So "just let people in" is never actually just auth; it's auth **plus** isolation **plus** quotas **plus** billing.

The one genuinely load-bearing fact in our favor: **everything already roots at `channels`** ([schema.ts](packages/db/src/schema.ts) — `stories`, `reels`, `pipeline_steps`, `publications`, `metrics` all key off `channel_id`). The future tenant boundary is a `users → channels` layer *above* the existing root, not a rewrite. That is precisely why deferring costs us almost nothing — and why the temptation to "do it now while it's easy" is a trap: it will be roughly as easy later, and later we'll know what a real second tenant actually needs.

## The trigger

Build multi-tenancy only when **all three** hold. Two are *readiness*; one is *demand*. Both kinds are required — readiness without demand means keep operating; demand without readiness means say "not yet, here's when."

1. **The gate has teeth and holds.** The final story gate has been flipped from advisory to enforcing (regenerate-until-pass, cap 3 — the ratified minimal-review gate policy) **and** first-attempt pass rate holds **~60%** over a real sample (**n ≥ 20** gated stories in the window). This is the machine-checkable one: [`apps/worker/scripts/gate-pass-rate.ts`](apps/worker/scripts/gate-pass-rate.ts) reports it and prints `60% FLIP TRIGGER: MET / NOT MET`. Rationale: a paying tenant cannot hand-review every story; "gate with teeth" *is* the multi-tenant quality prerequisite in disguise.
2. **One channel runs hands-off for weeks.** A single owner-operated channel has produced real, published output on a schedule with minimal intervention — the *operations* loop proven, not just the generation loop. This is the judgment call; the artifact is a real channel with a real posting history, not a probe.
3. **External pull exists.** A real person outside the team asks to run *their* channel on it. Demand is a signal, not a plan — but building isolation/billing before a real second tenant defines their needs is how those systems rot.

Falsification of the *deferral* (i.e. what would make building it correct): all three fire. Falsification of the *hypothesis itself*: see the death path.

## Cheap hygiene meanwhile — the only part to act on now

These are near-free, are good architecture regardless of whether the trigger ever fires, and are the *only* seams worth building ahead of demand. They keep the eventual retrofit small:

- **Everything stays channel-scoped.** No cross-channel shared state, caches, or config. A new feature that reaches across channels, or stores state keyed on nothing, is the thing to flag in review — it's a future tenant leak.
- **Per-reel cost accounting stays intact.** `reels.costCents` accumulated through `runStep`, per the api-cost-accounting invariant, **is the future pricing model.** Never let a paid call escape it. This is the seam that turns "a tenant used the product" into "a tenant owes this much" for free.
- **No global singletons that assume one tenant.** Module-level mutable state, env-as-the-single-channel's-config, one hard-coded operator identity — each is a small assumption that's cheap to avoid now and expensive to unwind under a second tenant.

That's the whole to-do list this document authorizes: *keep the discipline, build nothing.*

## Non-goals

> This hypothesis does **not** design auth, orgs, roles, data isolation, per-tenant quotas, billing, or hosting — and takes no position on how any of them should work. It does **not** own the 60% gate-teeth policy (that belongs to the gate's own ratified plan; this doc only *consumes* the metric as a readiness signal). It does **not** cover letting a trusted human try the flow in a supervised session (that's a shared password on the single-tenant app — an ops choice, not tenancy, and it needs none of this). It **does not drive implementation.**

## Strongest known objection

*(Required section — the doc states its own best counter-argument.)*

**"Trigger conditions are lagging. By the time external pull arrives, retrofitting auth/billing/isolation under demand pressure is expensive — so build the seams now."** The honest answer, held to the same rigor: the *seams* are already covered — they are the three hygiene rules, and they're cheap precisely because they're discipline, not code. The *expensive* parts (auth, billing, data isolation) are exactly the parts that must **not** be built ahead of a real second tenant, because a tenant you're imagining specifies those systems wrong — you build role models nobody needs, a billing schema that doesn't match the plan you'll actually sell, isolation guarantees for threats that don't apply. Speculative isolation code rots faster than it saves. The channel-rooted schema means the mechanical retrofit is genuinely modest; the design risk, not the wiring, is what's costly, and design risk only resolves against a real customer.

There is a sharper, opposite objection this doc must also hold: **maybe the business is owner-operated forever, and even this trigger doc is over-thinking.** That's plausible — and it's fine. The hygiene rules pay for themselves as clean architecture even if SaaS never ships, and this document exists precisely so the "should we add multi-tenancy?" conversation resolves in thirty seconds by pointing at three conditions, instead of being re-litigated from scratch each time the pull returns. A cheap doc that prevents an expensive premature build is worth its length even if the build never happens.

## Death path

Retire to `hypotheses/retired/` (with a one-paragraph *why it died* + the deciding evidence, per the tier convention) if either: (a) the owner commits to owner-operated-as-the-business, making the trigger moot; or (b) all three conditions fire, the build decision is made, and multi-tenancy graduates to `/specs` — at which point this doc has done its job and the spec supersedes it.

Related: minimal-review gate policy · [`gate-pass-rate.ts`](apps/worker/scripts/gate-pass-rate.ts) · [audio-tiers.md](specs/audio-tiers.md) (the "single-operator auth, no users/orgs tables yet" status this doc formalizes the *when* for) · [ROADMAP.md](ROADMAP.md) · [Kendrix Constitution](ARCHITECTURE.md).
