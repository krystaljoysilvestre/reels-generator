import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { getDb, reels, assets, publications } from '@reels/db'
import { transition, PostMetaSchema, formatPostCaption } from '@reels/core'
import { downloadBuffer, uploadToYouTube, isYouTubeConfigured } from '@reels/providers'
import { getSession } from '@/lib/auth'

// Post an approved reel straight to YouTube (env-gated — the manual zip flow is untouched when the
// YOUTUBE_* vars are unset). Uploads the render with the reel's post package as title/description,
// records the yt publications row, and marks the reel published. The worker's auto-publish path
// (auto-gate) mirrors this — keep the two in sync.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isYouTubeConfigured()) {
    return NextResponse.json({ error: 'YouTube isn’t connected yet — add the YOUTUBE_* keys to .env.local' }, { status: 501 })
  }

  const { reelId } = (await req.json().catch(() => ({}))) as { reelId?: string }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), with: { story: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  const description = meta.success ? formatPostCaption(meta.data) : (reel.story?.logline ?? '')
  const tags = meta.success ? meta.data.hashtags.map((h) => h.replace(/^#/, '')) : []

  const video = await downloadBuffer(renderAsset.storageKey)
  // Composited thumbnail (hero frame + title, made at render) — best-effort custom thumbnail.
  const thumbAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.storageKey, `reels/${reelId}/thumbnail.jpg`)),
  })
  const thumbnailJpeg = thumbAsset ? await downloadBuffer(thumbAsset.storageKey).catch(() => undefined) : undefined
  let result
  try {
    result = await uploadToYouTube({ video, title, description, tags, ...(thumbnailJpeg ? { thumbnailJpeg } : {}) })
  } catch (err) {
    return NextResponse.json(
      { error: `Upload didn’t go through: ${err instanceof Error ? err.message : String(err)}` },
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
  })
  await db.update(reels).set({ status: 'published', updatedAt: new Date() }).where(eq(reels.id, reelId))

  return NextResponse.json({ ok: true, videoUrl: result.url })
}
