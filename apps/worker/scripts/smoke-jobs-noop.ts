// Smoke: the scheduler-queue jobs must exit cleanly when their env keys are absent.
// Usage: tsx scripts/smoke-jobs-noop.ts
import '../src/env.js'
void (async () => {
  const { runMetricsPoll } = await import('../src/metrics-poll.js')
  const { runDailyDigest } = await import('../src/digest.js')
  const { isYouTubeConfigured } = await import('@reels/providers')
  await runMetricsPoll()
  console.log(`metrics poll: completed ✓ (YouTube configured: ${isYouTubeConfigured()})`)
  await runDailyDigest()
  console.log('digest: completed ✓ (Resend configured: ' + Boolean(process.env['RESEND_API_KEY']) + ')')
  process.exit(0)
})()
