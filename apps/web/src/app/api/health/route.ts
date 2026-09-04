import { buildInfo } from '@reels/core/build-info'
import { getDb } from '@reels/db'
import { makeQueue, QUEUE } from '@reels/queue'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEALTH_QUEUE_KEY = '__kendrixHealthQueue' as const
const globalForHealth = globalThis as typeof globalThis & {
  [HEALTH_QUEUE_KEY]?: ReturnType<typeof makeQueue>
}

function healthQueue() {
  globalForHealth[HEALTH_QUEUE_KEY] ??= makeQueue(QUEUE.PIPELINE)
  return globalForHealth[HEALTH_QUEUE_KEY]
}

function response(ok: boolean, status: 200 | 503) {
  const { short, source } = buildInfo()
  return NextResponse.json(
    // `build` is deliberately here and deliberately public. It is none of the four things this probe
    // withholds — not tenant, queue, spend or infrastructure detail — and both a supervisor and the
    // founder need to answer "which commit is running?" without a session, which is exactly what was
    // impossible on 2026-09-04 when web and worker had silently drifted apart. It reports the SHA the
    // process was stamped with, or `unknown`; it never infers one. Reported on 503 too — a failing
    // dependency is when you most want to know what is deployed.
    { ok, build: short, buildSource: source },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}

// Deliberately unauthenticated: supervisors and the tunnel need a cheap liveness probe before a
// user session exists. It returns no tenant, queue, spend, or infrastructure details and performs
// no mutation or paid work. It reports its own build commit — see `response` for why that belongs
// here — and note it can only ever speak for the WEB service. The worker is private and has no HTTP
// surface, so the worker's build is read from its boot log, not from here.
export async function GET() {
  try {
    await Promise.all([
      getDb().execute(sql`select 1`),
      healthQueue().waitUntilReady(),
    ])
    return response(true, 200)
  } catch (error) {
    console.error('[health] dependency check failed', error)
    return response(false, 503)
  }
}
