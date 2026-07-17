// Smoke test for the creator-loop build (post metadata + scheduler + thumbnail query).
// Runs the real generate_post_meta step on an existing reel (one small LLM call), a scheduler
// no-op tick, and the export route's hero-scene thumbnail selection — without a full pipeline run.
// Usage: tsx scripts/smoke-creator-loop.ts <reelId>
import '../src/env.js'
void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('Usage: tsx scripts/smoke-creator-loop.ts <reelId>')
  const { getDb, reels, scenes, assets } = await import('@reels/db')
  const { generatePostMeta } = await import('../src/pipeline/steps/generate-post-meta.js')
  const { runAutoProduceTick } = await import('../src/scheduler.js')
  const { eq, and, asc, count } = await import('drizzle-orm')
  const db = getDb()
  const countReels = async () => (await db.select({ value: count() }).from(reels))[0]?.value ?? 0

  // ── 1. generate_post_meta, live ────────────────────────────────────────────
  console.log('── [1/3] generate_post_meta on', reelId)
  const before = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { costCents: true } })
  await generatePostMeta(reelId)
  const after = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { postMeta: true, costCents: true } })
  console.log('postMeta:', JSON.stringify(after?.postMeta, null, 2))
  console.log(`cost: ${(before?.costCents ?? 0)}¢ → ${(after?.costCents ?? 0)}¢ (Δ ${(after?.costCents ?? 0) - (before?.costCents ?? 0)}¢)`)

  // ── 2. scheduler tick (no channels enabled → must no-op cleanly) ───────────
  console.log('── [2/3] scheduler tick (expect: no output, no reels created)')
  const reelCountBefore = await countReels()
  await runAutoProduceTick()
  const reelCountAfter = await countReels()
  console.log(`reels before/after tick: ${reelCountBefore}/${reelCountAfter} ${reelCountBefore === reelCountAfter ? '✓ no-op' : '✗ CREATED REELS UNEXPECTEDLY'}`)

  // ── 3. thumbnail hero-scene selection (the export route's query) ───────────
  console.log('── [3/3] thumbnail selection')
  const hero =
    (await db.query.scenes.findFirst({
      where: and(eq(scenes.reelId, reelId), eq(scenes.isHero, true)),
      orderBy: [asc(scenes.idx)],
      columns: { idx: true, imageAssetId: true },
    })) ??
    (await db.query.scenes.findFirst({
      where: eq(scenes.reelId, reelId),
      orderBy: [asc(scenes.idx)],
      columns: { idx: true, imageAssetId: true },
    }))
  if (hero?.imageAssetId) {
    const img = await db.query.assets.findFirst({ where: eq(assets.id, hero.imageAssetId) })
    console.log(`hero scene idx=${hero.idx}, image asset=${img?.storageKey ?? 'MISSING'} ✓`)
  } else {
    console.log('✗ no hero scene / image found')
  }
  process.exit(0)
})()
