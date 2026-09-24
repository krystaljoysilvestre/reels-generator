import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type * as Database from '@reels/db'
import { CAPTION_PRESETS } from '@reels/core'

const mocks = vi.hoisted(() => ({
  reel: vi.fn(),
  channel: vi.fn(),
  assets: vi.fn(),
  scene: vi.fn(),
  imageOrigins: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  owner: vi.fn(),
  budget: vi.fn(),
  download: vi.fn(),
  llm: vi.fn(),
  failedSpend: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  getDb: () => ({
    query: {
      reels: { findFirst: mocks.reel },
      channels: { findFirst: mocks.channel },
      assets: { findMany: mocks.assets },
      scenes: { findFirst: mocks.scene },
    },
    update: mocks.update,
  }),
  sceneImageOrigins: mocks.imageOrigins,
}))
vi.mock('@reels/providers', () => ({ downloadBuffer: mocks.download, llmCall: mocks.llm, checkRateLimit: mocks.limit }))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner, requireSpendBudget: mocks.budget }))
vi.mock('@/lib/failed-spend', () => ({ recordFailedSpend: mocks.failedSpend }))

import { GET } from './route'

const creator = { id: 'creator', role: 'tester', status: 'active', email: null, name: null, image: null }
const savedMeta = { v: 1, title: 'Kept title', hook: 'A kept opening.', caption: 'The creator’s own caption.', hashtags: ['#Story'], language: 'English' }
const reel = {
  id: 'reel-1', channelId: 'channel-1', language: 'English', postMeta: savedMeta,
  story: { title: 'The original story', logline: 'A keeper saves the lighthouse.', body: 'The full narration.' },
  storyBible: {
    entities: [{
      id: 'lighthouse', kind: 'location', description: 'An old lighthouse', referenceImageKey: 'refs/lighthouse.webp',
      referenceOrigin: {
        type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference',
        url: 'https://commons.wikimedia.org/wiki/File:Lighthouse.jpg', license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'Example Photographer',
      },
    }],
  },
}

// Read stored ZIP entries as a download consumer, so the assertions cover the actual response
// (video, paste-ready caption, licence attribution and disclosure), not an internal helper's output.
async function downloadFiles(response: Response): Promise<Map<string, Buffer>> {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/zip')
  const zip = Buffer.from(await response.arrayBuffer())
  const files = new Map<string, Buffer>()
  let offset = 0
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const extraLength = zip.readUInt16LE(offset + 28)
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8')
    const start = offset + 30 + nameLength + extraLength
    files.set(name, zip.subarray(start, start + size))
    offset = start + size
  }
  return files
}

function request() {
  return new NextRequest('https://app.example.test/api/pipeline/export-post-package?reelId=reel-1')
}

describe('finished reel downloads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.owner.mockResolvedValue(creator)
    mocks.limit.mockResolvedValue({ ok: true })
    mocks.budget.mockResolvedValue(null)
    mocks.reel.mockResolvedValue(reel)
    mocks.channel.mockResolvedValue({ name: 'Lighthouse stories', nicheDescription: 'Stories by the sea', genreCategory: 'general', postingRules: {} })
    mocks.assets.mockResolvedValue([
      { kind: 'render', storageKey: 'reels/reel-1/render.mp4' },
      { kind: 'image', storageKey: 'reels/reel-1/cover.jpg', meta: { role: 'thumbnail' } },
    ])
    mocks.imageOrigins.mockResolvedValue([{
      type: 'sourced', provider: 'wikimedia', usage: 'presented_archival', subjectClass: 'human',
      url: 'https://commons.wikimedia.org/wiki/File:Keeper.jpg', license: 'Public domain', author: 'Archive',
    }])
    mocks.download.mockImplementation(async (key: string) => Buffer.from(key.endsWith('.mp4') ? 'finished-video' : 'cover-image'))
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue(undefined)
  })

  it('downloads existing metadata without checking spend headroom or calling a provider', async () => {
    mocks.budget.mockResolvedValue(NextResponse.json({ error: 'Allowance reached' }, { status: 429 }))

    const files = await downloadFiles(await GET(request()))

    expect(files.get('reel.mp4')?.toString()).toBe('finished-video')
    expect(files.get('thumbnail.jpg')?.toString()).toBe('cover-image')
    expect(files.get('caption.txt')?.toString()).toContain('The creator’s own caption.')
    expect(mocks.budget).not.toHaveBeenCalled()
    expect(mocks.llm).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('keeps the video, caption, both kinds of image credits and disclosure when allowance blocks missing metadata', async () => {
    mocks.reel.mockResolvedValue({ ...reel, postMeta: null })
    mocks.budget.mockResolvedValue(NextResponse.json({ error: 'Allowance reached' }, { status: 429 }))

    const files = await downloadFiles(await GET(request()))
    const caption = files.get('caption.txt')?.toString() ?? ''

    expect(files.get('reel.mp4')?.toString()).toBe('finished-video')
    expect(caption).toContain('The original story')
    expect(caption).toContain('A keeper saves the lighthouse.')
    expect(caption).toContain('Example Photographer')
    expect(caption).toContain('CC BY-SA 4.0')
    expect(caption).toContain('creativecommons.org/licenses/by-sa/4.0/')
    expect(caption).toContain('Archival photograph')
    expect(caption).toContain('Public domain')
    expect(files.get('AI-DISCLOSURE.txt')?.toString()).toContain('This content was created with AI assistance.')
    expect(mocks.budget).not.toHaveBeenCalled()
    expect(mocks.llm).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('uses the saved story when metadata is missing without starting paid work', async () => {
    mocks.reel.mockResolvedValue({ ...reel, postMeta: null })
    mocks.llm.mockResolvedValue({ data: savedMeta, costCents: 2 })

    const files = await downloadFiles(await GET(request()))

    expect(files.get('caption.txt')?.toString()).toContain('A keeper saves the lighthouse.')
    expect(mocks.budget).not.toHaveBeenCalled()
    expect(mocks.llm).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('includes a usable subtitle sidecar when captions are not burned into the video', async () => {
    mocks.reel.mockResolvedValue({ ...reel, timings: {
      durationMs: 5000, scenes: [], sfxEvents: [], music: null, silenceDrop: null, warnings: [],
      subtitles: [{ sceneIdx: 0, startMs: 0, endMs: 2000, text: 'A keeper saves the lighthouse.', words: [] }],
    } })
    mocks.channel.mockResolvedValue({ name: 'Lighthouse stories', postingRules: {}, captionStyle: { ...CAPTION_PRESETS.candid, enabled: false } })

    const files = await downloadFiles(await GET(request()))

    expect(files.get('subtitles.srt')?.toString()).toContain('00:00:00,000 --> 00:00:02,000')
    expect(files.get('subtitles.srt')?.toString()).toContain('A keeper saves the lighthouse.')
    expect(mocks.llm).not.toHaveBeenCalled()
  })

  it('keeps the ownership gate ahead of every download and optional paid call', async () => {
    mocks.owner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }))

    expect((await GET(request())).status).toBe(404)
    expect(mocks.reel).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.budget).not.toHaveBeenCalled()
    expect(mocks.llm).not.toHaveBeenCalled()
  })

  it('retains archival image credits even when an older reel has no story bible', async () => {
    mocks.reel.mockResolvedValue({ ...reel, storyBible: null })
    const files = await downloadFiles(await GET(request()))
    expect(files.get('caption.txt')?.toString()).toContain('Archival photograph')
    expect(files.get('caption.txt')?.toString()).toContain('Archive')
    expect(files.has('subtitles.srt')).toBe(false)
  })

  it('limits repeated package downloads before loading storage', async () => {
    mocks.limit.mockResolvedValue({ ok: false })
    expect((await GET(request())).status).toBe(429)
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
