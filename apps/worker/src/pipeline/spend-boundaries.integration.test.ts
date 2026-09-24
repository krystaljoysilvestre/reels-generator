import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { channels, getDb, getReelOwnerUsage, getUserUsage, pipelineSteps, reels, users } from '@reels/db'
import type {
  BudgetExceededError as BudgetExceededErrorClass,
  GlobalBudgetExceededError as GlobalBudgetExceededErrorClass,
  PipelineStepName,
  QuotaExceededError as QuotaExceededErrorClass,
} from '@reels/core'
import type { runStep as RunStepFunction } from './harness.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const PREVIOUS_GLOBAL_CAP = process.env['GLOBAL_DAILY_SPEND_CAP_CENTS']

const REEL_CAP_USER_ID = randomUUID()
const USER_CAP_USER_ID = randomUUID()
const GLOBAL_CAP_USER_ID = randomUUID()
const REEL_CAP_CHANNEL_ID = randomUUID()
const USER_CAP_CHANNEL_ID = randomUUID()
const GLOBAL_CAP_CHANNEL_ID = randomUUID()
const REEL_CAP_REEL_ID = randomUUID()
const USER_CAP_REEL_ID = randomUUID()
const GLOBAL_CAP_REEL_ID = randomUUID()
const BLOCKED_OWNERS = [
  { role: 'tester', status: 'suspended' },
  { role: 'tester', status: 'pending' },
  { role: 'admin', status: 'suspended' },
].map((account) => ({ ...account, userId: randomUUID(), channelId: randomUUID(), reelId: randomUUID() }))

let runStep: typeof RunStepFunction
let core: {
  BudgetExceededError: typeof BudgetExceededErrorClass
  QuotaExceededError: typeof QuotaExceededErrorClass
  GlobalBudgetExceededError: typeof GlobalBudgetExceededErrorClass
}

const paidStep = () => vi.fn(async () => ({ output: { ok: true }, costCents: 1 }))
const context = (reelId: string, inputHash: string, budgetCap: number) => ({
  reelId,
  stepName: 'analyze_story' as PipelineStepName,
  inputHash,
  budgetCap,
})

describe.skipIf(!TEST_DATABASE_URL)('database-backed spend boundaries', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    // Load the core/harness only after setting the env-backed global kill-switch. A 1¢ cap keeps the
    // fixture deterministic even if another integration suite has rows in this shared test database.
    process.env['GLOBAL_DAILY_SPEND_CAP_CENTS'] = '1'
    core = await import('@reels/core')
    ;({ runStep } = await import('./harness.js'))

    const db = getDb()
    await db.insert(users).values([
      { id: REEL_CAP_USER_ID, email: `${REEL_CAP_USER_ID}@example.test`, status: 'active', monthlyBudgetCents: 10_000 },
      { id: USER_CAP_USER_ID, email: `${USER_CAP_USER_ID}@example.test`, status: 'active', monthlyBudgetCents: 100 },
      { id: GLOBAL_CAP_USER_ID, email: `${GLOBAL_CAP_USER_ID}@example.test`, status: 'active', monthlyBudgetCents: 10_000 },
      ...BLOCKED_OWNERS.map(({ userId, role }) => ({ id: userId, email: `${userId}@example.test`, role, status: 'active', monthlyBudgetCents: 10_000 })),
    ])
    await db.insert(channels).values([
      { id: REEL_CAP_CHANNEL_ID, userId: REEL_CAP_USER_ID, name: 'Reel cap', nicheDescription: 'Test' },
      { id: USER_CAP_CHANNEL_ID, userId: USER_CAP_USER_ID, name: 'User cap', nicheDescription: 'Test' },
      { id: GLOBAL_CAP_CHANNEL_ID, userId: GLOBAL_CAP_USER_ID, name: 'Global cap', nicheDescription: 'Test' },
      ...BLOCKED_OWNERS.map(({ userId, channelId }) => ({ id: channelId, userId, name: 'Account status', nicheDescription: 'Test' })),
    ])
    await db.insert(reels).values([
      { id: REEL_CAP_REEL_ID, channelId: REEL_CAP_CHANNEL_ID, costCents: 800 },
      { id: USER_CAP_REEL_ID, channelId: USER_CAP_CHANNEL_ID, costCents: 100 },
      { id: GLOBAL_CAP_REEL_ID, channelId: GLOBAL_CAP_CHANNEL_ID, costCents: 1 },
      ...BLOCKED_OWNERS.map(({ reelId, channelId }) => ({ id: reelId, channelId, costCents: 0 })),
    ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(channels).where(inArray(channels.id, [REEL_CAP_CHANNEL_ID, USER_CAP_CHANNEL_ID, GLOBAL_CAP_CHANNEL_ID, ...BLOCKED_OWNERS.map((owner) => owner.channelId)]))
    await db.delete(users).where(inArray(users.id, [REEL_CAP_USER_ID, USER_CAP_USER_ID, GLOBAL_CAP_USER_ID, ...BLOCKED_OWNERS.map((owner) => owner.userId)]))
    if (PREVIOUS_GLOBAL_CAP === undefined) delete process.env['GLOBAL_DAILY_SPEND_CAP_CENTS']
    else process.env['GLOBAL_DAILY_SPEND_CAP_CENTS'] = PREVIOUS_GLOBAL_CAP
  })

  it('halts at the per-reel cap before invoking the paid step', async () => {
    const provider = paidStep()

    await expect(runStep(context(REEL_CAP_REEL_ID, 'reel-cap', 800), provider)).rejects.toBeInstanceOf(
      core.BudgetExceededError,
    )
    expect(provider).not.toHaveBeenCalled()
  })

  it('halts at the owner monthly cap before invoking the paid step', async () => {
    const provider = paidStep()

    await expect(runStep(context(USER_CAP_REEL_ID, 'user-cap', 1_000), provider)).rejects.toBeInstanceOf(
      core.QuotaExceededError,
    )
    expect(provider).not.toHaveBeenCalled()
  })

  it('halts at the app-wide daily cap before invoking the paid step', async () => {
    const provider = paidStep()

    await expect(runStep(context(GLOBAL_CAP_REEL_ID, 'global-cap', 1_000), provider)).rejects.toBeInstanceOf(
      core.GlobalBudgetExceededError,
    )
    expect(provider).not.toHaveBeenCalled()
  })

  it.each(BLOCKED_OWNERS)('reads a fresh $status status for a $role owner and rejects queued paid work', async ({ userId, reelId, status }) => {
    await expect(getUserUsage(userId)).resolves.toMatchObject({ status: 'active' })
    await expect(getReelOwnerUsage(reelId)).resolves.toMatchObject({ status: 'active' })
    await getDb().update(users).set({ status }).where(eq(users.id, userId))
    await expect(getUserUsage(userId)).resolves.toMatchObject({ status })
    await expect(getReelOwnerUsage(reelId)).resolves.toMatchObject({ status })
    const provider = paidStep()

    await expect(runStep(context(reelId, 'account-no-longer-active', 1_000), provider))
      .rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(provider).not.toHaveBeenCalled()
    const steps = await getDb().select().from(pipelineSteps).where(eq(pipelineSteps.reelId, reelId))
    expect(steps).toEqual([])
  })

  it('does not create pipeline work for any rejected spend attempt', async () => {
    const rows = await getDb()
      .select({ reelId: pipelineSteps.reelId })
      .from(pipelineSteps)
      .where(inArray(pipelineSteps.reelId, [REEL_CAP_REEL_ID, USER_CAP_REEL_ID, GLOBAL_CAP_REEL_ID]))

    expect(rows).toEqual([])
  })

  it('allows deterministic free work to finish after the spend caps are reached', async () => {
    const freeStep = vi.fn(async () => ({ output: { ok: true }, costCents: 0 }))

    await expect(runStep({
      ...context(REEL_CAP_REEL_ID, 'free-at-cap', 800),
      stepName: 'compute_timings',
      spendsProviderMoney: false,
    }, freeStep)).resolves.toMatchObject({ skipped: false, costCents: 0 })
    expect(freeStep).toHaveBeenCalledOnce()
  })
})
