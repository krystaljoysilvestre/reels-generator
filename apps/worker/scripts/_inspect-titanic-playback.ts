// Read-only playback diagnostics for the founder's Titanic spot-check notes.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, channels, assets } = await import('@reels/db')
  const { AudioScriptSchema, CaptionStyleSchema, TimingsSchema } = await import('@reels/core')
  const { asc, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.timings || !reel.audioScript) throw new Error('reel playback data missing')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error('channel missing')
  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)
  const sfxAssets = await db.query.assets.findMany({
    where: eq(assets.reelId, REEL_ID),
    orderBy: [asc(assets.createdAt)],
  })

  console.log(JSON.stringify({
    captionStyle: CaptionStyleSchema.parse(channel.captionStyle),
    subtitles: timings.subtitles,
    sfxEvents: timings.sfxEvents,
    sfxDesign: audioScript.sfx,
    sfxAssets: sfxAssets.filter((asset) => asset.kind === 'sfx').map((asset) => ({
      id: asset.id,
      key: asset.storageKey,
      createdAt: asset.createdAt,
      meta: asset.meta,
    })),
  }, null, 2))
  process.exit(0)
})()
