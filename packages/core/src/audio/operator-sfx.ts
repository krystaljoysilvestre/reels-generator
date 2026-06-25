import { z } from 'zod'
import type { VoiceSettings } from '../voice/voice-settings.js'

// Operator-authored sound cues added at the storyboard (the "Add a sound" box). Two kinds, one shape:
//  • sfx    — a one-shot sound effect (ElevenLabs sound-effects), e.g. "creepy laugh".
//  • speech — short spoken/whispered words (a SECOND TTS voice), e.g. an old woman whispering "come closer".
// Anchored to a verbatim, unique narration substring; merged into the SFX list at compute_timings +
// generate_sfx and mixed as a timestamped clip over the narration (same path as LLM SFX).

export const OperatorCueSchema = z.object({
  id: z.string().min(1),
  // 'manual' = added by the operator on a specific scene (kept across renders, previewable/removable);
  // 'smart'  = realized from the auto Sound design notes at render (regenerated each time notes change).
  source: z.enum(['manual', 'smart']).default('manual'),
  anchor: z.string().min(1), // verbatim, unique substring of the narration
  offsetMs: z.number().int().default(0),
  volumeDb: z.number().default(-8),
  // 'sfx' = one-shot effect; 'speech' = off-screen voice line; 'ambience' = a longer room-tone bed.
  kind: z.enum(['sfx', 'speech', 'ambience']),
  // sfx
  prompt: z.string().optional(), // "creepy laugh"
  // speech
  words: z.string().optional(), // the actual words spoken
  speaker: z.string().optional(), // "old woman" — for display
  delivery: z.string().optional(), // "whisper", "shout", …
  voiceId: z.string().optional(), // auto-picked from the catalog
  // a cached preview clip (R2 key) — reused at render so it isn't paid for twice
  assetKey: z.string().optional(),
})
export type OperatorCue = z.infer<typeof OperatorCueSchema>

export const OperatorSfxSchema = z.array(OperatorCueSchema).default([])

// A short label for the cue, used in the UI and as the SFX-event prompt field.
export function operatorCueLabel(cue: OperatorCue): string {
  if (cue.kind === 'speech') {
    const who = cue.speaker ? `${cue.speaker} ` : ''
    const how = cue.delivery ? `${cue.delivery}s` : 'says'
    return cue.words ? `${who}${how}: “${cue.words}”` : `${who}voice`
  }
  return cue.prompt ?? (cue.kind === 'ambience' ? 'ambience' : 'sound effect')
}

// Default mix level per kind: an off-screen line should cut THROUGH the narration, an effect sits just
// under it, ambience sits low as a bed.
export function cueVolumeDb(kind: OperatorCue['kind']): number {
  return kind === 'speech' ? -3 : kind === 'ambience' ? -16 : -8
}

// How long to generate the clip. Ambience needs a longer take so it reads as a bed, not a blip; one-shots
// stay short. (Eleven Music sound-effects caps around 22s.)
export function cueDurationSec(kind: OperatorCue['kind']): number {
  return kind === 'ambience' ? 12 : 2
}

function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0
  let n = 0, i = 0
  while ((i = text.indexOf(sub, i)) !== -1) { n++; i++ }
  return n
}

// Operator cues whose anchor still appears in the narration (≥1 time). compute_timings places them at the
// first match; one that no longer resolves (narration edited after the sound was added) is skipped rather
// than crashing the render. Used by generate_sfx to decide which cues to render audio for.
export function usableOperatorCues(cues: OperatorCue[], narration: string): OperatorCue[] {
  return cues.filter((c) => countOccurrences(narration, c.anchor) >= 1)
}

// Map a plain-language delivery to ElevenLabs voice settings for the overlay line. These are nudges, not
// guarantees — true whisper fidelity depends on the chosen voice, which is why the operator previews it.
// `base` is the reel's narrator delivery; we tilt away from it so the overlay reads as a different person.
export function deliveryToVoiceSettings(delivery: string | undefined, base: VoiceSettings): VoiceSettings {
  const d = (delivery ?? '').toLowerCase()
  if (/whisper|hush|breath/.test(d)) return { ...base, stability: 0.3, style: 0.15, speed: 0.92 }
  if (/shout|scream|yell/.test(d)) return { ...base, stability: 0.25, style: 0.55, speed: 1.0 }
  if (/sing|chant/.test(d)) return { ...base, stability: 0.4, style: 0.5, speed: 0.95 }
  return base
}
