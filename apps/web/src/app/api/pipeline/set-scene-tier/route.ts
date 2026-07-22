import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, tier } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx?: number; tier?: unknown }
  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  // tier is written to a text column but only 'still'/'video' is meaningful downstream — reject anything
  // else so we don't silently store bad data. sceneIdx must be a real row index.
  if (tier !== 'still' && tier !== 'video') {
    return NextResponse.json({ error: "tier must be 'still' or 'video'" }, { status: 400 })
  }
  if (typeof sceneIdx !== 'number' || !Number.isInteger(sceneIdx) || sceneIdx < 0) {
    return NextResponse.json({ error: 'sceneIdx must be a non-negative integer' }, { status: 400 })
  }

  const db = getDb()
  await db.update(scenes).set({ tier }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  return NextResponse.json({ ok: true })
}
