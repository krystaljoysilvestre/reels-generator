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
  return NextResponse.json(
    { ok },
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
// no mutation or paid work.
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
