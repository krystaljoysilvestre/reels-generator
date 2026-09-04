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
    // `unknown` is the correct answer in a test process: nothing stamped this build, and the probe
    // must say so rather than infer a commit from the working tree.
    await expect(result.json()).resolves.toEqual({ ok: true, build: 'unknown', buildSource: 'none' })
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
    // Still exactly three keys, and the build is reported on failure too — a broken dependency is when
    // "which build is this?" matters most. The point of this test is unchanged: no dependency detail.
    const body = await result.json()
    expect(body).toEqual({ ok: false, build: 'unknown', buildSource: 'none' })
    expect(JSON.stringify(body)).not.toContain('postgres')
  })

  it('reports the stamped commit when the image carries one', async () => {
    vi.stubEnv('BUILD_COMMIT', 'ffd4d5661f2a3b4c5d6e7f8091a2b3c4d5e6f708')

    const { GET } = await import('./route')
    const result = await GET()

    await expect(result.json()).resolves.toEqual({
      ok: true,
      build: 'ffd4d56',
      buildSource: 'env',
    })
    vi.unstubAllEnvs()
  })
})
