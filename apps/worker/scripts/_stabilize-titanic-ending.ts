// Operator correction after final visual playback: keep the evidence-bearing closing card typographically
// stable. The i2v take mutated "22 KNOTS" during its final seconds, so scene 9 becomes a locked still and
// the free render/QA tail is rerun. The paid video asset stays in the ledger for cost/audit history.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const SCENE_IDX = 9

  const { getDb, reels, scenes, channels, users, visualTruthBlockers } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  transition(reel.status, 'rendering')

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, SCENE_IDX)),
  })
  if (!scene?.imageAssetId) throw new Error('closing scene or its approved image is missing')
  if (scene.tier !== 'video') throw new Error(`expected closing scene to be video, got ${scene.tier}`)

  const blockers = await visualTruthBlockers(REEL_ID)
  if (blockers.length > 0) throw new Error(`visual truth blockers: ${JSON.stringify(blockers)}`)

  await db.transaction(async (tx) => {
    await tx.update(scenes).set({
      tier: 'still',
      motionPrompt: 'locked-off camera, very minimal motion',
    }).where(and(eq(scenes.reelId, REEL_ID), eq(scenes.idx, SCENE_IDX)))

    await tx.update(reels).set({
      status: 'rendering',
      alertNote: null,
      updatedAt: new Date(),
    }).where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id}: scene ${SCENE_IDX} video → locked still; reason=animated evidence text mutation; paid asset retained`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'render' })
  console.log('enqueued render (local, 0c)')
  process.exit(0)
})()
