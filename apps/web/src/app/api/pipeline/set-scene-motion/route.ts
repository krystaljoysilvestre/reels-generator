import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets } from '@reels/db'
import { eq, and, inArray } from 'drizzle-orm'
import { resolveMotionSettings } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Persist a scene's motion: how it moves (motionPrompt text) and/or its clip length (motionSettings).
// Both are used by the on-demand preview and the render-time animation, so editing either changes the
// clip. When anything actually changes, the cached clip is now stale — delete it so the next preview/
// render re-animates with the new settings.
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, motionPrompt, motionSettings } = (await req.json().catch(() => ({}))) as {
    reelId: string; sceneIdx: number; motionPrompt?: string; motionSettings?: unknown
  }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()

  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })

  const update: { motionPrompt?: string | null; motionSettings?: unknown } = {}
  let changed = false

  if (motionPrompt !== undefined) {
    if (typeof motionPrompt !== 'string') {
      return NextResponse.json({ error: 'motionPrompt must be a string' }, { status: 400 })
    }
    const next = motionPrompt.trim().slice(0, 1000) || null
    if ((scene?.motionPrompt ?? null) !== next) { update.motionPrompt = next; changed = true }
  }
  if (motionSettings !== undefined) {
    const next = resolveMotionSettings(motionSettings)
    const prev = resolveMotionSettings(scene?.motionSettings)
    if (prev.durationSec !== next.durationSec) { update.motionSettings = next; changed = true }
  }

  if (Object.keys(update).length > 0) {
    await db.update(scenes).set(update).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  }

  if (changed) {
    const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
    const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
    if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))
  }

  return NextResponse.json({ ok: true, changed })
}
