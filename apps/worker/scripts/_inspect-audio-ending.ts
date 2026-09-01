// Read-only audio-ending diagnostic for one reel.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-audio-ending.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-audio-ending <reelId>')
  const { getDb, reels, pipelineSteps } = await import('@reels/db')
  const { asc, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.reelId, reelId),
    orderBy: [asc(pipelineSteps.startedAt)],
  })
  console.log(JSON.stringify({
    reel: { status: reel.status, costCents: reel.costCents, renderUrl: reel.renderUrl, musicKey: reel.musicKey },
    timings: reel.timings ? {
      durationMs: (reel.timings as { durationMs?: unknown }).durationMs,
      music: (reel.timings as { music?: unknown }).music,
      ending: (reel.timings as { ending?: unknown }).ending,
      outroTailMs: (reel.timings as { outroTailMs?: unknown }).outroTailMs,
    } : null,
    audioScript: reel.audioScript ? {
      music: (reel.audioScript as { music?: unknown }).music,
      ending: (reel.audioScript as { ending?: unknown }).ending,
    } : null,
    steps: steps.filter((step) => ['generate_tts', 'annotate_audio_script', 'compute_timings', 'generate_sfx', 'animate_scenes', 'generate_music', 'mix_audio', 'render', 'render_qa'].includes(step.stepName)).map((step) => ({
      stepName: step.stepName,
      status: step.status,
      attempt: step.attempt,
      costCents: step.costCents,
      error: step.error,
      output: ['mix_audio', 'render', 'render_qa'].includes(step.stepName) ? step.output : undefined,
    })),
  }, null, 2))
  process.exit(0)
})()
