import './env.js'
import { initSentry } from './monitoring/sentry.js'
import { startBullBoard } from './monitoring/bull-board.js'
import { makeWorker, QUEUE } from './queues/index.js'
import { dispatchPipelineJob } from './pipeline/dispatcher.js'
import { markReelFailed } from './pipeline/harness.js'
import { registerAutoProduceSchedule, runAutoProduceTick, AUTO_PRODUCE_JOB } from './scheduler.js'
import { registerDigestSchedule, runDailyDigest, DAILY_DIGEST_JOB } from './digest.js'
import { registerMetricsPollSchedule, runMetricsPoll, METRICS_POLL_JOB } from './metrics-poll.js'

initSentry()

// ── Pipeline worker ──────────────────────────────────────────────────────────
const pipelineWorker = makeWorker(
  QUEUE.PIPELINE,
  async (job) => {
    await dispatchPipelineJob(job)
  },
  /* concurrency = */ 2,
)

pipelineWorker.on('completed', (job) => {
  console.log(`[worker] ✓ ${job.data.stepName} (${job.data.reelId.slice(0, 8)})`)
})

pipelineWorker.on('failed', (job, err) => {
  const stepName = job?.data.stepName ?? '?'
  const reelId = job?.data.reelId
  console.error(`[worker] ✗ ${stepName} (${reelId?.slice(0, 8) ?? '?'}):`, err.message)
  // On PERMANENT failure (BullMQ retries exhausted), flip the reel to 'failed' so the operator SEES it
  // instead of a silent stall. `attemptsMade` equals `attempts` only on the final failure.
  const maxAttempts = job?.opts.attempts ?? 1
  const permanent = job && (job.attemptsMade >= maxAttempts || err.name === 'UnrecoverableError')
  if (permanent && reelId) {
    void markReelFailed(reelId, stepName, err.message)
      .then(() => console.error(`[worker] reel ${reelId.slice(0, 8)} → FAILED (${stepName} exhausted ${maxAttempts} attempts)`))
      .catch((e) => console.error('[worker] could not mark reel failed:', e))
  }
})

// ── Scheduler: auto-produce ticks + the daily digest ─────────────────────────
// Repeatable jobs registered on boot (idempotent). The auto-produce tick creates reels on each
// channel's cadence (postingRules.autoProduce) — quota- and backlog-guarded, so extra ticks are
// no-ops. The digest is one morning email of the shelf state (env-gated; skips silently when unset).
const schedulerWorker = makeWorker(
  QUEUE.SCHEDULER,
  async (job) => {
    if (job.name === AUTO_PRODUCE_JOB) await runAutoProduceTick()
    else if (job.name === DAILY_DIGEST_JOB) await runDailyDigest()
    else if (job.name === METRICS_POLL_JOB) await runMetricsPoll()
  },
  /* concurrency = */ 1,
)
schedulerWorker.on('failed', (job, err) => {
  console.error(`[scheduler] ${job?.name ?? 'job'} failed:`, err.message)
})
void registerAutoProduceSchedule().catch((e) => console.error('[scheduler] could not register schedule:', e))
void registerDigestSchedule().catch((e) => console.error('[scheduler] could not register digest:', e))
void registerMetricsPollSchedule().catch((e) => console.error('[scheduler] could not register metrics poll:', e))

// ── Bull Board UI ────────────────────────────────────────────────────────────
const BULL_BOARD_PORT = parseInt(process.env['BULL_BOARD_PORT'] ?? '3001', 10)
startBullBoard(BULL_BOARD_PORT)

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down worker…')
  await pipelineWorker.close()
  await schedulerWorker.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('[worker] started — pipeline worker + bull-board running')
