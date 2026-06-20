// Resume/kick a pipeline step manually: pnpm --filter worker exec tsx scripts/enqueue.ts <reelId> <stepName>
// (env.ts resolves .env.local relative to cwd, so run via `pnpm --filter worker exec`.)
// Removes any existing job with the same deterministic id first, so a previously-failed step can
// actually be re-run (BullMQ dedupes by jobId and would otherwise return the stale failed job).
import '../src/env.js'

void (async () => {
  const [reelId, stepName, channelId] = process.argv.slice(2)
  if (!reelId || !stepName) {
    console.error('usage: enqueue <reelId> <stepName> [channelId]')
    process.exit(1)
  }
  const { makeQueue, QUEUE } = await import('@reels/queue')
  const q = makeQueue(QUEUE.PIPELINE)
  const jobId = `${reelId}__${stepName}`
  const existing = await q.getJob(jobId)
  if (existing) {
    await existing.remove()
    console.log(`removed stale job ${jobId}`)
  }
  await q.add(stepName, { reelId, stepName, ...(channelId ? { channelId } : {}) }, { jobId })
  console.log(`enqueued ${stepName} for ${reelId}`)
  await q.close()
  process.exit(0)
})()
