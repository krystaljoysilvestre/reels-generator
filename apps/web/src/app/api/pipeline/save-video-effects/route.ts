import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { isVideoEffectId } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Persist the operator's per-reel video-effect choice. null = auto (planned from the story at render);
// an array of effect ids = explicit selection (applied across the reel). Composited free at render time.
const InputSchema = z.object({
  reelId: z.string().uuid(),
  effects: z.array(z.string()).nullable(), // null = auto
})

export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const gate = await requireReelOwner(parsed.data.reelId)
  if (gate instanceof NextResponse) return gate

  const value = parsed.data.effects === null ? null : parsed.data.effects.filter(isVideoEffectId)
  const db = getDb()
  await db.update(reels).set({ videoEffects: value as never, updatedAt: new Date() }).where(eq(reels.id, parsed.data.reelId))
  return NextResponse.json({ ok: true })
}
