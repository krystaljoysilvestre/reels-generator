// Final human-gate correction: scene 9's generated signal crossed the barrier despite the narration.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const SCENE_IDX = 9
  const { getDb, reels, scenes, channels, users } = await import('@reels/db')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel || reel.status !== 'storyboard') throw new Error(`expected storyboard reel, found ${reel?.status ?? 'missing'}`)
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')
  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, SCENE_IDX)),
  })
  if (!scene?.imageAssetId) throw new Error('scene 9 has no current image to replace')

  const prompt = 'Three separate icon panels from left to right on a plain white field. LEFT: binoculars and one key both sit under a huge red X. CENTER: a radio-signal arrow visibly ends at a thick red vertical stop bar; a ship command-deck icon is isolated on the far side and the signal does not cross the bar. RIGHT: a large 22 KNOTS dial drives a ship arrow toward an iceberg. No keys outside the left panel, no bridge structure, no signal crossing the stop bar, no people, room, furniture, or display case.'
  await db.update(scenes).set({
    visualPrompt: prompt,
    visualPromptBase: prompt,
    imageAssetId: null,
    imageOrigin: null,
    videoAssetId: null,
  }).where(and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, SCENE_IDX)))

  console.log(`[audit] owner ${owner.id} rejected Titanic scene 9: signal visibly reached bridge despite narration`)
  console.log('cleared scene 9 for normal cost-accounted regeneration')
  process.exit(0)
})()
