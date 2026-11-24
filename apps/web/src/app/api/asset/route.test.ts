import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ user: vi.fn(), allowed: vi.fn(), stream: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/api-access', () => ({ requireApiUser: mocks.user, callerMayUseStorageKey: mocks.allowed }))
vi.mock('@reels/providers', () => ({ downloadStream: mocks.stream, checkRateLimit: mocks.limit }))
import { GET } from './route'

function request(key = 'reels/owned/render.mp4', download = true, range?: string) {
  const url = new URL('https://app.example.test/api/asset')
  url.searchParams.set('key', key)
  if (download) url.searchParams.set('download', '1')
  return new NextRequest(url, { headers: range ? { range } : {} })
}

describe('authorized asset downloads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.user.mockResolvedValue({ id: 'creator' })
    mocks.allowed.mockResolvedValue(true)
    mocks.limit.mockResolvedValue({ ok: true })
    mocks.stream.mockImplementation(async () => ({ body: Readable.from([Buffer.from('video')]), contentLength: 5, statusCode: 200 }))
  })
  it('downloads an owned video as an attachment without changing inline preview', async () => {
    const attachment = await GET(request())
    expect(attachment.headers.get('content-disposition')).toBe('attachment; filename="render.mp4"')
    expect(attachment.headers.get('content-type')).toBe('video/mp4')
    expect(await attachment.text()).toBe('video')
    expect((await GET(request('reels/owned/render.mp4', false))).headers.get('content-disposition')).toBeNull()
  })
  it('does not expose a foreign asset or storage call', async () => {
    mocks.allowed.mockResolvedValue(false)
    expect((await GET(request())).status).toBe(404)
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('keeps authentication ahead of asset access', async () => {
    mocks.user.mockResolvedValue(NextResponse.json({ error: 'Sign in' }, { status: 401 }))
    expect((await GET(request())).status).toBe(401)
    expect(mocks.allowed).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it('keeps byte-range responses seekable', async () => {
    mocks.stream.mockResolvedValue({ body: Readable.from([Buffer.from('ide')]), contentLength: 3, contentRange: 'bytes 1-3/5', statusCode: 206 })
    const response = await GET(request('reels/owned/render.mp4', false, 'bytes=1-3'))
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 1-3/5')
    expect(mocks.stream).toHaveBeenCalledWith('reels/owned/render.mp4', 'bytes=1-3')
  })
  it('makes unsafe filename characters harmless in attachment headers', async () => {
    const response = await GET(request('reels/owned/évil"\r\nX-Bad: injected.mp4'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="[a-zA-Z0-9._-]+"$/)
    expect(response.headers.has('x-bad')).toBe(false)
  })
  it('limits repeated downloads before storage access', async () => {
    mocks.limit.mockResolvedValue({ ok: false })
    expect((await GET(request())).status).toBe(429)
    expect(mocks.stream).not.toHaveBeenCalled()
  })
})
