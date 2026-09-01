// One-reel operator recovery: finish pending images through the pipeline's normal image + truth-QA path.
// The selected image engine is configured separately; this script adds no untracked provider calls.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, scenes, channels, users } = await import('@reels/db')
  const { eq, isNull, and } = await import('drizzle-orm')
  const { generateImages } = await import('../src/pipeline/index.js')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel || reel.status !== 'failed') throw new Error(`expected failed reel, found ${reel?.status ?? 'missing'}`)
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const pendingBefore = await db.query.scenes.findMany({
    where: and(eq(scenes.reelId, REEL_ID), isNull(scenes.imageAssetId)),
    columns: { idx: true },
  })
  if (pendingBefore.length === 0) throw new Error('no missing scene images to recover')

  await generateImages(REEL_ID)

  const pendingAfter = await db.query.scenes.findMany({
    where: and(eq(scenes.reelId, REEL_ID), isNull(scenes.imageAssetId)),
    columns: { idx: true },
  })
  if (pendingAfter.length > 0) throw new Error(`image recovery left scenes pending: ${pendingAfter.map((s) => s.idx).join(', ')}`)
  await db.update(reels).set({ status: 'storyboard', updatedAt: new Date() }).where(eq(reels.id, REEL_ID))

  console.log(`[audit] owner ${owner.id} recovered scene images ${pendingBefore.map((s) => s.idx).join(', ')} for reel ${REEL_ID}`)
  console.log('all scene images present; reel restored to storyboard')
  process.exit(0)
})()
