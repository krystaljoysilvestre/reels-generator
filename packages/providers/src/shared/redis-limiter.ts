import { Redis } from 'ioredis'

// Cross-process rate gate. The in-process semaphore in limiter.ts only bounds ONE worker process; the
// moment we run N pipeline/render workers, aggregate provider calls become N× the local cap — blowing
// past provider account limits and spend controls. This Redis fixed-window counter bounds the GLOBAL
// request rate per provider regardless of process count. Chosen over a distributed concurrency semaphore
// deliberately: a counter is stateless per call, so a crashing worker can never leak a held slot.
//
// Redis outages must never stall a caller. Every Redis call is bounded by REDIS_OP_TIMEOUT_MS, and a
// connection ioredis already knows is down is skipped without waiting. (This client used to set
// maxRetriesPerRequest: null, which queued commands until Redis came back. A Redis outage then hung every
// sign-up, sign-in and account-email request, and every provider call behind acquireRateToken.)

export type RateLimit = { max: number; windowMs: number }

const REDIS_OP_TIMEOUT_MS = 750

let client: Redis | null | undefined // undefined = not yet resolved; null = no REDIS_URL
let degraded = false

function getRedis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env['REDIS_URL']
  if (!url) {
    client = null
    return null
  }
  const c = new Redis(url, {
    // Reject a queued command after one failed reconnect instead of holding it until Redis returns.
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  })
  c.on('error', () => {
    /* swallow — a Redis hiccup must not crash the process; callers degrade (see below) */
  })
  c.on('ready', () => {
    if (degraded) console.info('[rate-limit] Redis reachable again; using shared limits')
    degraded = false
  })
  client = c
  return c
}

function markDegraded(): void {
  if (!degraded) console.warn('[rate-limit] Redis unavailable; rate limits fall back to this process')
  degraded = true
}

// Atomic: increment this window's counter and set its TTL on first hit. Returns the post-incr count.
const INCR_WINDOW = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c
`

// The window's post-increment count from Redis, or null when Redis is unusable right now (known down,
// erroring, or slower than REDIS_OP_TIMEOUT_MS). Never waits longer than the timeout.
async function incrWindow(r: Redis, redisKey: string, ttlMs: number): Promise<number | null> {
  // 'wait'/'connecting'/'connect'/'ready' may still answer; these three mean it cannot right now.
  if (r.status === 'reconnecting' || r.status === 'close' || r.status === 'end') return null
  const op = r.eval(INCR_WINDOW, 1, redisKey, String(ttlMs)) as Promise<number>
  op.catch(() => {}) // the timeout may win; a later rejection must not surface as unhandled
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      op,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), REDIS_OP_TIMEOUT_MS)
      }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── In-process fallback for checkRateLimit ────────────────────────────────────────────────────────
// Same fixed window, counted per process. With N web instances the effective cap during an outage is
// N × max, which is looser than the shared limit but still a limit, and legitimate users are never
// locked out. Bounded so a key-spraying client cannot grow memory without limit.
const MEMORY_MAX_KEYS = 50_000
const memory = new Map<string, { bucket: number; windowMs: number; count: number }>()

function memoryHit(key: string, bucket: number, windowMs: number): number {
  const mapKey = `${key}|${windowMs}`
  let entry = memory.get(mapKey)
  if (!entry || entry.bucket !== bucket) {
    entry = { bucket, windowMs, count: 0 }
    memory.delete(mapKey) // re-insert so Map order stays oldest-first for eviction
    memory.set(mapKey, entry)
  }
  entry.count += 1
  if (memory.size > MEMORY_MAX_KEYS) pruneMemory()
  return entry.count
}

function pruneMemory(): void {
  const now = Date.now()
  for (const [k, e] of memory) if (Math.floor(now / e.windowMs) !== e.bucket) memory.delete(k)
  for (const k of memory.keys()) {
    if (memory.size <= MEMORY_MAX_KEYS) break
    memory.delete(k)
  }
}

// Block until this call fits under `limit` for `key` (fixed window). Degrades to a no-op if Redis is
// unset, down or slow — the in-process semaphore still applies, so we never hard-block the pipeline on Redis.
export async function acquireRateToken(key: string, limit: RateLimit): Promise<void> {
  const r = getRedis()
  if (!r) return
  for (let attempt = 0; attempt < 600; attempt++) {
    const now = Date.now()
    const bucket = Math.floor(now / limit.windowMs)
    const count = await incrWindow(r, `ratelimit:${key}:${bucket}`, limit.windowMs * 2)
    if (count === null) {
      markDegraded()
      return // Redis unavailable → don't block; local semaphore is the fallback cap
    }
    if (count <= limit.max) return
    // Over cap for this window — wait until the next window boundary (+ jitter to avoid a thundering herd).
    const waitMs = (bucket + 1) * limit.windowMs - now
    await new Promise<void>((res) => setTimeout(res, waitMs + Math.floor(Math.random() * 100)))
  }
}

// Non-blocking fixed-window check for request-facing paths (auth: register / sign-in brute-force,
// account email, downloads). It never waits on a limit: it reports whether THIS hit is within `max` for the
// current window and how long until the window resets. Shared across processes through Redis; when Redis is
// unset, down or slow it counts in this process instead, so the limit still holds and nothing hangs.
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const r = getRedis()
  const now = Date.now()
  const bucket = Math.floor(now / windowMs)
  let count = r ? await incrWindow(r, `ratelimit:${key}:${bucket}`, windowMs * 2) : null
  if (count === null) {
    if (r) markDegraded()
    count = memoryHit(key, bucket, windowMs)
  }
  if (count <= max) return { ok: true, retryAfterSec: 0 }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000)) }
}
