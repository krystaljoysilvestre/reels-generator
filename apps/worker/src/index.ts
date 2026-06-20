import './env.js'
import { initSentry } from './monitoring/sentry.js'
import { startBullBoard } from './monitoring/bull-board.js'
import { makeWorker, QUEUE } from './queues/index.js'
import { dispatchPipelineJob } from './pipeline/dispatcher.js'
import { markReelFailed } from './pipeline/harness.js'

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
  // instead of a silent stall. `attemptsMade` equals `attempts` only on the final failure. Skip
  // channel-scoped jobs (generate_channel_beds puts a channelId in reelId, not a real reel).
  const maxAttempts = job?.opts.attempts ?? 1
  if (job && reelId && stepName !== 'generate_channel_beds' && job.attemptsMade >= maxAttempts) {
    void markReelFailed(reelId, stepName, err.message)
      .then(() => console.error(`[worker] reel ${reelId.slice(0, 8)} → FAILED (${stepName} exhausted ${maxAttempts} attempts)`))
      .catch((e) => console.error('[worker] could not mark reel failed:', e))
  }
})

// ── Bull Board UI ────────────────────────────────────────────────────────────
const BULL_BOARD_PORT = parseInt(process.env['BULL_BOARD_PORT'] ?? '3001', 10)
startBullBoard(BULL_BOARD_PORT)

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down worker…')
  await pipelineWorker.close()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('[worker] started — pipeline worker + bull-board running')
