// Gate-1 regenerate with founder's editorial notes (regen #1 of ≤2 for the hero-reel lap).
// Mirrors POST /api/pipeline/regenerate-story exactly (rejection row → rejected → drafting →
// re-enqueue generate_story), then polls back to story_review and prints the new take in full.
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-regen.ts <reelId>
import '../src/env.js'
void (async () => {
  const { getDb, reels, stories, rejections, pipelineSteps } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { enqueueStep } = await import('@reels/queue')
  const db = getDb()

  const reelId = process.argv[2]
  if (!reelId) throw new Error('Usage: hero-reel-regen.ts <reelId>')
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  if (reel.status !== 'story_review') throw new Error(`reel is '${reel.status}', expected story_review`)

  // Founder's craft notes, round 2, 2026-08-04 (9.6/10 read — SURGICAL revision, not a rewrite):
  const NOTE = [
    'This take is excellent — 9.6/10. DO NOT REWRITE IT. Keep the story exactly as it is: the unpicking of the sling ("Not tear it — unpick it"), the memories releasing knot by knot, the light running back through the repairs, "the ladder itself was learning where it had been mended", "By morning, it was a constellation", and the final Tender line. Apply ONLY these three changes:',
    '1) THE OPENING: "He found three rungs missing" is functional but not intriguing — the story ends at a 10 and opens at an 8. Make the first sentence create the same curiosity the last one creates emotion. In the spirit of (invent your own): "Halfway up the mountain, the ladder ended." / "Someone had stolen three rungs from the only ladder to the stars."',
    '2) Tighten "He could have climbed back down. He almost did." to something cleaner and more cinematic, e.g. "He almost turned back."',
    '3) The three memories: "the morning he scared the wolf" is oddly specific — it raises questions that never matter, while the other two are universal. Replace so the three memories tell ONE escalating emotional arc (e.g. first stone he threw → last game with his brother → the afternoon before his father stopped calling him little one — invent your own escalation, make it his).',
    'Everything else stays word-for-word where possible.',
  ].join('\n')

  await db.transaction(async (tx) => {
    await tx.update(reels).set({ status: 'rejected', updatedAt: new Date() }).where(eq(reels.id, reelId))
    await tx.insert(rejections).values({ reelId, reasonCode: 'other', note: NOTE })
  })
  await db.update(reels).set({ status: 'drafting', updatedAt: new Date() }).where(eq(reels.id, reelId))
  await enqueueStep({ reelId, stepName: 'generate_story', channelId: reel.channelId, language: reel.language })
  console.log('rejection recorded + generate_story re-enqueued; polling…\n')

  const seen = new Set<string>(['generate_story:done']) // ignore the previous run's completed row
  let last = ''
  for (let i = 0; i < 60; i++) {
    const r = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
    const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.reelId, reelId) })
    for (const s of steps) {
      const key = `${s.stepName}:${s.status}:${s.attempt}`
      if (!seen.has(key)) { seen.add(key); console.log(`  step ${s.stepName} (attempt ${s.attempt}) → ${s.status}${s.error ? ` (${String(s.error).slice(0, 160)})` : ''}`) }
    }
    if (r && r.status !== last) { console.log(`  REEL status → ${r.status}`); last = r.status }
    if (r && (r.status === 'story_review' || r.status === 'failed')) break
    await new Promise((res) => setTimeout(res, 10_000))
  }

  const rFinal = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  console.log(`\n── GATE 1 (take 2) ── status: ${rFinal?.status}, total cost so far: ${rFinal?.costCents}¢`)
  if (rFinal?.storyId) {
    const story = await db.query.stories.findFirst({ where: eq(stories.id, rFinal.storyId) })
    console.log(`\nTITLE: ${story?.title}`)
    console.log(`LOGLINE: ${story?.logline ?? '(none)'}`)
    console.log(`\n── FULL NARRATION (take 2) ──\n${story?.body}\n── END ──`)
  }
  process.exit(0)
})()
