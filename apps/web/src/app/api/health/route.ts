import { buildInfo } from '@reels/core/build-info'
import { getDb } from '@reels/db'
import { makeQueue, QUEUE } from '@reels/queue'
import { readWorkerBuild, UNKNOWN_WORKER_BUILD, type WorkerBuild } from '@reels/queue/worker-build'
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

// Best effort and never the reason the probe fails or stalls: liveness is decided by the Postgres and
// Redis checks alone. A missing, expired or malformed key, an unreachable Redis, or a read slower than
// the budget all read as `unknown`.
const WORKER_BUILD_READ_BUDGET_MS = 1_000

async function workerBuild(): Promise<WorkerBuild> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<WorkerBuild>((resolve) => {
    timer = setTimeout(() => resolve(UNKNOWN_WORKER_BUILD), WORKER_BUILD_READ_BUDGET_MS)
  })
  try {
    const read = healthQueue().client.then((client) => readWorkerBuild(client))
    return await Promise.race([read, budget])
  } catch {
    return UNKNOWN_WORKER_BUILD
  } finally {
    clearTimeout(timer)
  }
}

function response(ok: boolean, status: 200 | 503, worker: WorkerBuild) {
  const { short, source } = buildInfo()
  return NextResponse.json(
    // `build` is deliberately here and deliberately public. It is none of the four things this probe
    // withholds — not tenant, queue, spend or infrastructure detail — and both a supervisor and the
    // founder need to answer "which commit is running?" without a session, which is exactly what was
    // impossible on 2026-09-04 when web and worker had silently drifted apart. It reports the SHA the
    // process was stamped with, or `unknown`; it never infers one. Reported on 503 too — a failing
    // dependency is when you most want to know what is deployed.
    //
    // `workerBuild` is the worker's own report of its commit (see @reels/queue/worker-build), relayed
    // through Redis because the worker has no public surface. Like `build`, it is a short SHA or
    // `unknown`, never inferred, and `unknown` also covers a worker that is down or predates the report.
    {
      ok,
      build: short,
      buildSource: source,
      workerBuild: worker.build,
      workerBuildSource: worker.source,
    },
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
// here. The worker is private and has no HTTP surface, so its build arrives second-hand: the worker
// writes it to Redis on a heartbeat and this probe relays it as `workerBuild`.
export async function GET() {
  try {
    await Promise.all([
      getDb().execute(sql`select 1`),
      healthQueue().waitUntilReady(),
    ])
    return response(true, 200, await workerBuild())
  } catch (error) {
    console.error('[health] dependency check failed', error)
    return response(false, 503, await workerBuild())
  }
}
