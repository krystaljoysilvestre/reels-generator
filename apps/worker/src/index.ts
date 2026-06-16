import './env.js'
import { initSentry } from './monitoring/sentry.js'
import { startBullBoard } from './monitoring/bull-board.js'
import { makeWorker, QUEUE } from './queues/index.js'
import { dispatchPipelineJob } from './pipeline/dispatcher.js'

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
  console.error(`[worker] ✗ ${job?.data.stepName ?? '?'} (${job?.data.reelId?.slice(0, 8) ?? '?'}):`, err.message)
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
