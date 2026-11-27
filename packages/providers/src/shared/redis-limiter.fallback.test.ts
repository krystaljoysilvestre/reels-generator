import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The limiter caches its Redis client per module, so each case imports a fresh copy under its own env.
async function freshLimiter(redisUrl: string | undefined) {
  vi.resetModules()
  if (redisUrl === undefined) vi.stubEnv('REDIS_URL', '')
  else vi.stubEnv('REDIS_URL', redisUrl)
  return import('./redis-limiter.js')
}

// Nothing listens on port 1; the connection is refused, the way it is during a Redis outage.
const UNREACHABLE = 'redis://127.0.0.1:1'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('checkRateLimit without Redis', () => {
  it('still enforces the limit in process when REDIS_URL is unset', async () => {
    const { checkRateLimit } = await freshLimiter(undefined)
    const key = `t:unset:${Math.random()}`
    const results = []
    for (let i = 0; i < 5; i++) results.push((await checkRateLimit(key, 3, 60_000)).ok)
    expect(results).toEqual([true, true, true, false, false])
  })

  it('reports a retry delay inside the window and resets when the window rolls', async () => {
    vi.useFakeTimers({ now: 1_000_000 * 60_000 + 10_000, toFake: ['Date'] })
    try {
      const { checkRateLimit } = await freshLimiter(undefined)
      const key = `t:roll:${Math.random()}`
      await checkRateLimit(key, 1, 60_000)
      const blocked = await checkRateLimit(key, 1, 60_000)
      expect(blocked).toEqual({ ok: false, retryAfterSec: 50 })
      vi.setSystemTime(Date.now() + 50_000)
      expect((await checkRateLimit(key, 1, 60_000)).ok).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts keys independently', async () => {
    const { checkRateLimit } = await freshLimiter(undefined)
    const a = `t:a:${Math.random()}`
    const b = `t:b:${Math.random()}`
    await checkRateLimit(a, 1, 60_000)
    expect((await checkRateLimit(a, 1, 60_000)).ok).toBe(false)
    expect((await checkRateLimit(b, 1, 60_000)).ok).toBe(true)
  })
})

describe('Redis configured but unreachable (outage)', () => {
  it('checkRateLimit answers within its timeout and keeps limiting', async () => {
    const { checkRateLimit } = await freshLimiter(UNREACHABLE)
    const key = `t:down:${Math.random()}`
    const started = Date.now()
    const results = []
    for (let i = 0; i < 4; i++) results.push((await checkRateLimit(key, 2, 60_000)).ok)
    expect(results).toEqual([true, true, false, false])
    // First call may wait out the 750ms timeout while ioredis is still connecting; later ones skip Redis.
    expect(Date.now() - started).toBeLessThan(2_500)
  })

  it('concurrent checks during the outage all resolve and only `max` pass', async () => {
    const { checkRateLimit } = await freshLimiter(UNREACHABLE)
    const key = `t:burst:${Math.random()}`
    const started = Date.now()
    const results = await Promise.all(Array.from({ length: 25 }, () => checkRateLimit(key, 10, 60_000)))
    expect(results.filter((r) => r.ok)).toHaveLength(10)
    expect(Date.now() - started).toBeLessThan(2_500)
  })

  it('acquireRateToken returns instead of hanging', async () => {
    const { acquireRateToken } = await freshLimiter(UNREACHABLE)
    const started = Date.now()
    for (let i = 0; i < 3; i++) await acquireRateToken(`t:acq:${Math.random()}`, { max: 1, windowMs: 60_000 })
    expect(Date.now() - started).toBeLessThan(2_500)
  })

  it('warns once per outage, not per request', async () => {
    const { checkRateLimit } = await freshLimiter(UNREACHABLE)
    for (let i = 0; i < 5; i++) await checkRateLimit(`t:warn:${i}`, 10, 60_000)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
