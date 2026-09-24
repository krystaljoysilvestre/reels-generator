import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), find: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/access', () => ({ assertChannelAccess: mocks.access }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@reels/db', () => ({ channels: { id: 'channel-id' }, getDb: () => ({ query: { channels: { findFirst: mocks.find } } }) }))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.mock('./NewChannelWizard', () => ({ NewChannelWizard: () => null }))

import NewChannelPage from './page'

const draftId = '00000000-0000-4000-8000-000000000001'

describe('channel draft resume authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.auth.mockResolvedValue({ id: 'owner', status: 'active' })
    mocks.access.mockResolvedValue({ id: 'owner' })
    mocks.find.mockResolvedValue({ id: draftId, status: 'draft', draftState: { name: 'My channel' } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('requires an active account before looking up any draft', async () => {
    mocks.auth.mockRejectedValue(new Error('auth required'))
    await expect(NewChannelPage({ searchParams: Promise.resolve({ draft: draftId }) })).rejects.toThrow('auth required')
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it.each(['bad-id', ''])('rejects malformed draft id %j before ownership or database lookup', async (draft) => {
    await expect(NewChannelPage({ searchParams: Promise.resolve({ draft }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('never loads private draft content after the ownership gate rejects it', async () => {
    mocks.access.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(NewChannelPage({ searchParams: Promise.resolve({ draft: draftId }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.access).toHaveBeenCalledWith(draftId)
    expect(mocks.find).not.toHaveBeenCalled()
  })

  it('hydrates an owned draft only after the ownership gate', async () => {
    const page = await NewChannelPage({ searchParams: Promise.resolve({ draft: draftId }) })
    expect(mocks.access).toHaveBeenCalledWith(draftId)
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.find.mock.invocationCallOrder[0]!)
    expect(page.props.initialDraft).toEqual({ name: 'My channel' })
    expect(page.props.initialDraftChannelId).toBe(draftId)
  })

  it.each([undefined, { id: draftId, status: 'active', draftState: {} }])('does not silently open a new wizard for a missing or non-draft channel', async (row) => {
    mocks.find.mockResolvedValue(row)
    await expect(NewChannelPage({ searchParams: Promise.resolve({ draft: draftId }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('keeps creating a new channel independent of draft access', async () => {
    const page = await NewChannelPage({ searchParams: Promise.resolve({ preset: 'horror' }) })
    expect(page.props.initialDraft).toBeNull()
    expect(page.props.initialPresetId).toBe('horror')
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.find).not.toHaveBeenCalled()
  })
})
