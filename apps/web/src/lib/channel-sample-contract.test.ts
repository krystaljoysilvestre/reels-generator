import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcePolicySchema } from '@reels/core'

const mocks = vi.hoisted(() => ({ llmCall: vi.fn(), recordSpendEvent: vi.fn() }))
vi.mock('@reels/providers', () => ({ llmCall: mocks.llmCall }))
vi.mock('@reels/db', () => ({ recordSpendEvent: mocks.recordSpendEvent }))
vi.mock('@/lib/api-access', () => ({ requireApiUser: async () => ({ id: 'owner' }), requireSpendBudget: async () => null }))
vi.mock('@/lib/failed-spend', () => ({ recordFailedSpend: vi.fn() }))

import { POST } from '@/app/api/channel/sample-script/route'

const base = {
  name: 'Quiet Worlds', nicheDescription: 'Cozy mysteries in real seaside towns', languages: ['English'],
  toneConfig: {}, worldBible: { region: 'Coast', era: 'Present day' }, targetPlatforms: ['youtube_shorts'],
  genreCategory: 'cozy mystery', editorialPrinciples: 'Never explain the final joke.',
}
const factual = SourcePolicySchema.parse({ realPlaces: true, evidenceRequired: true, invention: 'none' })
const request = (body: unknown) => ({ json: async () => body }) as NextRequest

describe('channel previews use the creator contract without bypassing sources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.llmCall.mockResolvedValue({ data: { title: 'Preview', hook: 'Opening', script: 'A draft.' }, costCents: 3 })
  })

  it('passes custom genre, editorial direction and real-place permission to the existing sample call', async () => {
    const sourcePolicy = SourcePolicySchema.parse({ realPlaces: true, invention: 'constrained' })
    expect((await POST(request({ ...base, sourcePolicy }))).status).toBe(200)
    expect(mocks.llmCall).toHaveBeenCalledWith(expect.objectContaining({ system: expect.stringContaining('Declared genre / form: cozy mystery') }))
    const system = mocks.llmCall.mock.calls[0]![0].system as string
    expect(system).toContain('Never explain the final joke.')
    expect(system).toContain('Real places may be named accurately')
    expect(mocks.recordSpendEvent).toHaveBeenCalledWith(expect.objectContaining({ costCents: 3 }))
  })

  it('rejects source-free factual previews even when a topic or editable draft was supplied', async () => {
    expect((await POST(request({ ...base, sourcePolicy: factual, promptHint: 'A verified account', reviseDraft: 'Trust this story.' }))).status).toBe(400)
    expect(mocks.llmCall).not.toHaveBeenCalled()
    expect(mocks.recordSpendEvent).not.toHaveBeenCalled()
  })

  it('forwards supplied material for an explicitly source-based preview', async () => {
    expect((await POST(request({ ...base, sourcePolicy: factual, sourceMaterial: 'The archive records the opening in 1920.' }))).status).toBe(200)
    const call = mocks.llmCall.mock.calls[0]![0]
    expect(`${call.system}\n${call.messages[0].content}`).toContain('The archive records the opening in 1920.')
    expect(mocks.llmCall).toHaveBeenCalledTimes(1)
  })
})
