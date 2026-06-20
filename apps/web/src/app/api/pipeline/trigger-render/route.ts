import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition, type VoiceSettings } from '@reels/core'
import { enqueueStep } from '@reels/queue'
import { getSession } from '@/lib/auth'

// Transitions the reel to 'rendering' and sets the voiceId (+ optional delivery override).
// The worker picks up the pipeline from here via BullMQ.

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, voiceId, voiceSettings } = (await req.json()) as { reelId: string; voiceId: string; voiceSettings?: VoiceSettings }
  const db = getDb()

  // TTS (generate_tts) hard-requires a voice; reject empty up front so the worker
  // never fails mid-pipeline on a missing voiceId.
  if (!voiceId || !voiceId.trim()) {
    return NextResponse.json({ error: 'Pick a narrator voice before rendering.' }, { status: 400 })
  }

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'rendering')

  // voiceSettings present = operator tweaked delivery for this reel → store the override; absent = leave
  // null so generate_tts auto-derives from the story's mood.
  await db.update(reels).set({
    status: 'rendering',
    voiceId,
    ...(voiceSettings ? { voiceSettings } : {}),
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  // Run the render chain: generate_tts → annotate_audio_script → compute_timings → generate_sfx →
  // (animate_scenes if any video-tier scene) → mix_audio → render → render_qa, stopping at spot_check.
  await enqueueStep({ reelId, stepName: 'generate_tts' })

  return NextResponse.json({ ok: true })
}
