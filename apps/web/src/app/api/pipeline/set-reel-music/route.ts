import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSession } from '@/lib/auth'

// Point a reel at an operator-UPLOADED music bed (already uploaded to R2 via /api/channel/music-upload),
// or clear it (key: null). When set, this bed overrides AI generation / the preset pool at render.
// Rights: the uploaded audio is the operator's responsibility — we don't check or clear copyright.
const InputSchema = z.object({
  reelId: z.string().uuid(),
  key: z.string().min(1).nullable(), // R2 key of the uploaded bed; null = remove (revert to the channel's mode)
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const db = getDb()
  await db
    .update(reels)
    .set({ musicUploadKey: parsed.data.key, updatedAt: new Date() })
    .where(eq(reels.id, parsed.data.reelId))
  return NextResponse.json({ ok: true })
}
