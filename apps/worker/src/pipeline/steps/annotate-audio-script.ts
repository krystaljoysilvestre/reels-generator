import { eq } from 'drizzle-orm'
import { getDb, reels, stories } from '@reels/db'
import { llmCall, listVoices, buildInputHash } from '@reels/providers'
import { AudioScriptSchema, AudioPacksSchema, OperatorSfxSchema, cueVolumeDb, type AudioScript, type OperatorCue } from '@reels/core'
import { buildInterpretSoundsPrompt, InterpretSoundsSchema, INTERPRET_SOUNDS_V1_VERSION } from '@reels/core/prompts/interpret-sounds.v1'
import { buildAudioScriptPrompt, AUDIOSCRIPT_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// Realize the operator's free-text Sound design notes into structured, anchored cues (the hidden step).
// Runs at render off the FINAL narration so anchors are valid; cues that don't resolve uniquely are
// dropped. For speech cues, auto-pick a fitting voice from the catalog. Result feeds compute_timings +
// generate_sfx (which place + render them like any SFX).
async function realizeSoundNotes(notes: string, narration: string, language: string): Promise<{ cues: OperatorCue[]; silenceAnchor: string | null }> {
  if (!notes.trim()) return { cues: [], silenceAnchor: null }
  const { system, userMessage } = buildInterpretSoundsPrompt({ notes, narration })
  const { data } = await llmCall({
    templateVersion: INTERPRET_SOUNDS_V1_VERSION,
    schema: InterpretSoundsSchema,
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 900,
  })
  const cues: OperatorCue[] = []
  let silenceAnchor: string | null = null
  for (const c of data.cues ?? []) {
    const hits = countOccurrences(narration, c.anchor)
    if (hits < 1) continue // anchor not in narration → can't place; skip
    if (c.kind === 'silence') {
      // Routed to audioScript.silenceDrop, which is HARD-resolved → only a unique anchor is safe.
      if (hits === 1 && !silenceAnchor) silenceAnchor = c.anchor
      continue
    }
    if (c.kind === 'speech') {
      if (!c.words?.trim()) continue
      const catalog = await listVoices(language, c.voiceSearchKeyword ? { search: c.voiceSearchKeyword } : undefined)
      const pool = c.gender && c.gender !== 'any' ? catalog.filter((v) => v.gender.toLowerCase() === c.gender) : catalog
      const voiceId = (pool[0] ?? catalog[0])?.id
      if (!voiceId) continue
      cues.push({ id: crypto.randomUUID(), source: 'smart', anchor: c.anchor, offsetMs: c.offsetMs ?? 0, volumeDb: cueVolumeDb('speech'), kind: 'speech', words: c.words, speaker: c.speaker || undefined, delivery: c.delivery || undefined, voiceId })
    } else {
      const kind = c.kind === 'ambience' ? 'ambience' : 'sfx'
      cues.push({ id: crypto.randomUUID(), source: 'smart', anchor: c.anchor, offsetMs: c.offsetMs ?? 0, volumeDb: cueVolumeDb(kind), kind, prompt: c.prompt || (kind === 'ambience' ? 'ambience' : 'sound effect') })
    }
  }
  return { cues, silenceAnchor }
}

// annotate_audio_script — step 2 (docs/02 §4)
// Validates anchor uniqueness after generation.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateAnchorUniqueness(narration: string, audioScript: any): string[] {
  const errors: string[] = []

  const allAnchors: { anchor: string; field: string }[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...audioScript.sfx.map((s: any) => ({ anchor: s.anchor as string, field: 'sfx' })),
    ...(audioScript.silenceDrop ? [{ anchor: audioScript.silenceDrop.anchor, field: 'silenceDrop' }] : []),
  ]

  for (const { anchor, field } of allAnchors) {
    if (!anchor) continue
    const occurrences = countOccurrences(narration, anchor)
    if (occurrences === 0) errors.push(`${field} anchor not found in narration: "${anchor}"`)
    if (occurrences > 1) errors.push(`${field} anchor ambiguous (${occurrences} matches): "${anchor}"`)
  }

  return errors
}

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0
  let count = 0, pos = 0
  while ((pos = text.indexOf(sub, pos)) !== -1) { count++; pos++ }
  return count
}

export async function annotateAudioScript(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  const { system, userMessage } = buildAudioScriptPrompt(story.body)
  const inputHash = buildInputHash(AUDIOSCRIPT_V1_VERSION, { narration: story.body })

  const result = await runStep(
    { reelId, stepName: 'annotate_audio_script', inputHash },
    async () => {
      const llm = await llmCall({
        templateVersion: AUDIOSCRIPT_V1_VERSION,
        schema: AudioScriptSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Validate anchor uniqueness — repair call if any fail
      const errors = validateAnchorUniqueness(story.body, llm.data)
      if (errors.length > 0) {
        const repairLlm = await llmCall({
          templateVersion: AUDIOSCRIPT_V1_VERSION,
          schema: AudioScriptSchema,
          system,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: JSON.stringify(llm.data) },
            {
              role: 'user',
              content: `The following anchors are invalid: ${errors.join('; ')}. Each anchor must be an exact substring that appears EXACTLY ONCE in the narration. Extend any ambiguous anchor span until unique. Return the corrected JSON only.`,
            },
          ],
        })
        return { output: repairLlm.data, costCents: llm.costCents + repairLlm.costCents }
      }

      return { output: llm.data, costCents: llm.costCents }
    },
  )

  // Every reel should have background music (Sound step). If this reel's script proposed none, inject
  // an intent — empty anchors let compute-timings pick the start (0) and peak (twist/0.8×duration).
  //  • AI-music channels have no pool (each reel's bed is generated downstream by generate_music), so
  //    seed the intent from the channel's derived audioMood.
  //  • preset/upload channels seed from their first pool bed; selectMusicTrack matches it by type.
  const audioScript = result.output as AudioScript
  if (!audioScript.music) {
    const { channels } = await import('@reels/db')
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
    const audioPacks = channel ? AudioPacksSchema.parse(channel.audioPacks) : undefined
    if (audioPacks?.musicMode === 'ai') {
      audioScript.music = {
        type: audioPacks.audioMood?.type ?? 'low_drone',
        startAnchor: '',
        peakAnchor: '',
        moodTags: audioPacks.audioMood?.moodTags ?? [],
      }
    } else {
      const bed = audioPacks?.musicPack[0]
      if (bed) {
        audioScript.music = { type: bed.type, startAnchor: '', peakAnchor: '', moodTags: bed.moodTags }
      }
    }
  }

  // Persist audio_script to reel
  await db
    .update(reels)
    .set({ audioScript: audioScript as never, updatedAt: new Date() })
    .where(eq(reels.id, reelId))

  // Realize the reel-level smart Sound design notes into placeable cues, and MERGE with the operator's
  // manual per-scene cues (which we preserve). Manual wins on anchor collisions. Keyed by notes + narration
  // + the manual-cue signature so it re-runs when any of them change; compute_timings + generate_sfx render
  // them downstream.
  const manualCues = OperatorSfxSchema.parse(reel.operatorSfx ?? []).filter((c) => c.source === 'manual')
  const manualSig = manualCues.map((c) => `${c.id}:${c.anchor}:${c.assetKey ?? ''}`).join('|')
  const interpretHash = buildInputHash('interpret_sounds.v1', { notes: reel.soundNotes ?? '', narration: story.body, manualSig })
  await runStep(
    { reelId, stepName: 'annotate_audio_script', inputHash: `${interpretHash}:interpret` as never },
    async () => {
      const manualAnchors = new Set(manualCues.map((c) => c.anchor))
      const { cues: smartAll, silenceAnchor } = await realizeSoundNotes(reel.soundNotes ?? '', story.body, reel.language)
      const smart = smartAll.filter((c) => !manualAnchors.has(c.anchor))
      await db.update(reels).set({ operatorSfx: [...manualCues, ...smart] as never, updatedAt: new Date() }).where(eq(reels.id, reelId))
      // A smart "silence" note sets the dramatic drop (only if the LLM didn't already place one). The mixer
      // dips the music bed there; compute_timings hard-resolves the anchor (we only set a unique one).
      if (silenceAnchor && !audioScript.silenceDrop) {
        const withSilence = { ...audioScript, silenceDrop: { anchor: silenceAnchor, durationMs: 1200 } }
        await db.update(reels).set({ audioScript: withSilence as never, updatedAt: new Date() }).where(eq(reels.id, reelId))
      }
      return { output: { manual: manualCues.length, smart: smart.length, silence: silenceAnchor ? 1 : 0 }, costCents: 0 }
    },
  )
}
