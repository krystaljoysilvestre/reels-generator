import { describe, it, expect } from 'vitest'
import { acquireRateToken } from './redis-limiter.js'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const hasRedis = !!process.env['REDIS_URL']

// Needs a live Redis (REDIS_URL). Skipped otherwise — acquireRateToken degrades to a no-op without it.
describe.skipIf(!hasRedis)('acquireRateToken (distributed rate cap)', () => {
  it('allows up to max within a window, then blocks the next call until the window rolls', async () => {
    const windowMs = 2000
    // Align to just after a window boundary so the two allowed calls sit at the window head — makes the
    // "still blocked after 250ms" assertion deterministic (no boundary race).
    await sleep(windowMs - (Date.now() % windowMs) + 30)

    const key = `test:${Date.now()}`
    const limit = { max: 2, windowMs }

    await acquireRateToken(key, limit) // 1 — immediate
    await acquireRateToken(key, limit) // 2 — immediate

    const third = acquireRateToken(key, limit) // over cap → must wait for the next window
    const outcome = await Promise.race([
      third.then(() => 'resolved'),
      sleep(250).then(() => 'blocked'),
    ])
    expect(outcome).toBe('blocked')

    await third // eventually resolves once the window rolls over
  }, 6000)
})
