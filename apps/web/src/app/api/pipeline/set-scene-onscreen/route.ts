import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

// Persist a scene's optional on-screen text (a title/overlay burned at render, separate from the spoken
// captions). Empty clears it. Affects only the render — no image/clip regeneration needed.
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, onScreenText } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx: number; onScreenText: string }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  await db.update(scenes).set({ onScreenText: onScreenText.trim() || null }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  return NextResponse.json({ ok: true })
}
