import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { getDb, reels, channels, assets, publications, sceneImageOrigins, resolveYouTubeAuth, markConnectionError, visualTruthBlockers } from '@reels/db'
import { transition, canTransition, PostMetaSchema, formatPostCaption, formatImageCredits, StoryBibleSchema, resolveSidecarSrt } from '@reels/core'
import { downloadBuffer, uploadToYouTube, toElevenLabsLang } from '@reels/providers'
import { requireReelOwner } from '@/lib/api-access'
import { z } from 'zod'

const RequestSchema = z.object({ reelId: z.string().uuid() })

// Post an approved reel straight to YouTube using the CHANNEL's own connection (the manual zip flow is
// untouched when the channel isn't connected). Uploads the render with the reel's post package as title/description,
// records the yt publications row, and marks the reel published. The worker's auto-publish path
// (auto-gate) mirrors this — keep the two in sync.
export async function POST(req: NextRequest) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid reel.' }, { status: 400 })
  const { reelId } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), with: { story: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const truthBlockers = await visualTruthBlockers(reelId)
  if (truthBlockers.length > 0) {
    return NextResponse.json({ error: 'Fix the flagged visual-truth scenes before publishing.', blockers: truthBlockers }, { status: 409 })
  }
  // A completed upload is a read-only result, even after a YouTube-only reel became published or
  // its connection was removed. Keep ownership, truth and approval gates ahead of this retry path.
  const existingYt = await db.query.publications.findFirst({
    where: and(eq(publications.reelId, reelId), eq(publications.platform, 'yt')),
  })
  if (existingYt?.platformPostId && (reel.status === 'published' || canTransition(reel.status, 'published'))) {
    return NextResponse.json({ ok: true, videoUrl: `https://youtu.be/${existingYt.platformPostId}`, already: true })
  }

  // Publishing is allowed only from approved/scheduled (same rule as mark-published).
  try {
    transition(reel.status, 'published')
  } catch {
    return NextResponse.json({ error: `Cannot publish a reel in '${reel.status}'` }, { status: 409 })
  }

  const auth = await resolveYouTubeAuth(reel.channelId)
  if (!auth) {
    return NextResponse.json({ error: 'Connect this channel to YouTube first.' }, { status: 409 })
  }

  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'render')),
  })
  if (!renderAsset) return NextResponse.json({ error: 'No render yet' }, { status: 400 })

  const meta = PostMetaSchema.safeParse(reel.postMeta)
  const title = meta.success ? meta.data.title : (reel.story?.title ?? 'Untitled')
  // Append image-attribution credits for every real SOURCED image (Wikimedia etc.) so licence terms are met —
  // reference plates AND archival photographs presented as scenes.
  const bibleParse = reel.storyBible ? StoryBibleSchema.safeParse(reel.storyBible) : null
  const imageCredits = bibleParse?.success ? formatImageCredits(bibleParse.data, await sceneImageOrigins(reel.id)) : ''
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
      auth,
    })
  } catch (err) {
    console.error(`[publishing] YouTube upload failed for reel ${reelId}:`, err)
    await markConnectionError(reel.channelId, 'yt', err instanceof Error ? err.message : String(err))
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
  console.log(`[publishing] reel ${reelId} published to YouTube`)

  return NextResponse.json({ ok: true, videoUrl: result.url, allDestinationsPublished: youtubeOnly })
}
