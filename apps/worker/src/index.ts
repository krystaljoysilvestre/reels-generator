import './env.js'
import type { Worker } from 'bullmq'
import { initSentry } from './monitoring/sentry.js'
import { startBullBoard } from './monitoring/bull-board.js'
import { makeWorker, QUEUE } from './queues/index.js'
import { dispatchPipelineJob } from './pipeline/dispatcher.js'
import { markReelFailed } from './pipeline/harness.js'
import { registerAutoProduceSchedule, runAutoProduceTick, AUTO_PRODUCE_JOB } from './scheduler.js'
import { registerDigestSchedule, runDailyDigest, DAILY_DIGEST_JOB } from './digest.js'
import { registerMetricsPollSchedule, runMetricsPoll, METRICS_POLL_JOB } from './metrics-poll.js'

initSentry()

// Process roles let the worker scale horizontally: run one `scheduler` process, N `pipeline`, and M
// `render`. Default `all` = the single-process dev/box behavior. The global provider cap
// (@reels/providers Redis limiter) is what makes running many pipeline/render processes safe.
type Role = 'all' | 'pipeline' | 'render' | 'scheduler'
const ROLE = (process.env['WORKER_ROLE'] ?? 'all') as Role
const runs = (r: Exclude<Role, 'all'>) => ROLE === 'all' || ROLE === r

const started: Worker[] = []

// Shared pipeline-job handlers (identical for the pipeline and render workers — same dispatcher).
function attachHandlers(worker: Worker, label: string): Worker {
  worker.on('completed', (job) => {
    console.log(`[${label}] ✓ ${job.data.stepName} (${job.data.reelId.slice(0, 8)})`)
  })
  worker.on('failed', (job, err) => {
    const stepName = job?.data.stepName ?? '?'
    const reelId = job?.data.reelId
    console.error(`[${label}] ✗ ${stepName} (${reelId?.slice(0, 8) ?? '?'}):`, err.message)
    // On PERMANENT failure (BullMQ retries exhausted), flip the reel to 'failed' so the operator SEES it
    // instead of a silent stall. `attemptsMade` equals `attempts` only on the final failure.
    const maxAttempts = job?.opts.attempts ?? 1
    const permanent = job && (job.attemptsMade >= maxAttempts || err.name === 'UnrecoverableError')
    if (permanent && reelId) {
      void markReelFailed(reelId, stepName, err.message)
        .then(() => console.error(`[${label}] reel ${reelId.slice(0, 8)} → FAILED (${stepName} exhausted ${maxAttempts} attempts)`))
        .catch((e) => console.error(`[${label}] could not mark reel failed:`, e))
    }
  })
  return worker
}

// ── Pipeline worker (everything except the heavy render step) ────────────────
if (runs('pipeline')) {
  const concurrency = Number(process.env['PIPELINE_CONCURRENCY'] ?? 4) // render moved to its own queue
  started.push(attachHandlers(makeWorker(QUEUE.PIPELINE, (job) => dispatchPipelineJob(job), concurrency), 'pipeline'))
  console.log(`[worker] pipeline worker started (concurrency ${concurrency})`)
}

// ── Render worker (Remotion + ffmpeg — CPU/RAM bound, low concurrency) ───────
if (runs('render')) {
  const concurrency = Number(process.env['RENDER_CONCURRENCY'] ?? 1)
  started.push(attachHandlers(makeWorker(QUEUE.RENDER, (job) => dispatchPipelineJob(job), concurrency), 'render'))
  console.log(`[worker] render worker started (concurrency ${concurrency})`)
}

// ── Scheduler: auto-produce ticks + daily digest + metrics poll ──────────────
// Repeatable jobs are registered here (idempotent). Only the scheduler role runs this worker + Bull
// Board, so with multiple pipeline/render processes the ticks aren't consumed by every process.
if (runs('scheduler')) {
  const schedulerWorker = makeWorker(
    QUEUE.SCHEDULER,
    async (job) => {
      if (job.name === AUTO_PRODUCE_JOB) await runAutoProduceTick()
      else if (job.name === DAILY_DIGEST_JOB) await runDailyDigest()
      else if (job.name === METRICS_POLL_JOB) await runMetricsPoll()
    },
    1,
  )
  schedulerWorker.on('failed', (job, err) => {
    console.error(`[scheduler] ${job?.name ?? 'job'} failed:`, err.message)
  })
  started.push(schedulerWorker)
  void registerAutoProduceSchedule().catch((e) => console.error('[scheduler] could not register schedule:', e))
  void registerDigestSchedule().catch((e) => console.error('[scheduler] could not register digest:', e))
  void registerMetricsPollSchedule().catch((e) => console.error('[scheduler] could not register metrics poll:', e))

  const BULL_BOARD_PORT = parseInt(process.env['BULL_BOARD_PORT'] ?? '3001', 10)
  startBullBoard(BULL_BOARD_PORT)
  console.log('[worker] scheduler worker + bull-board started')
}

// Graceful shutdown — close whatever this process started.
async function shutdown() {
  console.log('Shutting down worker…')
  await Promise.all(started.map((w) => w.close()))
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log(`[worker] started — role=${ROLE}`)
