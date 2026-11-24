// Which commit is the WORKER running, read from the web service.
//
// The worker is private and has no HTTP surface, so until now its build lived only in its boot log, and
// reading that needed Railway access from someone's machine. Railway also ages logs out, so a worker that
// has been up for weeks may no longer have a readable boot line at all. Instead the worker writes its own
// build into Redis on boot and refreshes it on a timer, and `/api/health` reports it beside the web build.
//
// Same rule as build-info: never guess. The key expires, so a worker that is down (or a build too old to
// write the key) reads as `unknown`, not as the last value anyone saw. The value is validated on the way
// out, so the public probe can only ever print a short SHA or `unknown`, never arbitrary Redis content.

export const WORKER_BUILD_KEY = 'kendrix:worker:build'

/** Refresh well inside the TTL so one missed tick does not blank the answer. */
export const WORKER_BUILD_REFRESH_MS = 5 * 60 * 1000
export const WORKER_BUILD_TTL_SECONDS = 15 * 60

export type WorkerBuild = { build: string; source: string }

export const UNKNOWN_WORKER_BUILD: WorkerBuild = { build: 'unknown', source: 'none' }

const SHORT_SHA = /^[0-9a-f]{7}$/
const SOURCES = new Set(['env', 'railway', 'stamp', 'none'])

export function encodeWorkerBuild(info: { short: string; source: string }): string {
  return JSON.stringify({ build: info.short, source: info.source })
}

export function decodeWorkerBuild(raw: string | null | undefined): WorkerBuild {
  if (!raw) return UNKNOWN_WORKER_BUILD
  try {
    const parsed = JSON.parse(raw) as Partial<WorkerBuild>
    const build = typeof parsed.build === 'string' ? parsed.build : ''
    const source = typeof parsed.source === 'string' ? parsed.source : ''
    if (!SOURCES.has(source)) return UNKNOWN_WORKER_BUILD
    if (build === 'unknown') return { build, source }
    return SHORT_SHA.test(build) ? { build, source } : UNKNOWN_WORKER_BUILD
  } catch {
    return UNKNOWN_WORKER_BUILD
  }
}

// Shaped after BullMQ's client adapter (`queue.client`), which takes structured expiry options.
type RedisWriter = {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>
}
type RedisReader = { get(key: string): Promise<string | null> }

export async function writeWorkerBuild(
  redis: RedisWriter,
  info: { short: string; source: string },
): Promise<void> {
  await redis.set(WORKER_BUILD_KEY, encodeWorkerBuild(info), { EX: WORKER_BUILD_TTL_SECONDS })
}

export async function readWorkerBuild(redis: RedisReader): Promise<WorkerBuild> {
  return decodeWorkerBuild(await redis.get(WORKER_BUILD_KEY))
}
