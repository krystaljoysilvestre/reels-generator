import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  requireChannelOwner: vi.fn(),
  requireSpendBudget: vi.fn(),
}))

vi.mock('@/lib/api-access', () => mocks)
vi.mock('@/lib/failed-spend', () => ({ recordFailedSpend: vi.fn() }))
vi.mock('@/lib/upload', () => ({ sniffImageMime: vi.fn(), IMAGE_EXT: {}, looksLikeAudio: vi.fn() }))
vi.mock('@reels/db', () => ({ assets: {}, getDb: vi.fn(), recordSpendEvent: vi.fn() }))
vi.mock('@reels/providers', () => ({
  uploadBuffer: vi.fn(),
  llmCall: vi.fn(),
  generateImage: vi.fn(),
  assembleImagePrompt: vi.fn(),
  assembleNegativePrompt: vi.fn(),
  ContentFilterError: class ContentFilterError extends Error {},
  SCENE_IMAGE_QUALITY: 'medium',
}))

import { POST as uploadAvatar } from '@/app/api/channel/avatar/route'
import { POST as readStyleReference } from '@/app/api/channel/style-ref/route'
import { POST as generateStyleImage } from '@/app/api/channel/style-image/route'

describe('channel asset routes authenticate before reading request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  })

  it.each([
    ['avatar upload', uploadAvatar],
    ['style reference upload', readStyleReference],
  ])('%s rejects before multipart parsing', async (_label, handler) => {
    const formData = vi.fn()
    const response = await handler({ formData } as unknown as NextRequest)

    expect(response.status).toBe(401)
    expect(formData).not.toHaveBeenCalled()
    expect(mocks.requireChannelOwner).not.toHaveBeenCalled()
  })

  it('style preview rejects before JSON parsing', async () => {
    const json = vi.fn()
    const response = await generateStyleImage({ json } as unknown as NextRequest)

    expect(response.status).toBe(401)
    expect(json).not.toHaveBeenCalled()
    expect(mocks.requireChannelOwner).not.toHaveBeenCalled()
  })
})
