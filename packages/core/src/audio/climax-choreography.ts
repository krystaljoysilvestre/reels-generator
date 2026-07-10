import type { SfxCue, SilenceDrop } from '../types/audio-script.js'

// Deterministic climax choreography (owner-set HORROR guarantee, 2026-07-10). The LLM anchors the climax
// hit on whatever narration line reads as the reveal — which often falls in a DIFFERENT scene than the
// visual PAYOFF (the hero/reveal scene the viewer is watching), so the scare fired seconds early over the
// wrong picture. This lands the one hit ON the payoff scene, preceded by a beat of silence, with any
// sustained texture clamped to stop before that silence — so it's always: tension → silence → HIT on the
// payoff. Pure + testable; annotate_audio_script applies it. Deliberate per-genre tuning (unbiased-design's
// legitimate exception), not a creative choice left to the model.

export interface ChoreoScene {
  idx: number
  isHero: boolean
  narrationText: string
}

// The guaranteed horror jumpscare sound. Owner-set (2026-07-10): the LLM's climax kept being a telegraphed
// "whoosh swelling into a boom" (impactAtEnd) whose build fills the silence and softens the startle — or a
// shrill screech. A jumpscare is a SUDDEN hit out of quiet: a hard-attack slam with deep body, fired ON the
// payoff (impactAtEnd=false, no build), at the top of the range. Single deterministic scare sound is a
// per-genre default the owner explicitly wants — the legitimate-tuning exception, documented here.
// Kept concise (ElevenLabs SFX rejects prompts over ~450 chars, and shorter prompts generate cleaner).
export const CLIMAX_HIT_PROMPT =
  'a sudden, violent, TRAUMATIC BANG — a hard cracking attack into a huge bone-rattling impact, then a long dissonant tail ringing out like the end of a horror film; as LOUD, PRESENT and CUTTING as possible on a phone speaker, overwhelming low-mid punch, NOT a soft deep sub-bass rumble, NOT a shrill high screech'
const CLIMAX_HIT_VOLUME_DB = 9 // top of the (raised) range — the single loudest, most traumatic moment
const CLIMAX_HIT_DURATION_SEC = 8 // longer so the dissonant sting tail rings out over the reveal

const words = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean)
const firstWords = (t: string, n: number): string => words(t).slice(0, n).join(' ')
const lastWords = (t: string, n: number): string => { const w = words(t); return w.slice(Math.max(0, w.length - n)).join(' ') }

function occurrences(hay: string, needle: string): number {
  if (!needle) return 0
  let c = 0, i = 0
  while ((i = hay.indexOf(needle, i)) !== -1) { c++; i += needle.length }
  return c
}

// A cue is a genuine climax HIT if it builds to its impact, or it's clearly the loudest (a hit sits at the
// top of the range, ~0dB+, while realism cues are negative).
function findClimaxIndex(sfx: SfxCue[]): number {
  const built = sfx.findIndex((c) => c.impactAtEnd)
  if (built !== -1) return built
  let best = -1
  for (let i = 0; i < sfx.length; i++) {
    if (sfx[i]!.volumeDb >= 0 && (best === -1 || sfx[i]!.volumeDb > sfx[best]!.volumeDb)) best = i
  }
  return best
}

export function choreographClimax(params: {
  sfx: SfxCue[]
  silenceDrop: SilenceDrop | null
  scenes: ChoreoScene[]
  narration?: string // the full narration for uniqueness checks (defaults to joined scene text)
}): { sfx: SfxCue[]; silenceDrop: SilenceDrop | null; payoffAnchor: string | null; silenceAnchor: string | null } {
  const scenes = [...params.scenes].sort((a, b) => a.idx - b.idx)
  const unchanged = { sfx: params.sfx, silenceDrop: params.silenceDrop, payoffAnchor: null, silenceAnchor: null }
  if (scenes.length < 2) return unchanged

  const narration = params.narration ?? scenes.map((s) => s.narrationText).join(' ')

  // Payoff = the LAST hero scene (the climactic reveal), else the last scene. Must not be the first scene
  // (need a scene before it to host the silence beat).
  let payoffIdx = -1
  for (let i = scenes.length - 1; i >= 0; i--) { if (scenes[i]!.isHero) { payoffIdx = i; break } }
  if (payoffIdx <= 0) payoffIdx = scenes.length - 1
  if (payoffIdx <= 0) return unchanged

  const climaxI = findClimaxIndex(params.sfx)
  if (climaxI === -1) return unchanged // no real hit to place

  const payoffAnchor = firstWords(scenes[payoffIdx]!.narrationText, 6)
  if (!payoffAnchor || occurrences(narration, payoffAnchor) !== 1) return unchanged // can't uniquely anchor

  const rawSilence = lastWords(scenes[payoffIdx - 1]!.narrationText, 5)
  const silenceAnchor = rawSilence && occurrences(narration, rawSilence) === 1 ? rawSilence : null

  // Which scene contains an anchor (first substring match). -1 if none.
  const sceneIdxOf = (anchor: string): number => {
    const found = scenes.find((s) => s.narrationText.includes(anchor))
    return found ? found.idx : -1
  }

  const sfx = params.sfx.map((c, i) => {
    let cue = c
    // The hit → the payoff scene, as a SUDDEN slam (no telegraphing build), top-of-range.
    if (i === climaxI) {
      cue = { ...cue, anchor: payoffAnchor, prompt: CLIMAX_HIT_PROMPT, impactAtEnd: false, volumeDb: CLIMAX_HIT_VOLUME_DB, targetDurationSec: CLIMAX_HIT_DURATION_SEC }
    }
    // A sustained texture that would run INTO or PAST the payoff is clamped to stop at the silence, so the
    // hit detonates out of quiet. Textures that already end earlier are left alone.
    if (cue.endAnchor && silenceAnchor) {
      const endIdx = sceneIdxOf(cue.endAnchor)
      if (endIdx === -1 || endIdx >= scenes[payoffIdx]!.idx) cue = { ...cue, endAnchor: silenceAnchor }
    }
    return cue
  })

  const silenceDrop = silenceAnchor
    ? { anchor: silenceAnchor, durationMs: params.silenceDrop?.durationMs ?? 900 }
    : params.silenceDrop

  return { sfx, silenceDrop, payoffAnchor, silenceAnchor }
}
