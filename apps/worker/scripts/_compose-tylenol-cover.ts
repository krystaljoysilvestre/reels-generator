// Rebuild the final Tylenol cover after the render was recovered outside the normal render callback.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const { getDb, reels, channels, users } = await import('@reels/db')
  const { eq } = await import('drizzle-orm')
  const { composeCover } = await import('../src/pipeline/compose-cover.js')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel || reel.status !== 'spot_check') throw new Error('reel is not ready for cover composition')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const result = await composeCover({ reelId: REEL_ID })
  if (!result) throw new Error('cover inputs were incomplete')
  console.log(
    `[audit] owner ${owner.id} composed cover ${result.storageKey}; overlay=${JSON.stringify(result.overlay)} ` +
      `frameAsset=${result.frameAssetId}; cost=0c`,
  )
  process.exit(0)
})()
