import type * as DbModule from '@reels/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  existing: vi.fn(), reel: vi.fn(), owner: vi.fn(), globalSpend: vi.fn(), insert: vi.fn(), update: vi.fn(),
}))
vi.mock('@reels/db', async (original) => {
  const db = {
    query: { pipelineSteps: { findFirst: mocks.existing }, reels: { findFirst: mocks.reel } },
    insert: mocks.insert,
    update: mocks.update,
  }
  return {
    ...await original<typeof DbModule>(),
    getDb: () => ({ ...db, transaction: async (fn: (tx: typeof db) => Promise<void>) => fn(db) }),
    getReelOwnerUsage: mocks.owner,
    getGlobalSpendTodayCents: mocks.globalSpend,
  }
})
vi.mock('@reels/providers', () => ({ spendFromError: () => 0 }))

import { runStep } from './harness.js'

const context = { reelId: 'reel', stepName: 'analyze_story' as const, inputHash: 'current', budgetCap: 100 }
const activeOwner = { userId: 'owner', role: 'tester', status: 'active', monthlyBudgetCents: 1_000, spendCentsThisMonth: 0 }

describe('queued paid work respects current account access', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.existing.mockResolvedValue(undefined)
    mocks.reel.mockResolvedValue({ id: 'reel', channelId: 'channel', costCents: 0 })
    mocks.owner.mockResolvedValue(activeOwner)
    mocks.globalSpend.mockResolvedValue(0)
    mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: async () => undefined }) })
    mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) })
  })

  it.each([
    { role: 'tester', status: 'suspended' },
    { role: 'tester', status: 'pending' },
    { role: 'admin', status: 'suspended' },
    { role: 'admin', status: 'pending' },
    { role: null, status: null },
    { role: 'tester', status: undefined },
  ])('blocks $status $role owners before invoking a paid callback', async ({ role, status }) => {
    mocks.owner.mockResolvedValue({ ...activeOwner, role, status })
    const provider = vi.fn(async () => ({ output: { ok: true }, costCents: 1 }))

    await expect(runStep(context, provider)).rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(provider).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('reads suspension again for the next queued paid step', async () => {
    const provider = vi.fn(async () => ({ output: { ok: true }, costCents: 1 }))
    await runStep(context, provider)
    mocks.owner.mockResolvedValue({ ...activeOwner, status: 'suspended' })

    await expect(runStep({ ...context, inputHash: 'new-work' }, provider)).rejects.toMatchObject({ name: 'UnrecoverableError' })

    expect(provider).toHaveBeenCalledOnce()
    expect(mocks.owner).toHaveBeenCalledTimes(2)
  })

  it('returns already-paid cached work without invoking the callback', async () => {
    mocks.owner.mockResolvedValue({ ...activeOwner, status: 'suspended' })
    mocks.existing.mockResolvedValue({ status: 'done', inputHash: 'current', output: { saved: true } })
    const provider = vi.fn(async () => ({ output: { saved: false }, costCents: 1 }))

    await expect(runStep(context, provider)).resolves.toEqual({ output: { saved: true }, skipped: true, costCents: 0 })

    expect(provider).not.toHaveBeenCalled()
    expect(mocks.owner).not.toHaveBeenCalled()
  })

  it('lets deterministic provider-free work finish without spending after suspension', async () => {
    mocks.owner.mockResolvedValue({ ...activeOwner, status: 'suspended' })
    const finish = vi.fn(async () => ({ output: { complete: true }, costCents: 0 }))

    await expect(runStep({ ...context, stepName: 'compute_timings', spendsProviderMoney: false }, finish))
      .resolves.toMatchObject({ skipped: false, costCents: 0 })

    expect(finish).toHaveBeenCalledOnce()
    expect(mocks.owner).not.toHaveBeenCalled()
  })

  it('preserves the historical ownerless-channel exemption', async () => {
    mocks.owner.mockResolvedValue(null)
    const provider = vi.fn(async () => ({ output: { ok: true }, costCents: 1 }))

    await expect(runStep(context, provider)).resolves.toMatchObject({ skipped: false, costCents: 1 })

    expect(provider).toHaveBeenCalledOnce()
  })
})
