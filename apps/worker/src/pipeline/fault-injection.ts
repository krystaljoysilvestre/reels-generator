import { and, eq } from 'drizzle-orm'
import { UnrecoverableError } from 'bullmq'
import { getDb, pipelineSteps } from '@reels/db'
import type { PipelineStepName } from '@reels/core'

// Phase 0 exit gate, item 3: the forced-recovery lap has to INDUCE a failure the creator can then
// recover from in the product. Killing the worker, revoking a provider key or editing rows by hand is
// the exact invisible-builder move the gate exists to remove — and none of it is reproducible. So the
// failure becomes ordinary configuration: FORCE_STEP_FAILURE names the boundaries to fail at
// (comma-separated). Unset — the shipped state — makes every call here a no-op with no query at all.
//
// The fault fires only on a step's FIRST attempt, read from the step's own durable row. One click of
// Retry therefore clears it: the operator never has to reach back into the deployment mid-lap, and an
// armed variable can never trap a reel in a retry loop.

export const FORCED_FAULT_MESSAGE = 'Forced recovery-lap failure'

export function armedFaultBoundaries(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

export function shouldInjectFault(armed: readonly string[], boundary: string, attempt: number): boolean {
  return armed.includes(boundary) && attempt <= 1
}

// UnrecoverableError, not a plain throw: BullMQ would otherwise retry the job twice more on its own
// (attempts: 3) and quietly succeed on attempt 2 — proving the queue's auto-retry, not the product's
// visible failure and one-click Retry. Permanent is what puts a failed phase in front of the creator.
export function forcedFaultError(boundary: string): Error {
  return new UnrecoverableError(`${FORCED_FAULT_MESSAGE} at ${boundary} (FORCE_STEP_FAILURE)`)
}

export async function maybeInjectFault(
  reelId: string,
  stepName: PipelineStepName,
  boundary: string,
): Promise<void> {
  const armed = armedFaultBoundaries(process.env['FORCE_STEP_FAILURE'])
  if (armed.length === 0) return
  const row = await getDb().query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, stepName)),
    columns: { attempt: true },
  })
  const attempt = row?.attempt ?? 1
  if (!shouldInjectFault(armed, boundary, attempt)) {
    // Say so. An armed switch that declines in silence makes a successful Retry ambiguous between "the
    // fault stood down" and "the fault was never consulted" — the same silence that hid the dead metrics
    // poller for ten days. Only logs while something is armed, so the shipped path stays quiet.
    if (armed.includes(boundary)) {
      console.log(`[fault] ${boundary} armed but attempt ${attempt} — standing down, this is the recovery`)
    }
    return
  }
  console.log(`[fault] injecting forced failure at ${boundary} (attempt ${attempt}) for reel ${reelId.slice(0, 8)}`)
  throw forcedFaultError(boundary)
}
