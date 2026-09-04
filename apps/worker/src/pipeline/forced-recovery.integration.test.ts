import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { channels, getDb, pipelineSteps, reels, users } from '@reels/db'
import { hasFailedAttemptForStep } from './failure-record.js'
import { maybeInjectFault } from './fault-injection.js'
import type { runStep as RunStepFunction } from './harness.js'

// Phase 0 exit gate, items 3 and 4, proven against real Postgres: a forced failure is RECORDED (so the
// storyboard can show a failed phase and Retry has a resume boundary), and the retry re-pays nothing.
// The live hosted lap is the confirmation of this; this suite is what makes it a confirmation and not a
// discovery — see specs/phase0-forced-recovery-lap.md.

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const PREVIOUS_FORCE = process.env['FORCE_STEP_FAILURE']
const BOUNDARY = 'render:after_visual'

const USER_ID = randomUUID()
const CHANNEL_ID = randomUUID()
const REEL_ID = randomUUID()
const UNARMED_REEL_ID = randomUUID()

let runStep: typeof RunStepFunction

describe.skipIf(!TEST_DATABASE_URL)('forced failure and cost-idempotent recovery', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    // This suite is about recovery, not caps: keep the app-wide kill-switch out of the fixture.
    delete process.env['GLOBAL_DAILY_SPEND_CAP_CENTS']
    ;({ runStep } = await import('./harness.js'))

    const db = getDb()
    await db.insert(users).values({
      id: USER_ID,
      email: `${USER_ID}@example.test`,
      status: 'active',
      monthlyBudgetCents: 100_000,
    })
    await db.insert(channels).values({
      id: CHANNEL_ID,
      userId: USER_ID,
      name: 'Forced recovery',
      nicheDescription: 'Test',
    })
    await db.insert(reels).values([
      { id: REEL_ID, channelId: CHANNEL_ID, costCents: 0 },
      { id: UNARMED_REEL_ID, channelId: CHANNEL_ID, costCents: 0 },
    ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(pipelineSteps).where(inArray(pipelineSteps.reelId, [REEL_ID, UNARMED_REEL_ID]))
    await db.delete(reels).where(inArray(reels.id, [REEL_ID, UNARMED_REEL_ID]))
    await db.delete(channels).where(eq(channels.id, CHANNEL_ID))
    await db.delete(users).where(eq(users.id, USER_ID))
    if (PREVIOUS_FORCE === undefined) delete process.env['FORCE_STEP_FAILURE']
    else process.env['FORCE_STEP_FAILURE'] = PREVIOUS_FORCE
  })

  const renderRow = async (reelId: string) =>
    getDb().query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'render')),
    })

  const reelCost = async (reelId: string) =>
    (await getDb().query.reels.findFirst({ where: eq(reels.id, reelId), columns: { costCents: true } }))?.costCents

  it('does nothing at all when FORCE_STEP_FAILURE is unset — the shipped state', async () => {
    delete process.env['FORCE_STEP_FAILURE']

    const result = await runStep(
      { reelId: UNARMED_REEL_ID, stepName: 'render', inputHash: 'unarmed-1', spendsProviderMoney: false },
      async () => {
        await maybeInjectFault(UNARMED_REEL_ID, 'render', BOUNDARY)
        return { output: { ok: true }, costCents: 0 }
      },
    )

    expect(result.skipped).toBe(false)
    expect((await renderRow(UNARMED_REEL_ID))?.status).toBe('done')
  })

  it('records the forced failure so the creator has a failed phase to retry', async () => {
    // An upstream paid step finishes first — this is the already-paid work the retry must not repeat.
    const paid = await runStep(
      { reelId: REEL_ID, stepName: 'generate_tts', inputHash: 'tts-1', budgetCap: 5_000 },
      async () => ({ output: { audio: 'mix' }, costCents: 500 }),
    )
    expect(paid.costCents).toBe(500)
    expect(await reelCost(REEL_ID)).toBe(500)

    process.env['FORCE_STEP_FAILURE'] = BOUNDARY

    await expect(
      runStep(
        { reelId: REEL_ID, stepName: 'render', inputHash: 'render-1', spendsProviderMoney: false },
        async () => {
          await maybeInjectFault(REEL_ID, 'render', BOUNDARY)
          return { output: { storageKey: 'reels/x/render.mp4' }, costCents: 0 }
        },
      ),
    ).rejects.toMatchObject({ name: 'UnrecoverableError' })

    const failed = await renderRow(REEL_ID)
    expect(failed?.status).toBe('failed')
    expect(failed?.attempt).toBe(1)
    expect(failed?.error).toContain('FORCE_STEP_FAILURE')

    // The two readers that make the failure recoverable in-product: the storyboard banner and the retry
    // route both resolve the step through this predicate.
    const rows = await getDb().query.pipelineSteps.findMany({
      where: eq(pipelineSteps.reelId, REEL_ID),
      columns: { stepName: true, status: true },
    })
    expect(hasFailedAttemptForStep(rows, 'render')).toBe(true)

    // A failure that paid nothing must not move the ledger.
    expect(await reelCost(REEL_ID)).toBe(500)
  })

  it('retries without repeating the paid step or double-counting its cost', async () => {
    // Retry resumes the chain, so every completed upstream step is re-entered. Each must hit the
    // idempotency cache: same inputHash, no provider call, no cents.
    const provider = vi.fn(async () => ({ output: { audio: 'mix' }, costCents: 500 }))
    const replay = await runStep(
      { reelId: REEL_ID, stepName: 'generate_tts', inputHash: 'tts-1', budgetCap: 5_000 },
      provider,
    )

    expect(replay.skipped).toBe(true)
    expect(replay.costCents).toBe(0)
    expect(provider).not.toHaveBeenCalled()

    // The armed variable is still set — the fault must not fire again on the second attempt, or Retry
    // would need the operator to reach back into the deployment to un-arm it.
    expect(process.env['FORCE_STEP_FAILURE']).toBe(BOUNDARY)

    const retried = await runStep(
      { reelId: REEL_ID, stepName: 'render', inputHash: 'render-1', spendsProviderMoney: false },
      async () => {
        await maybeInjectFault(REEL_ID, 'render', BOUNDARY)
        return { output: { storageKey: 'reels/x/render.mp4' }, costCents: 0 }
      },
    )

    expect(retried.skipped).toBe(false)
    const done = await renderRow(REEL_ID)
    expect(done?.status).toBe('done')
    expect(done?.attempt).toBe(2)

    // The whole point of item 4: one paid step, paid once, across a failure and a recovery.
    expect(await reelCost(REEL_ID)).toBe(500)
  })
})
