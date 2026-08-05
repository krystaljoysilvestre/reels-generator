// Gate-1 approval for the hero-reel lap. Mirrors POST /api/pipeline/approve-story
// (status → storyboard, enqueue analyze_story), then polls the pre-gate chain
// (analyze_story → generate_post_meta → breakdown_scenes → generate_images) until the
// images are done, and prints the scene table + running cost for the gate-2 review.
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-approve.ts <reelId>
import '../src/env.js'
void (async () => {
  const { getDb, reels, scenes, pipelineSteps } = await import('@reels/db')
  const { eq, asc } = await import('drizzle-orm')
  const { enqueueStep } = await import('@reels/queue')
  const db = getDb()

  const reelId = process.argv[2]
  if (!reelId) throw new Error('Usage: hero-reel-approve.ts <reelId>')
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  if (reel.status !== 'story_review') throw new Error(`reel is '${reel.status}', expected story_review`)

  await db.update(reels).set({ status: 'storyboard', updatedAt: new Date() }).where(eq(reels.id, reelId))
  await enqueueStep({ reelId, stepName: 'analyze_story' })
  console.log('approved → storyboard; pre-gate chain running (bible → breakdown → images)…\n')

  const seen = new Set<string>()
  let lastImagesDone = false
  for (let i = 0; i < 90; i++) { // 15 min cap
    const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.reelId, reelId) })
    for (const s of steps) {
      const key = `${s.stepName}:${s.status}:${s.attempt}`
      if (!seen.has(key)) { seen.add(key); console.log(`  step ${s.stepName} (a${s.attempt}) → ${s.status}${s.error ? ` (${String(s.error).slice(0, 140)})` : ''}`) }
    }
    // The chain stops AT storyboard status; completion signal = generate_images done rows exist and none running.
    const imgSteps = steps.filter((s) => s.stepName.startsWith('generate_images'))
    const anyRunning = steps.some((s) => s.status === 'running' || s.status === 'pending')
    lastImagesDone = imgSteps.length > 0 && imgSteps.every((s) => s.status === 'done') && !anyRunning
    const r = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
    if (r?.status === 'failed') { console.log('REEL FAILED'); break }
    if (lastImagesDone) break
    await new Promise((res) => setTimeout(res, 10_000))
  }

  const rFinal = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const sceneRows = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId), orderBy: [asc(scenes.idx)] })
  console.log(`\n── GATE 2 ── status: ${rFinal?.status}, cost so far: ${rFinal?.costCents}¢, scenes: ${sceneRows.length}`)
  for (const s of sceneRows) {
    console.log(`  [${s.idx}] tier=${s.tier} ${String(s.narrationText ?? '').slice(0, 90)}`)
  }
  console.log(`\nnext: storyboard at http://localhost:3000/storyboard/${reelId}`)
  process.exit(0)
})()
