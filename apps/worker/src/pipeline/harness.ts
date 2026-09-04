import { eq, and, sql } from 'drizzle-orm'
import { getDb, getGlobalSpendTodayCents, getReelOwnerUsage } from '@reels/db'
import { pipelineSteps, reels, channels } from '@reels/db'
import { spendFromError } from '@reels/providers'
import {
  assertBudget,
  assertGlobalDailyBudget,
  assertUserBudget,
  GLOBAL_DAILY_SPEND_CAP_CENTS,
  budgetCapForSeconds,
  DEFAULT_USER_LIMITS,
  canTransition,
  type PipelineStepName,
  type ReelStatus,
} from '@reels/core'
import { hasFailedAttemptForStep } from './failure-record.js'

// Worker harness — every pipeline step calls runStep() instead of doing raw DB work.
// Guarantees:
//   1. Idempotency: same inputHash = skip, return cached output (never re-run paid steps)
//   2. Cost accumulation: atomically adds costCents to reels.costCents after each step
//   3. Budget enforcement: throws BudgetExceededError before calling the provider
//   4. Status tracking: pipeline_steps row written before + after the step fn

export interface StepContext {
  reelId: string
  stepName: PipelineStepName
  inputHash: string
  budgetCap?: number  // cents; defaults to short reel cap
  // False only for deterministic/local work that cannot create provider spend (timings, mix, render,
  // render QA). Those steps must be allowed to finish a reel that has legitimately reached its cap.
  spendsProviderMoney?: boolean
}

export interface StepResult<T> {
  output: T
  costCents: number
  skipped: boolean   // true = idempotency hit, output from cache
}

// A step reports each paid provider call through this sink (cost.add(cents)) the moment it's incurred.
// runStep persists the accrued total on BOTH success and failure, so cost spent before a mid-step throw
// isn't lost — otherwise the budget under-counts real money and its caps under-enforce. `total` is the
// authoritative sum a step returns as its costCents. Steps that don't use the sink behave exactly as
// before (accrued stays 0; nothing extra persisted on failure).
export interface CostSink {
  add: (cents: number) => void
  readonly total: number
}

export async function runStep<T>(
  ctx: StepContext,
  fn: (cost: CostSink) => Promise<{ output: T; costCents: number }>,
): Promise<StepResult<T>> {
  const db = getDb()
  let accrued = 0
  const cost: CostSink = { add: (c) => { if (c > 0) accrued += c }, get total() { return accrued } }

  // ── 1. Check idempotency (same inputHash already done → return cached) ─────
  const existing = await db.query.pipelineSteps.findFirst({
    where: and(
      eq(pipelineSteps.reelId, ctx.reelId),
      eq(pipelineSteps.stepName, ctx.stepName),
    ),
  })

  if (existing?.status === 'done' && existing.inputHash === ctx.inputHash) {
    return {
      output: existing.output as T,
      costCents: 0,  // already paid
      skipped: true,
    }
  }

  // ── 2. Budget pre-check (fail before spending) ────────────────────────────
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, ctx.reelId) })
  if (!reel) throw new Error(`Reel not found: ${ctx.reelId}`)
  // Per-reel cap: an explicit ctx.budgetCap wins; otherwise scale by the channel's reel length so a
  // long-form or all-animated reel gets proportionate headroom (a flat $8 stranded an 85s animated reel
  // one scene short — 2026-07-24). Still a bounded runaway-spend backstop (budgetCapForSeconds caps it).
  if (ctx.spendsProviderMoney !== false) {
    let cap = ctx.budgetCap
    if (cap == null) {
      const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId), columns: { targetSeconds: true } })
      cap = budgetCapForSeconds(channel?.targetSeconds)
    }
    assertBudget(ctx.reelId, reel.costCents, cap)

    // Per-user monthly budget (mid-pipeline). The create-time gate is lagging — a burst of creates all
    // pass at $0, then accrue in parallel past the cap. Re-check the owner's month-to-date spend before
    // each paid step; terminal once reached, so the owner's remaining in-flight reels stop too. Admins are
    // exempt; owner-less legacy reels (null owner) return null and skip the check.
    const owner = await getReelOwnerUsage(ctx.reelId)
    if (owner && owner.role !== 'admin') {
      assertUserBudget(owner.spendCentsThisMonth, owner.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents)
    }

    // App-wide daily kill-switch (backstop across all tenants). Only queries when a cap is configured, so
    // it's free in the default (off) case. Terminal when tripped — halts rather than retry-spinning.
    if (GLOBAL_DAILY_SPEND_CAP_CENTS !== null) {
      assertGlobalDailyBudget(await getGlobalSpendTodayCents())
    }
  }

  // ── 3. Mark step running ──────────────────────────────────────────────────
  const attempt = (existing?.attempt ?? 0) + 1
  await db
    .insert(pipelineSteps)
    .values({
      reelId: ctx.reelId,
      stepName: ctx.stepName,
      status: 'running',
      attempt,
      inputHash: ctx.inputHash,
      startedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pipelineSteps.reelId, pipelineSteps.stepName],
      set: { status: 'running', attempt, inputHash: ctx.inputHash, startedAt: new Date(), error: null },
    })

  // ── 4. Execute ────────────────────────────────────────────────────────────
  try {
    const { output, costCents } = await fn(cost)

    // ── 5. Write output + accumulate cost atomically ──────────────────────
    await db.transaction(async (tx) => {
      await tx
        .update(pipelineSteps)
        .set({
          status: 'done',
          output: output as Record<string, unknown>,
          // ACCUMULATE, don't overwrite: reels.costCents counts every attempt's real spend, so a retry
          // that follows a partially-paid failure must leave the two figures agreeing. Same atomic-SQL
          // reason as the reel increment below — fan-out steps run concurrently.
          costCents: sql`${pipelineSteps.costCents} + ${costCents}`,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(pipelineSteps.reelId, ctx.reelId),
            eq(pipelineSteps.stepName, ctx.stepName),
          ),
        )

      if (costCents > 0) {
        // Atomic SQL increment (not reel.costCents + costCents): generate_images / animate_scenes fan out
        // many concurrent runSteps, so a read-modify-write against the value read at step start would drop
        // paid spend under last-write-wins — and understate the total the budget gate enforces against.
        await tx
          .update(reels)
          .set({ costCents: sql`${reels.costCents} + ${costCents}`, updatedAt: new Date() })
          .where(eq(reels.id, ctx.reelId))
      }
    })

    return { output, costCents, skipped: false }
  } catch (err) {
    // Persist any spend that landed BEFORE the throw. Two sources: the cost sink (what the step itself
    // reported) and the error, for providers that paid for one or more calls and THEN failed — llmCall's
    // schema-repair path bills two completions, the TTS chunk loop bills the chunks that succeeded — and
    // carry those cents out on the error because a throw has no return value (see attachSpend). Together
    // they make reels.costCents reflect money actually spent, incl. across retries, so the budget gates
    // enforce against reality. Best-effort: a bookkeeping failure here must not mask the real step error.
    const unreturned = accrued + spendFromError(err)
    if (unreturned > 0) {
      try {
        await db
          .update(reels)
          .set({ costCents: sql`${reels.costCents} + ${unreturned}`, updatedAt: new Date() })
          .where(eq(reels.id, ctx.reelId))
      } catch (costErr) {
        console.error(`[harness] failed to record partial cost for ${ctx.reelId}/${ctx.stepName}:`, costErr)
      }
    }

    // Mark step failed; worker BullMQ retry logic handles re-queueing.
    // The partial spend lands on the STEP row too, not just the reel — a step that paid and then threw is
    // exactly the case per-step attribution exists to expose. Omitting it here would make an expensive
    // failure look free and leave the two figures disagreeing by the amount that most deserves attention.
    await db
      .update(pipelineSteps)
      .set({
        status: 'failed',
        error: String(err),
        ...(unreturned > 0 ? { costCents: sql`${pipelineSteps.costCents} + ${unreturned}` } : {}),
        finishedAt: new Date(),
      })
      .where(
        and(
          eq(pipelineSteps.reelId, ctx.reelId),
          eq(pipelineSteps.stepName, ctx.stepName),
        ),
      )
    throw err
  }
}

// Transition reel status and update updatedAt
export async function setReelStatus(
  reelId: string,
  status: string,
): Promise<void> {
  const db = getDb()
  await db.update(reels).set({ status: status as never, updatedAt: new Date() }).where(eq(reels.id, reelId))
}

// Mark a reel permanently failed (called when BullMQ retries are exhausted) so it surfaces in the UI
// instead of silently stalling. Also ensures a 'failed' pipeline_steps row exists for the step — the
// harness already writes one for failures INSIDE runStep (with a richer error); this covers failures
// that throw BEFORE runStep (e.g. validation), so the storyboard banner + retry always have data.
export async function markReelFailed(reelId: string, stepName: string, error: string): Promise<void> {
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { status: true } })
  if (!reel) return
  // Never illegally regress a reel that already moved past the pipeline (approved/scheduled→published) or
  // was rejected: a late/duplicate/exhausted job must not flip a terminal-ish reel back to 'failed'. The
  // state machine is the authority on which current statuses may transition to 'failed'.
  if (!canTransition(reel.status as ReelStatus, 'failed')) {
    console.warn(`[harness] skip markReelFailed ${reelId.slice(0, 8)}: ${reel.status} → failed not allowed (${stepName})`)
    return
  }
  await db.update(reels).set({ status: 'failed' as never, updatedAt: new Date() }).where(eq(reels.id, reelId))
  // Only write a fallback row for a step that threw BEFORE runStep wrote anything. If a row for this step
  // already exists — including a fan-out step's per-scene rows ('generate_images:scene3') — keep it: adding
  // a bare 'generate_images' row here would linger 'failed' after a successful retry and falsely surface a
  // retry banner (the per-scene rows are the source of truth). markReelFailed is rare (permanent failure),
  // so scanning the reel's step rows is cheap.
  const rows = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.reelId, reelId),
    columns: { stepName: true, status: true },
  })
  if (hasFailedAttemptForStep(rows, stepName)) return
  await db
    .insert(pipelineSteps)
    .values({ reelId, stepName: stepName as never, status: 'failed', attempt: 1, error, finishedAt: new Date() })
    .onConflictDoUpdate({
      target: [pipelineSteps.reelId, pipelineSteps.stepName],
      set: {
        status: 'failed',
        error,
        finishedAt: new Date(),
      },
    })
}
