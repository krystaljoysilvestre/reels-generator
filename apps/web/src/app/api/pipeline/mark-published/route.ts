import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, publications, visualTruthBlockers } from '@reels/db'
import { eq, sql } from 'drizzle-orm'
import { transition } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'
import { z } from 'zod'

const RequestSchema = z.object({ reelId: z.string().uuid() })

// Operator has posted the exported package to the platform(s) → 'published' (terminal).
// Phase 1 posting is manual (export-post-package zip), so this is the operator confirming the upload.
export async function POST(req: NextRequest) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid reel.' }, { status: 400 })
  const { reelId } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()

  try {
    // The shared truth helper uses its own pooled connection; finish it before taking the row lock
    // so simultaneous confirmations cannot exhaust the pool while waiting on the same reel.
    const truthBlockers = await visualTruthBlockers(reelId)
    if (truthBlockers.length > 0) {
      return NextResponse.json({ error: 'Fix the flagged visual-truth scenes before publishing.', blockers: truthBlockers }, { status: 409 })
    }
    const response = await db.transaction(async (tx) => {
      // Serialize confirmations for this reel. A retry sees the committed result, and a destination
      // failure rolls the status change back with it instead of leaving an unrepeatable half-write.
      const [reel] = await tx.select().from(reels).where(eq(reels.id, reelId)).for('update')
      if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      // Already-published reels may reconcile missing destination records from an earlier partial
      // write. Every new publication still requires the approved/scheduled state-machine transition.
      if (reel.status !== 'published') {
        try {
          transition(reel.status, 'published')
        } catch {
          return NextResponse.json({ error: `Cannot publish a reel in '${reel.status}'` }, { status: 409 })
        }
      }

      const now = new Date()
      if (reel.status !== 'published') {
        await tx.update(reels).set({ status: 'published', updatedAt: now }).where(eq(reels.id, reelId))
      }
      const channel = await tx.query.channels.findFirst({
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
        await tx.insert(publications).values(
          platforms.map((platform) => ({ reelId, platform, status: 'published', publishedAt: now })),
        ).onConflictDoUpdate({
          target: [publications.reelId, publications.platform],
          // Confirm an existing pending destination too, but never replace its external post ID,
          // disclosure or original timestamps. Repeated confirmations keep the original record.
          set: { status: 'published', publishedAt: sql`coalesce(${publications.publishedAt}, excluded.published_at)` },
        })
      }

      return NextResponse.json({ ok: true })
    })
    if (response.ok) console.log(`[publishing] creator ${gate.id} confirmed reel ${reelId}`)
    return response
  } catch (err) {
    console.error(`[publishing] confirmation failed for reel ${reelId} by creator ${gate.id}:`, err)
    return NextResponse.json({ error: 'Could not save your confirmation. Try again.' }, { status: 500 })
  }
}
