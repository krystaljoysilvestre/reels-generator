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

  const { reelId, voiceId, voiceSettings } = (await req.json().catch(() => ({}))) as { reelId?: string; voiceId?: string; voiceSettings?: VoiceSettings }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })
  const db = getDb()

  // TTS (generate_tts) hard-requires a voice; reject empty up front so the worker
  // never fails mid-pipeline on a missing voiceId.
  if (!voiceId || !voiceId.trim()) {
    return NextResponse.json({ error: 'Pick a narrator voice before rendering.' }, { status: 400 })
  }

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only a reel at the storyboard gate can be rendered — return 409 (not an opaque 500) if it's already
  // rendering or in another state (stale tab / double-click).
  try {
    transition(reel.status, 'rendering')
  } catch {
    return NextResponse.json({ error: `Cannot render a reel in '${reel.status}'` }, { status: 409 })
  }

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
