import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { getDb, reels, channels, assets, publications, platformConnections } from '@reels/db'
import { transition, PostMetaSchema, formatPostCaption, formatImageCredits, StoryBibleSchema, resolveSidecarSrt } from '@reels/core'
import { downloadBuffer, uploadToYouTube, toElevenLabsLang } from '@reels/providers'
import { requireReelOwner } from '@/lib/api-access'
import { decryptCredential } from '@/lib/publishing-credentials'

// Post an approved reel straight to YouTube (env-gated — the manual zip flow is untouched when the
// YOUTUBE_* vars are unset). Uploads the render with the reel's post package as title/description,
// records the yt publications row, and marks the reel published. The worker's auto-publish path
// (auto-gate) mirrors this — keep the two in sync.
export async function POST(req: NextRequest) {
  const { reelId } = (await req.json().catch(() => ({}))) as { reelId?: string }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), with: { story: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const connection = await db.query.platformConnections.findFirst({
    where: and(
      eq(platformConnections.channelId, reel.channelId),
      eq(platformConnections.platform, 'yt'),
      eq(platformConnections.status, 'active'),
    ),
  })
  const youtubeClientId = process.env['YOUTUBE_CLIENT_ID']
  const youtubeClientSecret = process.env['YOUTUBE_CLIENT_SECRET']
  if (!connection?.refreshTokenEncrypted || !youtubeClientId || !youtubeClientSecret) {
    return NextResponse.json({ error: 'Connect this channel to YouTube first.' }, { status: 409 })
  }

  // Publishing is allowed only from approved/scheduled (same rule as mark-published).
  try {
    transition(reel.status, 'published')
  } catch {
    return NextResponse.json({ error: `Cannot publish a reel in '${reel.status}'` }, { status: 409 })
  }

  // Already on YouTube? Don't double-upload (a retry after a slow response would duplicate the video).
  const existingYt = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, reelId), eq(publications.platform, 'yt')),
  })
  if (existingYt?.platformPostId) {
    return NextResponse.json({ ok: true, videoUrl: `https://youtu.be/${existingYt.platformPostId}`, already: true })
  }

  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'render')),
  })
  if (!renderAsset) return NextResponse.json({ error: 'No render yet' }, { status: 400 })

  const meta = PostMetaSchema.safeParse(reel.postMeta)
  const title = meta.success ? meta.data.title : (reel.story?.title ?? 'Untitled')
  // Append image-attribution credits for any real SOURCED plates (Wikimedia etc.) so licence terms are met.
  const bibleParse = reel.storyBible ? StoryBibleSchema.safeParse(reel.storyBible) : null
  const imageCredits = bibleParse?.success ? formatImageCredits(bibleParse.data) : ''
  const baseDescription = meta.success ? formatPostCaption(meta.data) : (reel.story?.logline ?? '')
  const description = imageCredits ? `${baseDescription}\n\n${imageCredits}` : baseDescription
  const tags = meta.success ? meta.data.hashtags.map((h) => h.replace(/^#/, '')) : []

  const video = await downloadBuffer(renderAsset.storageKey)
  // Composited thumbnail (hero frame + title, made at render) — best-effort custom thumbnail.
  const thumbAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.storageKey, `reels/${reelId}/thumbnail.jpg`)),
  })
  const thumbnailJpeg = thumbAsset ? await downloadBuffer(thumbAsset.storageKey).catch(() => undefined) : undefined
  // Channels that don't burn captions ship a native CC track instead, from the same timings.
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const captionsSrt = resolveSidecarSrt(reel.timings, channel?.captionStyle)
  const captionsLanguage = toElevenLabsLang(channel?.languages?.[0] ?? 'english')
  let result
  try {
    result = await uploadToYouTube({
      video,
      title,
      description,
      tags,
      ...(thumbnailJpeg ? { thumbnailJpeg } : {}),
      ...(captionsSrt ? { captionsSrt, captionsLanguage } : {}),
      auth: {
        clientId: youtubeClientId,
        clientSecret: youtubeClientSecret,
        refreshToken: decryptCredential(connection.refreshTokenEncrypted),
      },
    })
  } catch (err) {
    console.error(`[publishing] YouTube upload failed for reel ${reelId}:`, err)
    await db.update(platformConnections).set({
      status: 'error', lastError: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500), updatedAt: new Date(),
    }).where(eq(platformConnections.id, connection.id))
    return NextResponse.json(
      { error: 'The YouTube upload didn’t go through. Reconnect the account and try again.' },
      { status: 502 },
    )
  }

  await db.insert(publications).values({
    reelId,
    platform: 'yt',
    platformPostId: result.videoId,
    status: 'published',
    publishedAt: new Date(),
    disclosureApplied: true, // containsSyntheticMedia is set on the upload itself
  }).onConflictDoUpdate({
    target: [publications.reelId, publications.platform],
    set: {
      platformPostId: result.videoId,
      status: 'published',
      publishedAt: new Date(),
      scheduledAt: null,
      disclosureApplied: true,
    },
  })
  const targets = channel?.targetPlatforms ?? []
  const youtubeOnly = targets.length > 0 && targets.every((p) => p === 'youtube_shorts' || p === 'youtube_long')
  if (youtubeOnly) {
    await db.update(reels).set({ status: 'published', updatedAt: new Date() }).where(eq(reels.id, reelId))
  }
  console.log(`[publishing] reel ${reelId} published to YouTube account ${connection.providerAccountId}`)

  return NextResponse.json({ ok: true, videoUrl: result.url, allDestinationsPublished: youtubeOnly })
}
