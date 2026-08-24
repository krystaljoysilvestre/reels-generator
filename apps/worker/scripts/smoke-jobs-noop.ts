// Smoke: the scheduler-queue jobs must exit cleanly when their env keys are absent.
// Usage: tsx scripts/smoke-jobs-noop.ts
import '../src/env.js'
void (async () => {
  const { runMetricsPoll } = await import('../src/metrics-poll.js')
  const { runDailyDigest } = await import('../src/digest.js')
  const { youtubeAppConfigured } = await import('@reels/db')
  await runMetricsPoll()
  console.log(`metrics poll: completed ✓ (YouTube OAuth app configured: ${youtubeAppConfigured()})`)
  await runDailyDigest()
  console.log('digest: completed ✓ (Resend configured: ' + Boolean(process.env['RESEND_API_KEY']) + ')')
  process.exit(0)
})()
