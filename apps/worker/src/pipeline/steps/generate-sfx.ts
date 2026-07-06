import { eq, and } from 'drizzle-orm'
import { getDb, reels, stories, assets } from '@reels/db'
import { generateSfx as elGenerateSfx, generateSpeechClip, buildInputHash } from '@reels/providers'
import {
  AudioScriptSchema,
  AudioPacksSchema,
  OperatorSfxSchema,
  ToneConfigSchema,
  usableOperatorCues,
  operatorCueLabel,
  cueDurationSec,
  deliveryToVoiceSettings,
  moodToVoiceSettings,
  isVocalSfxPrompt,
  type VoiceSettings,
} from '@reels/core'
import { runStep } from '../harness.js'

// generate_sfx — step 7 (docs/02 §4)
// Generates each annotated SFX + selects ambient bed from channel audio pack.
// Timings are already resolved in compute_timings; this step produces the audio files.

export async function generateSfx(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.audioScript) throw new Error(`Reel has no audio_script: ${reelId}`)

  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  // ── Ambient selection from channel audio pack ────────────────────────────
  const { channels } = await import('@reels/db')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  const audioPacks = AudioPacksSchema.parse(channel.audioPacks)

  // Match ambient packTags to the channel's ambient pack keys
  const ambientTag = audioScript.ambient.packTags[0] ?? 'province_night'
  const ambientFiles = audioPacks.ambientPacks[ambientTag] ?? []

  if (ambientFiles.length > 0) {
    // Ambient beds are pre-curated files — just record the selected path as an asset
    const ambientPath = `audio/ambient/${ambientFiles[0]}.mp3`
    await db
      .insert(assets)
      .values({
        reelId,
        channelId: reel.channelId,
        kind: 'ambient',
        storageKey: ambientPath,
        provider: 'local',
        costCents: 0,
        meta: { packTag: ambientTag, fileName: ambientFiles[0] },
      })
      .onConflictDoNothing()
  }

  // Operator-authored cues (storyboard "Add a sound"), resolved against the current narration. They take
  // precedence over an LLM cue on the same anchor, so filter those out of the LLM set below.
  const story = reel.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : null
  const operatorCues = story ? usableOperatorCues(OperatorSfxSchema.parse(reel.operatorSfx ?? []), story.body) : []
  const opAnchors = new Set(operatorCues.map((c) => c.anchor))

  // ── Generate all SFX cues via ElevenLabs in one idempotent step ─────────
  // "Smart sound effects" toggle (Sound step): when off, generate no SFX for this channel. (Operator cues
  // are explicit user requests, so they generate regardless of the channel toggle — handled separately.)
  // Vocal prompts are dropped (safety net behind the sound designer's non-vocal-SFX rule): a synthesized
  // gasp/laugh/whisper reads as a random stranger next to the narrator. Intentional voices go through the
  // designer's speech cues, not SFX.
  const sfxCues = (audioPacks.sfxEnabled ? audioScript.sfx : [])
    .filter((c) => !opAnchors.has(c.anchor))
    .filter((c) => {
      if (!isVocalSfxPrompt(c.prompt)) return true
      console.log(`[sfx] dropped vocal SFX prompt "${c.prompt}" @ "${c.anchor}" (${reelId})`)
      return false
    })
  const sfxAnchors = sfxCues.map((c) => c.anchor).sort().join('|')
  const inputHash = buildInputHash('sfx.elevenlabs.v1', { sfxAnchors, reelId, sfxEnabled: audioPacks.sfxEnabled })

  await runStep(
    { reelId, stepName: 'generate_sfx', inputHash },
    async () => {
      // Per-cue idempotency: if this batch threw partway on a prior attempt, the cues that DID complete
      // already have an asset row. Skip those so a retry doesn't re-call (re-pay) ElevenLabs for them.
      const existingSfx = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'sfx')) })
      const doneAnchors = new Set(existingSfx.map((a) => (a.meta as { anchor?: string }).anchor).filter(Boolean))

      let totalCost = 0
      for (const cue of sfxCues) {
        if (doneAnchors.has(cue.anchor)) continue // already generated on a prior attempt — don't re-pay
        // Build-to-hit cues get extra runway to swell; the mixer shifts them so the hit lands on the anchor.
        const sfxResult = await elGenerateSfx({
          prompt: cue.prompt,
          reelId,
          anchorLabel: cue.anchor,
          durationSec: cue.impactAtEnd ? 3 : 2,
        })
        totalCost += sfxResult.costCents
        await db
          .insert(assets)
          .values({
            reelId,
            channelId: reel.channelId,
            kind: 'sfx',
            storageKey: sfxResult.audioStorageKey,
            provider: 'elevenlabs',
            costCents: sfxResult.costCents,
            meta: { anchor: cue.anchor, prompt: cue.prompt, durationMs: sfxResult.durationMs, impactAtEnd: cue.impactAtEnd },
          })
          .onConflictDoNothing()
      }
      return { output: { sfxCount: sfxCues.length }, costCents: totalCost }
    },
  )

  // ── Operator cues: SFX one-shots + spoken (second-voice) overlays ───────
  // Each renders to a deterministic per-cue key, so a storyboard Preview is reused here (cost 0). One
  // asset row per cue (delete-then-insert) keeps the mixer's anchor→asset match unambiguous on re-runs.
  if (operatorCues.length > 0) {
    const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
    const base = (reel.voiceSettings as VoiceSettings | null) ?? moodToVoiceSettings([], tone, channel.genreCategory)

    for (const cue of operatorCues) {
      const storageKey = `reels/${reelId}/sfx/op-${cue.id}.mp3`
      const inputHash = buildInputHash('operator_sfx.v1', {
        id: cue.id, anchor: cue.anchor, kind: cue.kind,
        cached: cue.assetKey ? '1' : '0',
        prompt: cue.prompt ?? '', words: cue.words ?? '', voiceId: cue.voiceId ?? '', delivery: cue.delivery ?? '',
      })

      await runStep(
        { reelId, stepName: 'generate_sfx', inputHash: `${inputHash}:op-${cue.id}` as never },
        async () => {
          let cost = 0
          // Reuse the storyboard Preview clip if present; otherwise synthesize now.
          if (!cue.assetKey) {
            if (cue.kind === 'speech' && cue.voiceId && cue.words) {
              const res = await generateSpeechClip({ text: cue.words, voiceId: cue.voiceId, storageKey, voiceSettings: deliveryToVoiceSettings(cue.delivery, base) })
              cost = res.costCents
            } else {
              const res = await elGenerateSfx({ prompt: cue.prompt ?? operatorCueLabel(cue), reelId, anchorLabel: `op-${cue.id}`, durationSec: cueDurationSec(cue.kind) })
              cost = res.costCents
            }
          }
          await db.delete(assets).where(and(eq(assets.reelId, reelId), eq(assets.storageKey, storageKey)))
          await db.insert(assets).values({
            reelId,
            channelId: reel.channelId,
            kind: 'sfx',
            storageKey,
            provider: 'elevenlabs',
            costCents: cost,
            meta: { anchor: cue.anchor, prompt: operatorCueLabel(cue), operator: true },
          })
          return { output: { anchor: cue.anchor }, costCents: cost }
        },
      )
    }
  }
}
