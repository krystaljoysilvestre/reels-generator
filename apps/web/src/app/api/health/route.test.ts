import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  waitUntilReady: vi.fn(),
  makeQueue: vi.fn(),
}))

vi.mock('@reels/db', () => ({
  getDb: () => ({ execute: mocks.execute }),
}))

vi.mock('@reels/queue', () => ({
  QUEUE: { PIPELINE: 'pipeline' },
  makeQueue: mocks.makeQueue,
}))

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue([])
    mocks.waitUntilReady.mockResolvedValue(undefined)
    mocks.makeQueue.mockReturnValue({ waitUntilReady: mocks.waitUntilReady })
    delete (globalThis as typeof globalThis & { __kendrixHealthQueue?: unknown }).__kendrixHealthQueue
  })

  it('reports ready only after Postgres and Redis are reachable', async () => {
    const { GET } = await import('./route')
    const result = await GET()

    expect(result.status).toBe(200)
    await expect(result.json()).resolves.toEqual({ ok: true })
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.waitUntilReady).toHaveBeenCalledOnce()
    expect(result.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('returns a generic unavailable response without leaking the failing dependency', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.execute.mockRejectedValue(new Error('postgres connection string detail'))

    const { GET } = await import('./route')
    const result = await GET()

    expect(result.status).toBe(503)
    await expect(result.json()).resolves.toEqual({ ok: false })
  })
})
