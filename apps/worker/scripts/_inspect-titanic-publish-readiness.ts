// Read-only founder briefing: approved artifact, post package, destination connection, and idempotency state.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, channels, assets, publications, platformConnections, visualTruthBlockers, resolveYouTubeAuth } = await import('@reels/db')
  const { PostMetaSchema } = await import('@reels/core')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error('channel not found')
  const render = await db.query.assets.findFirst({ where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'render')) })
  const thumb = await db.query.assets.findFirst({ where: and(eq(assets.reelId, REEL_ID), eq(assets.storageKey, `reels/${REEL_ID}/thumbnail.jpg`)) })
  const ytConnection = await db.query.platformConnections.findFirst({
    where: and(eq(platformConnections.channelId, channel.id), eq(platformConnections.platform, 'yt')),
  })
  const priorYt = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, REEL_ID), eq(publications.platform, 'yt')),
  })
  const postMeta = PostMetaSchema.safeParse(reel.postMeta)
  const auth = await resolveYouTubeAuth(channel.id)
  const blockers = await visualTruthBlockers(REEL_ID)
  console.log(JSON.stringify({
    reel: { status: reel.status, renderUrl: reel.renderUrl, costCents: reel.costCents },
    channel: { name: channel.name, targetPlatforms: channel.targetPlatforms, postingRules: channel.postingRules },
    artifact: { renderReady: !!render, thumbnailReady: !!thumb, visualTruthBlockers: blockers.length },
    postPackage: postMeta.success ? { valid: true, title: postMeta.data.title, hashtags: postMeta.data.hashtags } : { valid: false },
    youtube: {
      connectionStatus: ytConnection?.status ?? 'missing',
      connectionUpdatedAt: ytConnection?.updatedAt ?? null,
      connectedAt: ytConnection?.connectedAt ?? null,
      lastError: ytConnection?.lastError ?? null,
      authResolvable: !!auth,
      alreadyPublished: !!priorYt?.platformPostId,
    },
  }, null, 2))
  process.exit(0)
})()
