import { NextRequest, NextResponse } from 'next/server'
import { getDb, scenes } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { reelId, sceneIdx, tier } = (await req.json()) as { reelId: string; sceneIdx: number; tier: 'still' | 'video' }
  const db = getDb()
  await db.update(scenes).set({ tier }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
  return NextResponse.json({ ok: true })
}
