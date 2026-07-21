import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, tier } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx: number; tier: 'still' | 'video' }
  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  const db = getDb()
  await db.update(scenes).set({ tier }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  return NextResponse.json({ ok: true })
}
