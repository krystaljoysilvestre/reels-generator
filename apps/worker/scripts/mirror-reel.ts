// Validate the horror-reveal pipeline end-to-end on a GUARANTEED seeded story (story generation is random,
// so we seed a fixed narration instead of gambling on generateStory landing the archetype under test).
// Seeds cover distinct fear archetypes so prompt changes can be validated for generality:
//   mirror     — Reflection/SPATIAL archetype (a second face in the glass beside hers)
//   hallway    — Presence/SPATIAL archetype (all stalls checked empty; one door now closed, feet beneath it)
//   footprints — CAUSAL archetype (evidence with no possible source: tracks inside a locked house, ending at the bed)
// Runs analyze_story → breakdown_scenes → generate_images on the chosen seed.
// Usage: pnpm --filter worker exec tsx scripts/mirror-reel.ts <channelId> [mirror|hallway|footprints]
import '../src/env.js'

const SEEDS = {
  mirror: {
    title: 'Yung Kasama sa Salamin',
    logline: 'Mag-isa sa school CR, may isa pang mukha sa salamin.',
    // peakMoment must be a VERBATIM substring of the body (peak placement + tiling depend on it).
    peakMoment: 'may isa pang mukha sa tabi ko',
    body: `Ever had that feeling sa CR na parang may nakatingin? Kaya nung nasa school CR ako mag-isa isang gabi, hindi ko na-shake yung pakiramdam. Check ko lahat ng cubicle, walang tao. Pero parang may kasama ako.

Habang naghuhugas ako ng kamay, napatingin ako sa salamin. May kumislap sa likod ko, pero paglingon ko, wala. Nakatingin lang ako sa sarili ko.

Tapos, sa salamin, may isa pang mukha sa tabi ko — maputla, basa ang balat, nakangiti nang mamali. Hindi na yun ako. Napaatras ako, halos hindi makahinga.

Simula noon, ayoko nang tumingin sa salamin kapag gabi. Baka may tumitingin pabalik.`,
  },
  hallway: {
    title: 'Yung Pintong Sarado',
    logline: 'Walang tao sa buong floor — pero may nakatayo sa loob ng cubicle.',
    peakMoment: 'Sa ilalim ng pintong sarado, may dalawang paa',
    body: `May gabing nag-overtime ako sa school, ako na lang ang tao sa buong floor. Bago umuwi, dumaan ako sa CR sa dulo ng hallway. Tahimik na tahimik. Chineck ko pa isa-isa yung mga cubicle kasi kinakabahan ako — bukas lahat ng pinto, walang tao.

Habang naghuhugas ako ng kamay, may narinig akong mahinang lagitik. Paglingon ko sa hilera ng cubicle, bukas pa rin lahat ng pinto... maliban sa pinakadulo. Sarado na yun. Kanina bukas pa.

Tapos nakita ko. Sa ilalim ng pintong sarado, may dalawang paa. Nakatayo. Hindi gumagalaw. Pero ako lang talaga ang tao sa buong floor na yun.

Hindi ko na hinintay malaman kung sino. Simula noon, hindi na ako nag-overtime mag-isa.`,
  },
  footprints: {
    title: 'Yung Bakas sa Sahig',
    logline: 'Naka-lock ang buong bahay — pero may bakas ng paa papunta sa kama ko.',
    peakMoment: 'natatapos sila mismo sa tabi ng kama ko',
    body: `Umuwi ako galing probinsya nang gabing yun, ako lang mag-isa sa bahay. Bago ako natulog, ni-lock ko lahat — pinto, mga bintana, gate. Sigurado ako.

Paggising ko madaling-araw, may lamig sa paanan ko. Pagtingin ko sa sahig, may putik. Mga bakas ng paa — galing sa pinto, dumaan sa sala, papasok sa kwarto ko.

Sinundan ko sila pabalik. Naka-lock pa rin ang pinto. Naka-lock ang mga bintana. Walang ibang tao sa bahay.

Tapos napansin ko. Yung mga bakas, hindi papalabas. Papalapit. At natatapos sila mismo sa tabi ng kama ko. Walang bakas pabalik.

Hanggang ngayon hindi ko alam kung saan sila nanggaling. Pero iba yung tanong na hindi ako makatulog: nasaan na yung gumawa?`,
  },
} as const

void (async () => {
  const [channelId, seedArg] = process.argv.slice(2)
  if (!channelId) { console.error('usage: mirror-reel <channelId> [mirror|hallway]'); process.exit(1) }
  const seedName = (seedArg ?? 'mirror') as keyof typeof SEEDS
  const STORY = SEEDS[seedName]
  if (!STORY) { console.error(`unknown seed "${seedArg}" — use: ${Object.keys(SEEDS).join(' | ')}`); process.exit(1) }
  const { getDb, reels, channels, stories, scenes } = await import('@reels/db')
  const { analyzeStory } = await import('../src/pipeline/steps/analyze-story.js')
  const { breakdownScenes } = await import('../src/pipeline/steps/breakdown-scenes.js')
  const { generateImages } = await import('../src/pipeline/steps/generate-images.js')
  const { StoryBibleSchema } = await import('@reels/core')
  const { eq, asc } = await import('drizzle-orm')
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) { console.error('channel not found'); process.exit(1) }
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()

  const [reel] = await db.insert(reels).values({ channelId, status: 'drafting', language }).returning()
  const reelId = reel!.id
  console.log(`seeded reel ${reelId} (seed=${seedName})`)

  // Seed the fixed mirror story (skip generate_story) + link it, matching generate-story.ts shape.
  const [story] = await db.insert(stories).values({
    channelId, source: 'ai', language,
    title: STORY.title, body: STORY.body, logline: STORY.logline, twistAnchor: STORY.peakMoment,
  }).returning()
  await db.update(reels).set({ storyId: story!.id, status: 'story_review', updatedAt: new Date() }).where(eq(reels.id, reelId))
  console.log('STORY (seeded):\n' + STORY.body)

  console.log('\nanalyze_story …'); await analyzeStory(reelId)
  const r2 = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const bible = StoryBibleSchema.parse(r2!.storyBible)
  console.log('ENTITIES:')
  for (const e of bible.entities) console.log(`  [${e.kind}${e.role ? '/' + e.role : ''}] ${e.id}: ${e.description.slice(0, 120)}`)
  console.log(`narratorEntityId=${bible.continuity.narratorEntityId} perspective=${bible.continuity.narratorPerspective}`)
  console.log('DIRECTOR NOTES:')
  for (const n of bible.constraints.directorNotes) console.log(`  - ${n}`)
  console.log('JOURNEY:')
  bible.continuity.journey.forEach((lg, i) => console.log(`  ${i + 1}. [${lg.occupancyState ?? '?'}] ${lg.locationEntityId ?? `TRANSIT(${lg.locationLabel})`} present=[${lg.present.join(',')}]${lg.isReflection ? ' REFLECTION' : ''}`))

  console.log('\nbreakdown_scenes …'); await breakdownScenes(reelId)
  const scn = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId), orderBy: [asc(scenes.idx)] })
  console.log(`${scn.length} scenes:`)
  scn.forEach((s) => console.log(`  #${String(s.idx).padStart(2)} ${s.tier.padEnd(5)} loc="${s.location}" prim=${s.primaryEntity ?? '—'} sup=[${(s.supportingEntities ?? []).join(',')}] motion="${s.subjectMotion ?? ''}"`))

  console.log('\ngenerate_images …'); await generateImages(reelId)
  await db.update(reels).set({ status: 'storyboard', updatedAt: new Date() }).where(eq(reels.id, reelId))
  console.log(`\nDONE — reel ${reelId}`)
  process.exit(0)
})()
