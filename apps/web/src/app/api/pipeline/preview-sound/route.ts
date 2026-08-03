import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { eq, sql } from 'drizzle-orm'
import { generateSfx, generateSpeechClip, ProviderRateLimitError } from '@reels/providers'
import {
  OperatorSfxSchema,
  ToneConfigSchema,
  moodToVoiceSettings,
  deliveryToVoiceSettings,
  cueDurationSec,
  type VoiceSettings,
} from '@reels/core'
import { requireReelOwner, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// Generate (or regenerate) the clip for one manual sound cue so it can be heard at the storyboard.
// SFX → sound-effects; speech → a second voice with delivery-tuned settings. Stored under a deterministic
// per-cue key and saved on the cue, so generate_sfx reuses it at render (no double charge).
const inFlight = new Set<string>()
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { reelId, cueId } = (await req.json().catch(() => ({}))) as { reelId: string; cueId: string }
  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Reel not found' }, { status: 404 })

  const cues = OperatorSfxSchema.parse(reel.operatorSfx ?? [])
  const cue = cues.find((c) => c.id === cueId)
  if (!cue) return NextResponse.json({ error: 'Sound not found' }, { status: 404 })

  const lockKey = `${reelId}:${cueId}`
  if (inFlight.has(lockKey)) return NextResponse.json({ error: 'Already generating — hang tight.' }, { status: 409 })
  inFlight.add(lockKey)

  try {
    let assetKey: string
    let costCents: number
    if (cue.kind === 'speech') {
      if (!cue.voiceId || !cue.words) return NextResponse.json({ error: 'This spoken sound is missing its voice or words.' }, { status: 400 })
      const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
      const tone = ToneConfigSchema.parse(channel?.toneConfig ?? {})
      const base = (reel.voiceSettings as VoiceSettings | null) ?? moodToVoiceSettings([], tone, channel?.genreCategory)
      const res = await generateSpeechClip({
        text: cue.words,
        voiceId: cue.voiceId,
        storageKey: `reels/${reelId}/sfx/op-${cueId}.mp3`,
        voiceSettings: deliveryToVoiceSettings(cue.delivery, base),
      })
      assetKey = res.audioStorageKey
      costCents = res.costCents
    } else {
      const res = await generateSfx({ prompt: cue.prompt ?? '', reelId, anchorLabel: `op-${cueId}`, durationSec: cueDurationSec(cue.kind) })
      assetKey = res.audioStorageKey
      costCents = res.costCents
    }

    const next = cues.map((c) => (c.id === cueId ? { ...c, assetKey } : c))
    // Atomic cost increment so concurrent previews of different cues don't drop spend. (operatorSfx itself
    // is a read-modify-write, but the per-cue inFlight lock serializes same-cue calls and the clip is
    // freely regenerable, so a rare cross-cue overwrite is low-impact.)
    await db.update(reels)
      .set({ operatorSfx: next, costCents: sql`${reels.costCents} + ${costCents}`, updatedAt: new Date() })
      .where(eq(reels.id, reelId))

    return NextResponse.json({ ok: true, url: `/api/asset?key=${encodeURIComponent(assetKey)}`, costCents })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'reel', reelId })
    if (err instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Busy right now — try again shortly.' }, { status: 429 })
    return NextResponse.json({ error: 'Could not generate that sound — try again.' }, { status: 502 })
  } finally {
    inFlight.delete(lockKey)
  }
}
