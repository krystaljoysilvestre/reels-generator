// Watch the render chain until spot_check/failed; print step transitions + final cost.
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-watch.ts <reelId>
import '../src/env.js'
void (async () => {
  const { getDb, reels, pipelineSteps } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const reelId = process.argv[2]!
  const seen = new Set<string>()
  let last = ''
  for (let i = 0; i < 240; i++) { // 240 × 15s = 60 min cap
    const r = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
    const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.reelId, reelId) })
    for (const s of steps) {
      const key = `${s.stepName}:${s.status}:${s.attempt}`
      if (!seen.has(key)) { seen.add(key); console.log(`  ${s.stepName} (a${s.attempt}) → ${s.status}${s.error ? ` (${String(s.error).slice(0, 140)})` : ''}`) }
    }
    if (r && r.status !== last) { console.log(`REEL → ${r.status}${r.alertNote ? ` [${r.alertNote}]` : ''} (${r.costCents}¢)`); last = r.status }
    if (r && ['spot_check', 'approved', 'failed', 'rejected'].includes(r.status)) break
    await new Promise((res) => setTimeout(res, 15_000))
  }
  const rF = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  console.log(`\nFINAL: ${rF?.status}, total ${rF?.costCents}¢`)
  process.exit(0)
})()
