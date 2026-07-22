import { and, eq, inArray, lt } from 'drizzle-orm'
import { getDb, pipelineSteps, reels } from '@reels/db'

// Pipeline liveness — keep a hung step or a dead worker from parking a reel (and a BullMQ slot) forever.
//
// Two mechanisms:
//   1. withJobTimeout — a hard ceiling on how long a single step may run. On timeout the processor
//      promise REJECTS, so BullMQ frees the worker slot and retries/fails the job instead of the job
//      hanging indefinitely (a hung external call keeps renewing its lock, so BullMQ's own stalled
//      detection never fires). Note: Promise.race can't cancel the underlying call, so the losing work
//      may linger in the background until its socket errors — but the SLOT is freed immediately, which is
//      the thing that was starving other tenants. (Proper cancellation = per-provider AbortSignals; fal
//      already has them, the rest are a follow-up.)
//   2. reapStuckReels — on worker boot, fail reels whose step has been 'running' past a generous
//      threshold. Catches reels orphaned by a hard crash (lock lapsed, but status left 'running').

export const PIPELINE_STEP_TIMEOUT_MS = Number(process.env['PIPELINE_STEP_TIMEOUT_MS'] ?? 10 * 60_000) // 10 min
export const RENDER_STEP_TIMEOUT_MS = Number(process.env['RENDER_STEP_TIMEOUT_MS'] ?? 25 * 60_000) // 25 min
// Must exceed the longest job timeout so the reaper never kills a step legitimately running on a sibling
// worker (multi-replica). 40 min > the 25-min render ceiling.
export const STUCK_REEL_THRESHOLD_MS = Number(process.env['STUCK_REEL_THRESHOLD_MS'] ?? 40 * 60_000)

class StepTimeoutError extends Error {
  constructor(ms: number, label: string) {
    super(`Step timed out after ${Math.round(ms / 1000)}s: ${label}`)
    this.name = 'StepTimeoutError' // generic Error name → transient → BullMQ retries, then fails the reel
  }
}

// Reject if `p` doesn't settle within `ms`. Always clears the timer so it can't leak or hold the loop open.
export function withJobTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeoutError(ms, label)), ms)
  })
  // When the timeout WINS the race, `p` is abandoned but keeps running (Promise.race can't cancel it).
  // If that lingering work later rejects (a hung provider call finally erroring), its rejection would be
  // unhandled — and with no process-level handler that crashes the ENTIRE worker, killing every other
  // in-flight job. Attach a no-op catch so a post-timeout rejection is considered handled. This does not
  // change the race outcome: the same `p` is still raced below; this only registers a second handler.
  p.catch(() => {})
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

// Reels a worker left mid-flight (step 'running' past the threshold) → mark failed so they surface in the
// UI (retryable) instead of holding a slot forever. Returns how many were reaped. Best-effort; safe to
// run on every boot (idempotent — a step already 'failed'/'done' isn't touched).
export async function reapStuckReels(thresholdMs: number = STUCK_REEL_THRESHOLD_MS): Promise<number> {
  const db = getDb()
  const cutoff = new Date(Date.now() - thresholdMs)
  const stuck = await db
    .select({ reelId: pipelineSteps.reelId, stepName: pipelineSteps.stepName })
    .from(pipelineSteps)
    .where(and(eq(pipelineSteps.status, 'running'), lt(pipelineSteps.startedAt, cutoff)))

  for (const s of stuck) {
    await db
      .update(pipelineSteps)
      .set({ status: 'failed', error: 'reaped: stuck in running past the stuck-reel threshold', finishedAt: new Date() })
      .where(and(eq(pipelineSteps.reelId, s.reelId), eq(pipelineSteps.stepName, s.stepName)))
    // Only flip reels that are still in a transient state — never clobber one an operator has since moved on.
    await db
      .update(reels)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(reels.id, s.reelId), inArray(reels.status, ['drafting', 'storyboard', 'rendering', 'render_qa'])))
  }
  if (stuck.length) console.warn(`[liveness] reaped ${stuck.length} reel(s) stuck in 'running' past ${Math.round(thresholdMs / 60000)}m`)
  return stuck.length
}
