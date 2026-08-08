import { eq, and } from 'drizzle-orm'
import { createHash } from 'node:crypto'
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
  effectiveGenre,
} from '@reels/core'
import { runStep } from '../harness.js'
import { runPool } from '../pool.js'

// generate_sfx — step 7 (docs/02 §4)
// Generates each annotated SFX + selects ambient bed from channel audio pack.
// Timings are already resolved in compute_timings; this step produces the audio files.

// Cues are generated concurrently. Matched to the elevenlabs semaphore (providers/shared/limiter), which
// remains the authoritative cap on in-flight calls; this only bounds how many this step puts in flight.
const SFX_CONCURRENCY = 4

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
  const designedCues = (audioPacks.sfxEnabled ? audioScript.sfx : [])
    .filter((c) => !opAnchors.has(c.anchor))
    .filter((c) => {
      if (!isVocalSfxPrompt(c.prompt)) return true
      console.log(`[sfx] dropped vocal SFX prompt "${c.prompt}" @ "${c.anchor}" (${reelId})`)
      return false
    })
  // ONE cue per anchor. Nothing upstream enforces this — the designer may put two different sounds on the
  // same anchor — but mix_audio premixes only the newest asset per anchor and skips the rest (usedAnchors),
  // so a second cue on an anchor was always generated, paid for, and then discarded. Keeping the LAST cue
  // preserves which one the mixer used to choose (newest-wins ≡ last-generated, back when cues were
  // sequential). This also makes the winner deterministic now that cues generate concurrently, where
  // completion order — not script order — would otherwise decide it.
  const byAnchor = new Map<string, (typeof designedCues)[number]>()
  for (const c of designedCues) byAnchor.set(c.anchor, c)
  const sfxCues = [...byAnchor.values()]
  if (sfxCues.length < designedCues.length) {
    console.log(`[sfx] ${reelId.slice(0, 8)}: ${designedCues.length - sfxCues.length} duplicate-anchor cue(s) dropped before generation`)
  }
  // Key on anchor+prompt+duration (not anchor alone): a new design may reuse an anchor with a DIFFERENT
  // sound or a DIFFERENT length, and either must regenerate — else the render keeps the stale clip for
  // that spot. (mix_audio then picks the newest asset per anchor.)
  // Sustained cues (endAnchor set) default to a 10s loop clip; point cues keep the legacy 3s/2s fallback.
  const resolveDur = (c: { impactAtEnd: boolean; targetDurationSec?: number | undefined; endAnchor?: string | undefined }) =>
    c.targetDurationSec ?? (c.endAnchor ? 10 : c.impactAtEnd ? 3 : 2)
  const cueKey = (c: { anchor: string; prompt: string; impactAtEnd: boolean; targetDurationSec?: number | undefined; endAnchor?: string | undefined }) =>
    `${c.anchor}\x00${c.prompt}\x00${resolveDur(c)}${c.endAnchor ? ' loop' : ''}`
  const sfxAnchors = sfxCues.map(cueKey).sort().join('|')
  // v4: per-cue unique storage keys + upsert (v3 collided on the anchor-slug key and dropped new takes).
  // v5: sustained loop cues (endAnchor -> seamless-loop generation).
  const inputHash = buildInputHash('sfx.elevenlabs.v5', { sfxAnchors, reelId, sfxEnabled: audioPacks.sfxEnabled })

  await runStep(
    { reelId, stepName: 'generate_sfx', inputHash },
    async (cost) => {
      // Per-cue idempotency: if this batch threw partway on a prior attempt, the cues that DID complete
      // already have an asset row. Skip those (by anchor+prompt) so a retry doesn't re-pay ElevenLabs —
      // but a CHANGED prompt on the same anchor is a different key, so it regenerates.
      const existingSfx = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'sfx')) })
      const done = new Set(existingSfx.map((a) => {
        const m = a.meta as { anchor?: string; prompt?: string; durationSec?: number; durationMs?: number; impactAtEnd?: boolean; loop?: boolean }
        if (!m.anchor) return null
        const dur = m.durationSec ?? (m.durationMs != null ? m.durationMs / 1000 : m.impactAtEnd ? 3 : 2)
        return `${m.anchor}\x00${m.prompt ?? ''}\x00${dur}${m.loop ? ' loop' : ''}`
      }).filter(Boolean) as string[])

      // Cues generate CONCURRENTLY: each is an independent ElevenLabs round trip writing its own storage key
      // (slugSuffix is derived from the cue), so nothing is shared but the cost tally. A designed reel carries
      // ~10-18 cues, which serially made this step the sum of every one of those round trips.
      let totalCost = 0
      await runPool(sfxCues.filter((c) => !done.has(cueKey(c))), SFX_CONCURRENCY, async (cue) => {
        // Clip length = the designer's choice (long builds/drones) or the legacy fallback; the mixer
        // shifts a build-to-hit cue so its detected impact lands on the anchor.
        const dur = resolveDur(cue)
        // Per-cue key suffix so a new design that reuses an anchor with a DIFFERENT sound/length lands on
        // its OWN storage key instead of colliding with a stale asset from a prior render (the old key was
        // the anchor slug alone → collisions were silently dropped by onConflictDoNothing, leaving stale
        // audio + meta in the mix).
        const slugSuffix = createHash('sha1').update(cueKey(cue)).digest('hex').slice(0, 10)
        const sustained = !!cue.endAnchor
        const sfxResult = await elGenerateSfx({
          prompt: cue.prompt,
          reelId,
          anchorLabel: cue.anchor,
          durationSec: dur,
          slugSuffix,
          ...(sustained ? { loop: true } : {}),
        })
        totalCost += sfxResult.costCents
        // Also report through the sink. A LATER cue in this batch throwing would otherwise lose this cue's
        // cost permanently: the `done` set makes the retry skip it, so its cost is never returned again.
        // The harness bills the sink total ONLY when fn throws (never alongside the return) — not a double-add.
        cost.add(sfxResult.costCents)
        const meta = { anchor: cue.anchor, prompt: cue.prompt, durationMs: sfxResult.durationMs, durationSec: dur, impactAtEnd: cue.impactAtEnd, loop: sustained }
        // Upsert (not DoNothing): if this exact cue was generated before, refresh its meta and bump
        // createdAt so the mixer's newest-per-anchor pick lands on the current take.
        await db
          .insert(assets)
          .values({
            reelId,
            channelId: reel.channelId,
            kind: 'sfx',
            storageKey: sfxResult.audioStorageKey,
            provider: 'elevenlabs',
            costCents: sfxResult.costCents,
            meta,
          })
          .onConflictDoUpdate({
            target: [assets.reelId, assets.storageKey],
            set: { kind: 'sfx', provider: 'elevenlabs', costCents: sfxResult.costCents, meta, createdAt: new Date() },
          })
      }, 'sfx cue')
      return { output: { sfxCount: sfxCues.length }, costCents: totalCost }
    },
  )

  // ── Operator cues: SFX one-shots + spoken (second-voice) overlays ───────
  // Each renders to a deterministic per-cue key, so a storyboard Preview is reused here (cost 0). One
  // asset row per cue (delete-then-insert) keeps the mixer's anchor→asset match unambiguous on re-runs.
  if (operatorCues.length > 0) {
    const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
    const base = (reel.voiceSettings as VoiceSettings | null) ?? moodToVoiceSettings([], tone, effectiveGenre(reel, channel))

    // Also concurrent — one step row and one deterministic storage key per cue, so they never interact.
    await runPool(operatorCues, SFX_CONCURRENCY, async (cue) => {
      const storageKey = `reels/${reelId}/sfx/op-${cue.id}.mp3`
      const inputHash = buildInputHash('operator_sfx.v1', {
        id: cue.id, anchor: cue.anchor, kind: cue.kind,
        cached: cue.assetKey ? '1' : '0',
        prompt: cue.prompt ?? '', words: cue.words ?? '', voiceId: cue.voiceId ?? '', delivery: cue.delivery ?? '',
      })

      // Per-cue step row (`generate_sfx:op-<id>`), matching the fan-out convention used by
      // generate_images:scene<idx> and animate_scenes:s<idx>v<v>. The per-cue uniqueness used to sit on the
      // inputHash while every cue shared the bare 'generate_sfx' step name — but idempotency is keyed on
      // (reelId, stepName), so the batch and all cues overwrote ONE row and no cue's hash ever matched on a
      // re-run: every retry/re-render re-synthesized (and re-paid for) every cue without a preview clip.
      await runStep(
        { reelId, stepName: `generate_sfx:op-${cue.id}` as never, inputHash },
        async (costSink) => {
          let cost = 0
          // Reuse the storyboard Preview clip if present; otherwise synthesize now.
          if (!cue.assetKey) {
            if (cue.kind === 'speech' && cue.voiceId && cue.words) {
              const res = await generateSpeechClip({ text: cue.words, voiceId: cue.voiceId, storageKey, voiceSettings: deliveryToVoiceSettings(cue.delivery, base) })
              cost = res.costCents
              costSink.add(cost) // paid — the asset writes below can still throw
            } else {
              // Ambience wants looser prompt adherence for richer, more organic texture; one-shots want the
              // clip to sound like the literal prompt (provider default).
              const res = await elGenerateSfx({ prompt: cue.prompt ?? operatorCueLabel(cue), reelId, anchorLabel: `op-${cue.id}`, durationSec: cueDurationSec(cue.kind), ...(cue.kind === 'ambience' ? { promptInfluence: 0.3 } : {}) })
              cost = res.costCents
              costSink.add(cost)
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
    }, 'operator cue')
  }
}
