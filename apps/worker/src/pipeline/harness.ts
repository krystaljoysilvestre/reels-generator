import { eq, and, sql } from 'drizzle-orm'
import { getDb } from '@reels/db'
import { pipelineSteps, reels } from '@reels/db'
import { assertBudget, DEFAULT_BUDGET_CAPS_CENTS, type PipelineStepName } from '@reels/core'

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
}

export interface StepResult<T> {
  output: T
  costCents: number
  skipped: boolean   // true = idempotency hit, output from cache
}

export async function runStep<T>(
  ctx: StepContext,
  fn: () => Promise<{ output: T; costCents: number }>,
): Promise<StepResult<T>> {
  const db = getDb()
  const cap = ctx.budgetCap ?? DEFAULT_BUDGET_CAPS_CENTS.short

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
  assertBudget(ctx.reelId, reel.costCents, cap)

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
    const { output, costCents } = await fn()

    // ── 5. Write output + accumulate cost atomically ──────────────────────
    await db.transaction(async (tx) => {
      await tx
        .update(pipelineSteps)
        .set({
          status: 'done',
          output: output as Record<string, unknown>,
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
    // Mark step failed; worker BullMQ retry logic handles re-queueing
    await db
      .update(pipelineSteps)
      .set({ status: 'failed', error: String(err), finishedAt: new Date() })
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
  await db.update(reels).set({ status: 'failed' as never, updatedAt: new Date() }).where(eq(reels.id, reelId))
  await db
    .insert(pipelineSteps)
    .values({ reelId, stepName: stepName as never, status: 'failed', attempt: 1, error, finishedAt: new Date() })
    .onConflictDoNothing()  // keep the harness's richer error if a row already exists
}
