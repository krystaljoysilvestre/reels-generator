import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, publications } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Operator has posted the exported package to the platform(s) → 'published' (terminal).
// Phase 1 posting is manual (export-post-package zip), so this is the operator confirming the upload.
export async function POST(req: NextRequest) {
  const { reelId } = (await req.json().catch(() => ({}))) as { reelId?: string }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Publishing is allowed only from approved/scheduled — return 409 (not an opaque 500) otherwise.
  try {
    transition(reel.status, 'published')
  } catch {
    return NextResponse.json({ error: `Cannot publish a reel in '${reel.status}'` }, { status: 409 })
  }

  await db.update(reels).set({
    status: 'published',
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  // One row per destination selected at channel creation. Insert the missing rows even after a partial
  // direct publish (for example YouTube first, then TikTok/Facebook manually); preserve any direct post id.
  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, reel.channelId),
    columns: { targetPlatforms: true },
  })
  const platforms = [...new Set((channel?.targetPlatforms ?? ['tiktok']).map((target) =>
    target === 'youtube_shorts' || target === 'youtube_long'
      ? 'yt' as const
      : target === 'facebook_reels'
        ? 'fb' as const
        : 'tiktok' as const,
  ))]
  if (platforms.length) {
    await db.insert(publications).values(
      platforms.map((platform) => ({ reelId, platform, status: 'published', publishedAt: new Date() })),
    ).onConflictDoNothing({ target: [publications.reelId, publications.platform] })
  }

  return NextResponse.json({ ok: true })
}
