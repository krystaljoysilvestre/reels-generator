// Hero-reel lap TAKE 2 (PAID, supervised): the "what if?" science channel — Edge of Everything.
// Same shape as hero-reel-lap.ts; genre pivot per founder 2026-08-05 (fairytale reel rejected at spot_check).
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-lap2.ts [--fallback-seed]
import '../src/env.js'
void (async () => {
  const { getDb, channels, reels, stories, pipelineSteps } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { enqueueStep } = await import('@reels/queue')
  const { CAPTION_PRESETS } = await import('@reels/core')
  const db = getDb()

  const useFallback = process.argv.includes('--fallback-seed')
  const seedIdea = useFallback
    ? 'What if the Moon vanished tonight — and nobody noticed until the tides stopped?'
    : 'What if the Earth stopped spinning — just for one second?'

  const [ch] = await db.insert(channels).values({
    name: 'Edge of Everything',
    description: 'Science what-ifs at the edge of imagination.',
    nicheDescription:
      'Cinematic science what-ifs for everyone — one impossible question per reel, answered with real physics and staggering scale. The hook is the question itself; every frame makes the invisible visible. Awe first, numbers where they hit hardest, never a lecture.',
    languages: ['english'],
    genreCategory: 'informational',
    storyMode: 'standard',
    generationMode: 'review',
    targetPlatforms: ['tiktok', 'youtube_shorts', 'facebook_reels'],
    targetSeconds: 55,
    stylePreset:
      'cinematic sci-fi concept art, epic sense of scale, deep indigo and violet cosmic palette with one warm accent, volumetric light, crisp painterly detail, awe-inspiring wide compositions, illustration not a photograph',
    captionStyle: CAPTION_PRESETS.cinematic,
    voiceMode: 'single',
    voiceSearchKeyword: 'documentary narrator',
    voicePool: [],
    narrativeVoice: 'Documentary',
    narrativeStyle: 'Explainer',
    toneConfig: { intensity: 5, warmth: 5, energy: 6, pacing: 6, humor: 3 },
    audioPacks: { musicMode: 'ai', sfxEnabled: true, musicIntensity: 'balanced', musicMood: 'wondrous' },
    worldBible: { region: '', era: 'present day', canonLocations: [], canonObjects: [], vocabulary: {} },
    status: 'active',
  }).returning()

  const [reel] = await db.insert(reels).values({
    channelId: ch!.id,
    status: 'drafting',
    language: 'english',
    seedIdea,
  }).returning()

  console.log(`channel=${ch!.id} reel=${reel!.id}`)
  console.log(`seed: ${seedIdea}\n`)
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: ch!.id, language: 'english' })
  console.log('enqueued generate_story; polling until story_review…\n')

  const seen = new Set<string>()
  let last = ''
  for (let i = 0; i < 60; i++) {
    const r = await db.query.reels.findFirst({ where: eq(reels.id, reel!.id) })
    const steps = await db.query.pipelineSteps.findMany({ where: eq(pipelineSteps.reelId, reel!.id) })
    for (const s of steps) {
      const key = `${s.stepName}:${s.status}`
      if (!seen.has(key)) { seen.add(key); console.log(`  step ${s.stepName} → ${s.status}${s.error ? ` (${String(s.error).slice(0, 160)})` : ''}`) }
    }
    if (r && r.status !== last) { console.log(`  REEL status → ${r.status}${r.alertNote ? ` [${r.alertNote}]` : ''}`); last = r.status }
    if (r && (r.status === 'story_review' || r.status === 'failed' || r.status === 'rejected')) break
    await new Promise((res) => setTimeout(res, 10_000))
  }

  const rFinal = await db.query.reels.findFirst({ where: eq(reels.id, reel!.id) })
  console.log(`\n── GATE 1 ── reel status: ${rFinal?.status}, cost so far: ${rFinal?.costCents}¢`)
  if (rFinal?.storyId) {
    const story = await db.query.stories.findFirst({ where: eq(stories.id, rFinal.storyId) })
    console.log(`\nTITLE: ${story?.title}`)
    console.log(`LOGLINE: ${story?.logline ?? '(none)'}`)
    console.log(`\n── FULL NARRATION ──\n${story?.body}\n── END ──`)
  }
  console.log(`\nnext: review at http://localhost:3000/reel/${reel!.id}/story`)
  process.exit(0)
})()
