---
name: multi-tenancy-checklist
description: The seven tenancy invariants — clear asset ownership, auditable actions, cost-recorded AI generations, credit/plan-limit respect, authorized requests, observability, and workspace-ready design. Run against EVERY new or changed API route, page loader, pipeline step, schema table, or capability — when building it AND when reviewing a diff that touches one.
---

# The seven tenancy invariants

We are multi-tenant on a **per-user model** today: `users` → `channels` (`channels.userId`, the ONLY tenancy edge) → `stories`/`reels`/`compilations` → `scenes`/`assets`/`pipeline_steps`/`publications`. Workspaces come later — the design must leave that door open. Every feature holds all seven of these; check them in order and call out any that fails or doesn't apply.

## 1. Every asset has a clear owner

Every row must answer "which user owns this?" through an **unbroken FK chain to `channels.userId`** (via `channelId` or a deeper FK). A new table that can't reach that column by joins is wrong — fix the schema, don't bolt on ad-hoc ownership.

- New tables: FK to a tenant-owned parent, with an index on the FK.
- Storage: R2 keys stay namespaced under the owning resource (`reels/<id>/...`); client-supplied keys go through `callerMayUseStorageKey` / `reelIdFromKey` ([apps/web/src/lib/api-access.ts](apps/web/src/lib/api-access.ts)) — never trust a raw key.
- Orphan policy: deletes must not strand billable or user-visible rows silently (watch `onDelete` choices).

## 2. Every action is auditable

**Current reality: there is no audit-log table.** The bar today is *attributability*: from the DB + logs you can reconstruct who did what, when.

- Mutations record the actor where the schema allows (`usedByUserId`-style columns, `updatedAt` always touched).
- Pipeline work is auditable automatically **if it runs inside `runStep`** (writes a `pipeline_steps` row: step, status, attempt, error, timestamps).
- Admin/destructive/security-relevant actions (role changes, suspensions, deletes, budget overrides) log actor + target + outcome with an `[audit]` console prefix at minimum.
- If a feature genuinely needs a queryable trail (billing disputes, admin actions on user data), **flag that the audit table gap is now load-bearing** — don't fake it with console logs.

## 3. Every AI generation records usage and cost

Delegate to the **`api-cost-accounting`** skill — its invariant applies verbatim: every paid call returns a `costCents` from a documented rate and reaches `reels.costCents` exactly once, never on a cache hit. Pipeline steps go through `runStep` ([apps/worker/src/pipeline/harness.ts](apps/worker/src/pipeline/harness.ts)); on-demand routes use the atomic `sql` increment. A paid call outside both funnels is a finding.

## 4. Every feature respects credits and plan limits

**Current reality: no plan/credit tables** — "plan limits" today = per-user caps with env-default fallbacks, all in [packages/core/src/types/cost.ts](packages/core/src/types/cost.ts) and [packages/db/src/usage.ts](packages/db/src/usage.ts). New spend paths must hit the existing gates, not reimplement them:

- **Create-time**: `checkUserLimits(usage, limits)` + `MAX_INFLIGHT_REELS_PER_USER` (see [create-reel route](apps/web/src/app/api/pipeline/create-reel/route.ts)).
- **Mid-pipeline**: automatic inside `runStep` (`assertBudget` → `assertUserBudget` → `assertGlobalDailyBudget`).
- **On-demand paid routes**: `requireSpendBudget(user)` from `api-access.ts` BEFORE the paid call.
- Per-user overrides live on `users.monthlyBudgetCents` / `users.dailyReelQuota`; never read caps from anywhere else.
- Abusable/unpaid endpoints still get `checkRateLimit` ([packages/providers/src/shared/redis-limiter.ts](packages/providers/src/shared/redis-limiter.ts)).
- Keep the seam: caps are resolved through `getUserUsage`/`DEFAULT_USER_LIMITS` so future plan tiering swaps in one place.

## 5. Every request is secure and authorized

The middleware cookie check is **not** the security boundary — every API route calls a gate from [apps/web/src/lib/api-access.ts](apps/web/src/lib/api-access.ts) and every page loader one from [apps/web/src/lib/access.ts](apps/web/src/lib/access.ts).

- Route gates: `requireApiUser` / `requireApiAdmin` / `requireChannelOwner` / `requireReelOwner` / `requireStoryOwner` — then `if (gate instanceof NextResponse) return gate`.
- All gates require `status === 'active'`; unauthorized or foreign resources return **404, never 403** (don't confirm another tenant's ids exist).
- List queries scope through `accessibleChannelIds(user)` → `inArray(...)`; never an unscoped `select`.
- Client ids pass `isUuid` before touching a uuid column; every body is zod `safeParse` (reject → 400 with the first issue message).
- Reel mutations respect the state machine (`canTransition`, [packages/core/src/state-machine/reel-state-machine.ts](packages/core/src/state-machine/reel-state-machine.ts)) — no status writes that bypass it.
- Error responses stay generic; internals go to logs, not the client.

## 6. Every new capability is observable through logs and analytics

**Current reality: no structured logger or analytics module** — the convention is `console.log/warn/error` with a `[component]` prefix (e.g. `[harness]`).

- New pipeline steps inherit observability from `runStep` (`pipeline_steps` rows). Anything OUTSIDE the harness logs its own start/failure with the reel/channel id in the message.
- Failures are never swallowed: catch → log with context → rethrow or surface a status the reaper/digest can see.
- Long-running or scheduled work surfaces in the daily digest ([apps/worker/src/digest.ts](apps/worker/src/digest.ts)) or explains why it doesn't need to.
- If a capability's health genuinely can't be judged from prefixed logs + `pipeline_steps` (needs rates, dashboards, alerting), **flag the structured-logging/analytics gap as load-bearing** — don't pretend the convention covers it.

## 7. Every design decision leaves room for workspaces later

`channels.userId` is the single concentrated change point for a future workspace layer. Protect that concentration:

- **Never scatter `userId` onto deep tables** — ownership is derived through the chain, not duplicated.
- Ownership checks go through the existing helpers (`requireChannelOwner`, `accessibleChannelIds`, `userOwnsChannel`), never an inlined `eq(channels.userId, user.id)` in feature code — helpers are where `workspaceId` will slot in.
- Spend/quota aggregation goes through [packages/db/src/usage.ts](packages/db/src/usage.ts) helpers only.
- No ad-hoc per-resource ACLs or role strings; roles stay the flat `users.role` (`admin`|`tester`) until workspaces bring real membership.
- Don't bake "1 user = 1 tenant" into names, URLs, or cache keys in ways that would force a rewrite (e.g. keying by email where an owner id belongs).

## Review checklist (paste into the PR / review notes)

- [ ] **Owner**: every new row/asset reaches `channels.userId` by FK chain; storage keys validated.
- [ ] **Auditable**: actor recorded on mutations; admin/destructive actions logged `[audit]`; audit-table gap flagged if load-bearing.
- [ ] **Cost**: every AI/paid call satisfies `api-cost-accounting` (costCents → `reels.costCents`, once).
- [ ] **Limits**: spend path hits `checkUserLimits` / `runStep` guards / `requireSpendBudget`; abusable endpoints rate-limited.
- [ ] **Authorized**: route/page gate present, active-status enforced, 404-not-403, zod-validated, scoped queries, state machine respected.
- [ ] **Observable**: `[component]`-prefixed logs or `pipeline_steps` coverage; failures surfaced, not swallowed; analytics gap flagged if load-bearing.
- [ ] **Workspace-ready**: ownership via helpers only, no scattered `userId`, no ad-hoc ACLs, caps/usage via the shared helpers.

When reviewing, scan especially for: unscoped `db.select`/`db.update` on tenant tables, routes missing an `api-access` gate, paid calls outside `runStep`/`requireSpendBudget`, inlined `channels.userId` comparisons in feature code, and swallowed catch blocks.
