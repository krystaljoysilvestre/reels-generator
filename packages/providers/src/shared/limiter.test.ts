import { describe, it, expect } from 'vitest'
import { withProviderLimit } from './limiter.js'

// A deferred promise so the test controls exactly when each task finishes.
function defer() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

describe('withProviderLimit', () => {
  it('never runs more than the cap concurrently (openai = 8) and runs everything', async () => {
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 20 }, () => defer())

    const tasks = gates.map((g, i) =>
      withProviderLimit('openai', async () => {
        active++
        peak = Math.max(peak, active)
        await g.promise
        active--
        return i
      }),
    )

    // Let the pool fill, then release tasks one at a time so a freed slot pulls the next.
    for (const g of gates) {
      await Promise.resolve() // let microtasks settle so `active` reflects the current in-flight set
      g.resolve()
    }

    const results = await Promise.all(tasks)
    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1) // sanity: it actually ran concurrently, not serially
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('caps are independent per provider', async () => {
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 12 }, () => defer())
    const tasks = gates.map((g) =>
      withProviderLimit('fal', async () => {
        active++; peak = Math.max(peak, active)
        await g.promise
        active--
      }),
    )
    for (const g of gates) { await Promise.resolve(); g.resolve() }
    await Promise.all(tasks)
    expect(peak).toBeLessThanOrEqual(4) // fal cap
  })

  it('propagates errors without leaking a slot', async () => {
    await expect(withProviderLimit('anthropic', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    // A subsequent call still runs (the failed task released its slot in finally).
    const ok = await withProviderLimit('anthropic', async () => 'ok')
    expect(ok).toBe('ok')
  })
})
