// Read-only founder briefing for the Tylenol reel before an external YouTube publish.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const EXPECTED_OWNER_ID = 'e90261ce-8f45-4c9e-a749-00ab7b8fa966'
  const {
    getDb,
    reels,
    channels,
    users,
    assets,
    publications,
    platformConnections,
    visualTruthBlockers,
    resolveYouTubeAuth,
  } = await import('@reels/db')
  const { PostMetaSchema } = await import('@reels/core')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId || channel.userId !== EXPECTED_OWNER_ID) throw new Error('reel owner mismatch')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('reel owner is not active')

  const render = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'render')),
  })
  const thumbnail = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.storageKey, `reels/${REEL_ID}/thumbnail.jpg`)),
  })
  const connection = await db.query.platformConnections.findFirst({
    where: and(eq(platformConnections.channelId, channel.id), eq(platformConnections.platform, 'yt')),
  })
  const priorPublication = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, REEL_ID), eq(publications.platform, 'yt')),
  })
  const postMeta = PostMetaSchema.safeParse(reel.postMeta)
  const blockers = await visualTruthBlockers(REEL_ID)
  const auth = await resolveYouTubeAuth(channel.id)

  console.log(JSON.stringify({
    reel: { status: reel.status, renderUrl: reel.renderUrl, costCents: reel.costCents },
    owner: { id: owner.id, active: owner.status === 'active' },
    channel: { id: channel.id, name: channel.name, targetPlatforms: channel.targetPlatforms },
    artifact: { renderReady: !!render, thumbnailReady: !!thumbnail, visualTruthBlockers: blockers.length },
    postPackage: postMeta.success
      ? { valid: true, title: postMeta.data.title, hashtags: postMeta.data.hashtags }
      : { valid: false, issues: postMeta.error.issues },
    youtube: {
      connectionStatus: connection?.status ?? 'missing',
      connectionUpdatedAt: connection?.updatedAt ?? null,
      lastError: connection?.lastError ?? null,
      authResolvable: !!auth,
      alreadyPublished: !!priorPublication?.platformPostId,
      priorVideoId: priorPublication?.platformPostId ?? null,
    },
  }, null, 2))
  process.exit(0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
