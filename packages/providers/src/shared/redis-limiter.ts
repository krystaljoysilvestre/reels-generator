import { Redis } from 'ioredis'

// Cross-process rate gate. The in-process semaphore in limiter.ts only bounds ONE worker process; the
// moment we run N pipeline/render workers, aggregate provider calls become N× the local cap — blowing
// past provider account limits and spend controls. This Redis fixed-window counter bounds the GLOBAL
// request rate per provider regardless of process count. Chosen over a distributed concurrency semaphore
// deliberately: a counter is stateless per call, so a crashing worker can never leak a held slot.

export type RateLimit = { max: number; windowMs: number }

let client: Redis | null | undefined // undefined = not yet resolved; null = unavailable (degrade)

function getRedis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env['REDIS_URL']
  if (!url) {
    client = null
    return null
  }
  const c = new Redis(url, { maxRetriesPerRequest: null })
  c.on('error', () => {
    /* swallow — a Redis hiccup must not crash the process; acquireRateToken degrades to no-op */
  })
  client = c
  return c
}

// Atomic: increment this window's counter and set its TTL on first hit. Returns the post-incr count.
const INCR_WINDOW = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c
`

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Block until this call fits under `limit` for `key` (fixed window). Degrades to a no-op if Redis is
// unset or erroring — the in-process semaphore still applies, so we never hard-block the pipeline on Redis.
export async function acquireRateToken(key: string, limit: RateLimit): Promise<void> {
  const r = getRedis()
  if (!r) return
  for (let attempt = 0; attempt < 600; attempt++) {
    const now = Date.now()
    const bucket = Math.floor(now / limit.windowMs)
    const redisKey = `ratelimit:${key}:${bucket}`
    let count: number
    try {
      count = (await r.eval(INCR_WINDOW, 1, redisKey, String(limit.windowMs * 2))) as number
    } catch {
      return // Redis unavailable → don't block; local semaphore is the fallback cap
    }
    if (count <= limit.max) return
    // Over cap for this window — wait until the next window boundary (+ jitter to avoid a thundering herd).
    const waitMs = (bucket + 1) * limit.windowMs - now
    await sleep(waitMs + Math.floor(Math.random() * 100))
  }
}

// Non-blocking fixed-window check for request-facing paths (auth: register / sign-in brute-force). Unlike
// acquireRateToken it never waits — it reports whether THIS hit is within `max` for the current window and
// how long until the window resets. Fail-OPEN if Redis is unset/erroring: this is defense-in-depth, and a
// Redis blip must never lock legitimate users out of signing in.
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const r = getRedis()
  if (!r) return { ok: true, retryAfterSec: 0 }
  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  const redisKey = `ratelimit:${key}:${bucket}`
  try {
    const count = (await r.eval(INCR_WINDOW, 1, redisKey, String(windowMs * 2))) as number
    if (count <= max) return { ok: true, retryAfterSec: 0 }
    return { ok: false, retryAfterSec: Math.ceil(((bucket + 1) * windowMs - now) / 1000) }
  } catch {
    return { ok: true, retryAfterSec: 0 } // Redis unavailable → don't block legitimate auth
  }
}
