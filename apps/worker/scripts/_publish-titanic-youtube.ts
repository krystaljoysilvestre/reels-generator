// One-off founder-authorized YouTube publish for the approved Titanic reel.
// Mirrors the manual publish route, with fixed reel/owner guards and a post-write verification.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const EXPECTED_OWNER_ID = 'e90261ce-8f45-4c9e-a749-00ab7b8fa966'
  const {
    getDb,
    reels,
    stories,
    channels,
    users,
    assets,
    publications,
    sceneImageOrigins,
    resolveYouTubeAuth,
    markConnectionError,
    visualTruthBlockers,
  } = await import('@reels/db')
  const {
    transition,
    PostMetaSchema,
    formatPostCaption,
    formatImageCredits,
    StoryBibleSchema,
    resolveSidecarSrt,
  } = await import('@reels/core')
  const { downloadBuffer, uploadToYouTube, fetchYouTubeStats, toElevenLabsLang } = await import('@reels/providers')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  if (reel.status !== 'approved') throw new Error(`expected approved reel, found ${reel.status}`)
  transition(reel.status, 'published')

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId || channel.userId !== EXPECTED_OWNER_ID) throw new Error('reel owner mismatch')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('reel owner is not active')

  const blockers = await visualTruthBlockers(REEL_ID)
  if (blockers.length > 0) throw new Error(`visual truth blockers: ${JSON.stringify(blockers)}`)

  const existing = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, REEL_ID), eq(publications.platform, 'yt')),
  })
  if (existing?.platformPostId) {
    console.log(JSON.stringify({
      alreadyPublished: true,
      videoId: existing.platformPostId,
      videoUrl: `https://youtu.be/${existing.platformPostId}`,
      costCents: 0,
    }))
    process.exit(0)
  }

  const auth = await resolveYouTubeAuth(channel.id)
  if (!auth) throw new Error('Crossroads does not have an active YouTube connection')
  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'render')),
  })
  if (!renderAsset) throw new Error('render asset not found')

  const meta = PostMetaSchema.parse(reel.postMeta)
  const story = reel.storyId
    ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
    : null
  const bibleParse = reel.storyBible ? StoryBibleSchema.safeParse(reel.storyBible) : null
  const imageCredits = bibleParse?.success
    ? formatImageCredits(bibleParse.data, await sceneImageOrigins(REEL_ID))
    : ''
  const baseDescription = formatPostCaption(meta)
  const description = imageCredits ? `${baseDescription}\n\n${imageCredits}` : baseDescription
  const tags = meta.hashtags.map((hashtag) => hashtag.replace(/^#/, ''))
  const video = await downloadBuffer(renderAsset.storageKey)

  const thumbnailAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.storageKey, `reels/${REEL_ID}/thumbnail.jpg`)),
  })
  const thumbnailJpeg = thumbnailAsset
    ? await downloadBuffer(thumbnailAsset.storageKey).catch(() => undefined)
    : undefined
  const captionsSrt = resolveSidecarSrt(reel.timings, channel.captionStyle)
  const captionsLanguage = toElevenLabsLang(channel.languages?.[0] ?? 'english')

  console.log(
    `[audit] publish-start owner=${owner.id} channel=${channel.id} reel=${REEL_ID} ` +
    `platform=yt privacy=public disclosure=true title=${JSON.stringify(meta.title)} ` +
    `renderBytes=${video.length} story=${story?.id ?? 'none'}`,
  )

  let result
  try {
    result = await uploadToYouTube({
      video,
      title: meta.title,
      description,
      tags,
      privacyStatus: 'public',
      ...(thumbnailJpeg ? { thumbnailJpeg } : {}),
      ...(captionsSrt ? { captionsSrt, captionsLanguage } : {}),
      auth,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markConnectionError(channel.id, 'yt', message)
    throw error
  }

  const publishedAt = new Date()
  await db.insert(publications).values({
    reelId: REEL_ID,
    platform: 'yt',
    platformPostId: result.videoId,
    status: 'published',
    publishedAt,
    disclosureApplied: true,
  }).onConflictDoUpdate({
    target: [publications.reelId, publications.platform],
    set: {
      platformPostId: result.videoId,
      status: 'published',
      publishedAt,
      scheduledAt: null,
      disclosureApplied: true,
    },
  })

  const targets = channel.targetPlatforms ?? []
  const youtubeOnly = targets.length > 0 && targets.every(
    (platform) => platform === 'youtube_shorts' || platform === 'youtube_long',
  )
  if (youtubeOnly) {
    await db.update(reels).set({ status: 'published', updatedAt: publishedAt }).where(eq(reels.id, REEL_ID))
  }

  const saved = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, REEL_ID), eq(publications.platform, 'yt')),
  })
  if (saved?.platformPostId !== result.videoId || saved.status !== 'published' || !saved.disclosureApplied) {
    throw new Error('YouTube upload completed, but the publication record did not verify')
  }

  // A returned public stats item proves YouTube has indexed the video as a public API resource.
  const stats = await fetchYouTubeStats([result.videoId], auth)
  const live = stats.some((item) => item.videoId === result.videoId)
  console.log(
    `[audit] publish-complete owner=${owner.id} channel=${channel.id} reel=${REEL_ID} ` +
    `platform=yt video=${result.videoId} publicApiVisible=${live} cost=${result.costCents}c ` +
    `allDestinationsPublished=${youtubeOnly}`,
  )
  console.log(JSON.stringify({
    alreadyPublished: false,
    videoId: result.videoId,
    videoUrl: result.url,
    title: meta.title,
    publicApiVisible: live,
    stats: stats[0] ?? null,
    costCents: result.costCents,
    allDestinationsPublished: youtubeOnly,
  }))
  process.exit(live ? 0 : 2)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
