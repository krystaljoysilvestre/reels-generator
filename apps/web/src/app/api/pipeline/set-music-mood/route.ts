import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { MusicMoodSchema } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Persist the operator's per-reel background-music mood. null = inherit the channel default. The mood
// drives the bed's arc + tags at render (annotate_audio_script → generate_music); no bed is generated here.
const InputSchema = z.object({
  reelId: z.string().uuid(),
  mood: MusicMoodSchema.nullable(), // null = inherit channel default
})

export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const gate = await requireReelOwner(parsed.data.reelId)
  if (gate instanceof NextResponse) return gate

  // Clear any cached bed so the new mood actually takes effect on the next render — generate_music skips
  // when musicKey is already set, so a stale bed would otherwise survive a mood change.
  const db = getDb()
  await db
    .update(reels)
    .set({ musicMood: parsed.data.mood, musicKey: null, musicLengthMs: null, updatedAt: new Date() })
    .where(eq(reels.id, parsed.data.reelId))
  return NextResponse.json({ ok: true })
}
