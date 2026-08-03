import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { ElevenLabsTtsProvider, ProviderRateLimitError } from '@reels/providers'
import { downloadBuffer } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { VoiceSettingsSchema, type VoiceSettings } from '@reels/core'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

const tts = new ElevenLabsTtsProvider()

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const { voiceId, text, voiceSettings } = (await req.json().catch(() => ({}))) as { voiceId: string; text: string; voiceSettings?: VoiceSettings }
  if (!voiceId || !text) return NextResponse.json({ error: 'Missing voiceId or text' }, { status: 400 })
  // Cap the preview length — TTS is character-billed, so an unbounded body is a cost/timeout risk.
  if (typeof text !== 'string' || text.length > 1500) {
    return NextResponse.json({ error: 'Preview text is too long (max 1500 characters).' }, { status: 400 })
  }
  if (voiceSettings !== undefined && !VoiceSettingsSchema.safeParse(voiceSettings).success) {
    return NextResponse.json({ error: 'Invalid voice settings' }, { status: 400 })
  }

  // Use a temp reelId prefix for the preview — won't persist to a real reel. Honor the operator's
  // delivery tweak so the preview sounds like the final render will.
  const previewReelId = `preview-${Date.now()}`
  try {
    const result = await tts.synthesize({ narration: text, voiceId, reelId: previewReelId, ...(voiceSettings ? { voiceSettings } : {}) })
    // Character-billed TTS, up to 1500 chars per click, and the synthetic preview id means there's no reel
    // row to bill — so it goes to the ledger for spend with no owning resource. Was recorded nowhere.
    await recordSpendEvent({ userId: gate.id, surface: 'voice_preview', provider: 'elevenlabs', costCents: result.costCents })
    const buf = await downloadBuffer(result.audioStorageKey)
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'audio/mpeg' },
    })
  } catch (err) {
    // No real reel to bill (previewReelId is a throwaway prefix) — same event sink as the success path.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'voice_preview', provider: 'elevenlabs' })
    // Don't let a provider hiccup become an opaque 500 — a rate limit is a calm retry (client backs off).
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Could not play that preview — try again.' }, { status: 502 })
  }
}
