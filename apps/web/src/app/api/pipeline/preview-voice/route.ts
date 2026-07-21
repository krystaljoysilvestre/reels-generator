import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { ElevenLabsTtsProvider, ProviderRateLimitError } from '@reels/providers'
import { downloadBuffer } from '@reels/providers'
import type { VoiceSettings } from '@reels/core'
import { requireApiUser } from '@/lib/api-access'

const tts = new ElevenLabsTtsProvider()

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

  const { voiceId, text, voiceSettings } = (await req.json().catch(() => ({}))) as { voiceId: string; text: string; voiceSettings?: VoiceSettings }
  if (!voiceId || !text) return NextResponse.json({ error: 'Missing voiceId or text' }, { status: 400 })

  // Use a temp reelId prefix for the preview — won't persist to a real reel. Honor the operator's
  // delivery tweak so the preview sounds like the final render will.
  const previewReelId = `preview-${Date.now()}`
  try {
    const result = await tts.synthesize({ narration: text, voiceId, reelId: previewReelId, ...(voiceSettings ? { voiceSettings } : {}) })
    const buf = await downloadBuffer(result.audioStorageKey)
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  } catch (err) {
    // Don't let a provider hiccup become an opaque 500 — a rate limit is a calm retry (client backs off).
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Could not play that preview — try again.' }, { status: 502 })
  }
}
