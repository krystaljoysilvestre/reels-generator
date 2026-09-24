import React from 'react'
import { File } from 'node:buffer'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostMeta } from '@reels/core'
import {
  attachmentUrl, confirmDestination, draftCaptionText, isShareCancellation, MAX_SHARE_BYTES,
  prepareShareFile, publicationStatusLabel, savedPublicationUrl, type PublishDestination, type SavedPublication,
} from './publishing-handoff'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
import { DestinationRow, PublishingDownloads, PublishingHandoff } from './PublishingHandoff'
import { ReelReady } from './ReelReady'

const record = (overrides: Partial<SavedPublication> = {}): SavedPublication => ({ platform: 'yt', status: 'published', postUrl: null, platformPostId: null, publishedAt: '2026-09-24T10:00:00.000Z', ...overrides })
const destination = (overrides: Partial<PublishDestination> = {}): PublishDestination => ({ target: 'youtube_shorts', platform: 'yt', connected: false, accountName: null, publication: null, ...overrides })

beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('File', File) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('publishing destination records', () => {
  it('distinguishes manual confirmations from uploads without claiming public visibility', () => {
    expect(publicationStatusLabel(record())).toBe('Marked as posted')
    expect(publicationStatusLabel(record({ platformPostId: 'uploaded' }))).toBe('Uploaded to YouTube')
    expect(publicationStatusLabel(null)).toBe('Not marked as posted')
  })

  it('does not invent missing records for a partially posted reel', () => {
    const html = renderToStaticMarkup(React.createElement(PublishingHandoff, {
      reelId: 'reel', channelId: 'channel', history: [], destinations: [
        destination({ publication: record({ platformPostId: 'video-id', postUrl: 'https://youtu.be/video-id' }) }),
        destination({ target: 'instagram_reels', platform: 'ig' }),
      ],
    }))
    expect(html).toContain('1 of 2 destinations recorded')
    expect(html).toContain('Uploaded to YouTube')
    expect(html).toContain('Not marked as posted')
    expect(html).toContain('Instagram post link (optional)')
    expect(html).toContain('I’ve posted this')
    expect(html).not.toContain('Mark as published')
    expect(html).not.toContain('Live on YouTube')
  })

  it('does not infer public posting from a legacy terminal reel status', () => {
    const html = renderToStaticMarkup(React.createElement(ReelReady, {
      reelId: 'reel', channelId: 'channel', status: 'published', title: 'A finished story', renderUrl: null, coverUrl: null,
      sceneCount: 2, estSecs: 30, timedSecs: 30, voiceName: 'Narrator', musicName: 'None', costCents: 0,
      qa: null, scheduledAt: null, metricsViews: null, postMeta: null, onBack: vi.fn(), onRerender: vi.fn(), onApprove: vi.fn(),
      loading: null, error: null, coverPicker: null, publishTools: null, destinations: [destination()], historicalPublications: [], hasSubtitles: false,
    }))
    expect(html).toContain('Ready to post')
    expect(html).toContain('0 of 1 destinations recorded')
    expect(html).not.toContain('Your reel is published')
  })

  it('keeps native posting available without a connection', () => {
    const html = renderToStaticMarkup(React.createElement(DestinationRow, { reelId: 'reel', channelId: 'channel', destination: destination() }))
    expect(html).toContain('https://studio.youtube.com/')
    expect(html).toContain('I’ve posted this')
    expect(html).toContain('Connect for optional upload')
  })

  it('does not offer another YouTube upload after a manual confirmation', () => {
    const html = renderToStaticMarkup(React.createElement(DestinationRow, { reelId: 'reel', channelId: 'channel', destination: destination({ connected: true, publication: record() }) }))
    expect(html).toContain('Marked as posted')
    expect(html).not.toContain('Upload to YouTube')
    expect(html).not.toContain('I’ve posted this')
  })

  it('shows off-target historical rows without confirmation controls or made-up links', () => {
    const html = renderToStaticMarkup(React.createElement(PublishingHandoff, { reelId: 'reel', channelId: 'channel', destinations: [], history: [record({ platform: 'fb', platformPostId: 'old-reference' })] }))
    expect(html).toContain('Earlier destinations')
    expect(html).toContain('old-reference')
    expect(html).not.toContain('Open saved post')
    expect(html).not.toContain('I’ve posted this')
    expect(html).not.toContain('post link (optional)')
  })

  it.each(['javascript:alert(1)', 'http://youtube.com/video', 'https://user:password@youtube.com/video'])('never links an unsafe stored URL: %s', (postUrl) => {
    expect(savedPublicationUrl(record({ postUrl }))).toBeNull()
  })

  it('confirms just the chosen destination and trims its optional link', async () => {
    const publication = record({ platform: 'ig', postUrl: 'https://www.instagram.com/reel/abc/' })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, publication })))
    expect(await confirmDestination('reel-id', 'ig', ' https://www.instagram.com/reel/abc/ ', fetcher)).toEqual(publication)
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/pipeline/mark-published')
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ reelId: 'reel-id', platform: 'ig', postUrl: 'https://www.instagram.com/reel/abc/' })
  })

  it('omits a blank URL so an existing saved link is preserved', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ publication: record() })))
    await confirmDestination('reel', 'yt', ' ', fetcher)
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ reelId: 'reel', platform: 'yt' })
  })

  it('propagates destination validation and network failures for retry UI', async () => {
    const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Choose a selected destination.' }), { status: 400 }))
    await expect(confirmDestination('reel', 'ig', '', denied)).rejects.toThrow('Choose a selected destination.')
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await expect(confirmDestination('reel', 'ig', '', offline)).rejects.toThrow('offline')
  })
})

describe('publishing files and caption', () => {
  it('names each download and uses the authorized attachment route', () => {
    const html = renderToStaticMarkup(React.createElement(PublishingDownloads, { reelId: 'reel', renderUrl: '/api/asset?key=render&amp;v=1', coverUrl: '/api/asset?key=cover', hasSubtitles: true }))
    for (const label of ['Download video', 'Download cover', 'Download subtitles', 'Post package']) expect(html).toContain(label)
    expect(html).toContain('download=1')
    expect(html).toContain('/api/pipeline/export-subtitles?reelId=reel')
    expect(attachmentUrl('/api/asset?key=render&v=1')).toBe('/api/asset?key=render&v=1&download=1')
  })

  it('does not promise subtitles when the reel has none to export', () => {
    const html = renderToStaticMarkup(React.createElement(PublishingDownloads, { reelId: 'reel', renderUrl: '/api/asset?key=video', coverUrl: null, hasSubtitles: false }))
    expect(html).not.toContain('Download subtitles')
    expect(html).not.toContain('Download cover')
  })

  it('copies current unsaved caption and hashtag edits together with required credits', () => {
    const edited: PostMeta = { v: 1, language: 'en', title: 'Changed title', thumbnailText: 'Cover', hook: 'Opening', caption: 'Unsaved caption', hashtags: ['#old'] }
    const text = draftCaptionText(edited, 'fresh #edited', 'Image credits: Author / CC BY', 'fallback')
    expect(text).toContain('Changed title')
    expect(text).toContain('Unsaved caption')
    expect(text).toContain('#fresh #edited')
    expect(text).not.toContain('#old')
    expect(text).toContain('Image credits: Author / CC BY')
    expect(draftCaptionText(null, '', '', 'Saved story summary and credits')).toBe('Saved story summary and credits')
  })

  it('prepares a video file while making only an asset read', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const file = await prepareShareFile('/api/asset?key=video', 'reel', fetcher)
    expect(file.name).toBe('kendrix-reel.mp4')
    expect(file.type).toBe('video/mp4')
    expect(file.size).toBe(3)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/asset?key=video')
    expect(fetcher.mock.calls[0]?.[1]?.method).toBeUndefined()
  })

  it('rejects a known oversized file before buffering', async () => {
    const response = new Response(new Uint8Array([1]), { headers: { 'content-length': String(MAX_SHARE_BYTES + 1) } })
    const cancel = vi.spyOn(response.body!, 'cancel')
    await expect(prepareShareFile('/asset', 'reel', vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('enforces the memory limit even when content length is absent', async () => {
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(MAX_SHARE_BYTES + 1)) },
      cancel,
    }))
    await expect(prepareShareFile('/asset', 'reel', vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow('too large')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('treats closing the native share sheet as cancellation', () => {
    const error = new Error('Cancelled'); error.name = 'AbortError'
    expect(isShareCancellation(error)).toBe(true)
    expect(isShareCancellation(new Error('Unavailable'))).toBe(false)
  })
})
