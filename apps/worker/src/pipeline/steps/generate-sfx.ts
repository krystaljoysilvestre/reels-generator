import { eq, and } from 'drizzle-orm'
import { getDb, reels, stories, assets } from '@reels/db'
import { generateSfx as elGenerateSfx, buildInputHash } from '@reels/providers'
import { AudioScriptSchema, AudioPacksSchema } from '@reels/core'
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

  // ── Generate all SFX cues via ElevenLabs in one idempotent step ─────────
  // "Smart sound effects" toggle (Sound step): when off, generate no SFX for this channel.
  const sfxCues = audioPacks.sfxEnabled ? audioScript.sfx : []
  const sfxAnchors = sfxCues.map((c) => c.anchor).sort().join('|')
  const inputHash = buildInputHash('sfx.elevenlabs.v1', { sfxAnchors, reelId, sfxEnabled: audioPacks.sfxEnabled })

  await runStep(
    { reelId, stepName: 'generate_sfx', inputHash },
    async () => {
      let totalCost = 0
      for (const cue of sfxCues) {
        const sfxResult = await elGenerateSfx({
          prompt: cue.prompt,
          reelId,
          anchorLabel: cue.anchor,
          durationSec: 2,
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
            meta: { anchor: cue.anchor, prompt: cue.prompt, durationMs: sfxResult.durationMs },
          })
          .onConflictDoNothing()
      }
      return { output: { sfxCount: sfxCues.length }, costCents: totalCost }
    },
  )
}
