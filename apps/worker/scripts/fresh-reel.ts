// Generate a FRESH reel to the STORYBOARD (story → analyze → breakdown → images), bypassing review gates by
// calling steps directly, to validate the storyboard-accuracy fixes at normal cost.
// Usage: pnpm --filter worker exec tsx scripts/fresh-reel.ts <channelId>
import '../src/env.js'

void (async () => {
  const [channelId] = process.argv.slice(2)
  if (!channelId) { console.error('usage: fresh-reel <channelId>'); process.exit(1) }
  const { getDb, reels, channels, stories, scenes } = await import('@reels/db')
  const { generateStory } = await import('../src/pipeline/steps/generate-story.js')
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
  console.log(`fresh reel ${reelId}`)

  console.log('generate_story …'); await generateStory(reelId, channelId, language)
  const r1 = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const story = await db.query.stories.findFirst({ where: eq(stories.id, r1!.storyId!) })
  console.log('STORY:\n' + (story?.body ?? '(none)'))

  console.log('\nanalyze_story …'); await analyzeStory(reelId)
  const r2 = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const bible = StoryBibleSchema.parse(r2!.storyBible)
  console.log('ENTITIES:')
  for (const e of bible.entities) console.log(`  [${e.kind}${e.role ? '/' + e.role : ''}] ${e.id}: ${e.description.slice(0, 130)}`)
  console.log(`narratorEntityId=${bible.continuity.narratorEntityId}`)
  console.log('JOURNEY:')
  bible.continuity.journey.forEach((lg, i) => console.log(`  ${i + 1}. [${lg.occupancyState ?? '?'}] ${lg.locationEntityId ?? `TRANSIT(${lg.locationLabel})`} present=[${lg.present.join(',')}]${lg.isReflection ? ' REFLECTION' : ''}`))

  console.log('\nbreakdown_scenes …'); await breakdownScenes(reelId)
  const scn = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId), orderBy: [asc(scenes.idx)] })
  console.log(`${scn.length} scenes:`)
  scn.forEach((s) => console.log(`  #${String(s.idx).padStart(2)} ${s.tier.padEnd(5)} loc="${s.location}" prim=${s.primaryEntity ?? '—'} sup=[${(s.supportingEntities ?? []).join(',')}]`))

  console.log('\ngenerate_images …'); await generateImages(reelId)
  console.log(`\nDONE — reel ${reelId}, status set to storyboard`)
  await db.update(reels).set({ status: 'storyboard', updatedAt: new Date() }).where(eq(reels.id, reelId))
  process.exit(0)
})()
