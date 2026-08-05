// Hero-reel lap (PAID, supervised). Seeds the "Emberlight" cinematic-fantasy channel in REVIEW mode
// + one reel with a founder-approved seed idea, enqueues generate_story, and polls until the reel
// parks at the story_review gate — then prints the FULL story (title/logline/body) for the human
// read. All later gates are crossed in the web UI (/review → /storyboard → spot check).
//
// Creative direction (plan: hero reel, 2026-08-04): customer-facing register = cinematic fantasy;
// genreCategory 'fairytale' is an IMPLEMENTATION choice (the proven wonder-craft vertical), set
// explicitly here — no classifier keywords in the niche text.
//
// Prereq: worker running (pnpm --filter worker dev), postgres+redis up (pnpm db:up).
// Usage: pnpm --filter worker exec tsx scripts/hero-reel-lap.ts [--fallback-seed]
import '../src/env.js'
void (async () => {
  const { getDb, channels, reels, stories, pipelineSteps } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { enqueueStep } = await import('@reels/queue')
  const { CAPTION_PRESETS } = await import('@reels/core')
  const { STYLE_PRESETS } = await import('@reels/core')
  const db = getDb()

  const useFallback = process.argv.includes('--fallback-seed')
  const SEED_PRIMARY = 'Every night, one child climbs the mountain to relight the stars before the village wakes.'
  const SEED_FALLBACK = 'The lighthouse that remembered everyone’s forgotten dreams.'
  const seedIdea = useFallback ? SEED_FALLBACK : SEED_PRIMARY

  const storybook = STYLE_PRESETS.find((p) => p.id === 'storybook')
  if (!storybook) throw new Error('storybook style preset not found')

  const worldBible = useFallback
    ? {
        region: 'a windswept cape where a lighthouse keeps the coast',
        era: 'timeless, lantern-lit',
        canonLocations: ['the lighthouse lantern room', 'the drowned harbor stair'],
        canonObjects: ['the great lamp', 'a shelf of small glass bottles, one per dream'],
        vocabulary: { 'the Keeping': 'the lighthouse’s habit of holding what people forget' },
      }
    : {
        region: 'a mountain village beneath a sky of tended stars',
        era: 'timeless, lantern-lit',
        canonLocations: ['the star-path up the mountain', 'the cold lantern in the village square'],
        canonObjects: ['a long brass lighting pole', 'a satchel of star-embers'],
        vocabulary: { 'the Tending': 'the nightly climb to relight the stars before the village wakes' },
      }

  const [ch] = await db.insert(channels).values({
    name: 'Emberlight',
    description: 'Cinematic fantasy folklore for everyone.',
    nicheDescription:
      'Cinematic fantasy folklore for everyone — small heroes against vast ancient wonders, magic that costs something, openings that raise a question in the first breath. Never “once upon a time.” Painterly, lantern-lit, wonder that adults feel and children follow.',
    languages: ['english'],
    genreCategory: 'fairytale', // implementation module, explicit — see header note
    storyMode: 'standard',
    generationMode: 'review',
    targetPlatforms: ['tiktok', 'youtube_shorts', 'facebook_reels'],
    targetSeconds: 55,
    stylePreset: storybook.stylePreset,
    captionStyle: CAPTION_PRESETS.elegant,
    voiceMode: 'single',
    voiceSearchKeyword: 'warm storyteller',
    voicePool: [],
    narrativeVoice: 'Campfire',
    toneConfig: { intensity: 4, warmth: 8, energy: 4, pacing: 4, humor: 3 },
    audioPacks: { musicMode: 'ai', sfxEnabled: true, musicIntensity: 'balanced', musicMood: 'wondrous' },
    worldBible,
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
  for (let i = 0; i < 60; i++) { // 60 × 10s = 10 min cap for story gen
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
  } else {
    console.log('(no story attached yet — inspect pipeline_steps / Bull Board)')
  }
  console.log(`\nnext: review at http://localhost:3000/reel/${reel!.id}/story  (or /review)`)
  process.exit(0)
})()
