import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { VoiceSettingsSchema } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Persist the reel's narrator voice + delivery as the operator adjusts them on the storyboard — so a
// picked voice / tweaked delivery survives a reload WITHOUT needing to render. Both fields optional:
//   voiceId       — the chosen ElevenLabs voice id (persisted on select)
//   voiceSettings — the delivery override (persisted, debounced, on slider change); null = clear → auto
const InputSchema = z.object({
  reelId: z.string().uuid(),
  voiceId: z.string().min(1).optional(),
  voiceSettings: VoiceSettingsSchema.nullable().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const gate = await requireReelOwner(parsed.data.reelId)
  if (gate instanceof NextResponse) return gate

  const { reelId, voiceId, voiceSettings } = parsed.data
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (voiceId !== undefined) updates['voiceId'] = voiceId
  if (voiceSettings !== undefined) updates['voiceSettings'] = voiceSettings // null clears the override → auto

  const db = getDb()
  await db.update(reels).set(updates).where(eq(reels.id, reelId))
  return NextResponse.json({ ok: true })
}
