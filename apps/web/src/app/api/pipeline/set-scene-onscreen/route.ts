import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

// Persist a scene's optional on-screen text (a title/overlay burned at render, separate from the spoken
// captions). Empty clears it. Affects only the render — no image/clip regeneration needed.
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, onScreenText } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx?: number; onScreenText?: unknown }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  // onScreenText is optional (empty clears it) but must be a string — calling .trim() on a missing/non-string
  // value would 500. It's burned into the render, so cap its length.
  if (onScreenText !== undefined && typeof onScreenText !== 'string') {
    return NextResponse.json({ error: 'onScreenText must be a string' }, { status: 400 })
  }
  if (typeof sceneIdx !== 'number' || !Number.isInteger(sceneIdx) || sceneIdx < 0) {
    return NextResponse.json({ error: 'sceneIdx must be a non-negative integer' }, { status: 400 })
  }
  const cleaned = (typeof onScreenText === 'string' ? onScreenText : '').trim().slice(0, 200) || null

  const db = getDb()
  await db.update(scenes).set({ onScreenText: cleaned }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  return NextResponse.json({ ok: true })
}
