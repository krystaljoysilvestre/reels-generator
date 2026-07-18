// story-voices.v1 — the VOICE layer: how the NARRATOR SOUNDS in prose (confessional / deadpan /
// documentary / diary…). Per-channel, operator-selectable, GENRE-AGNOSTIC (a confessional voice
// works across horror, drama, reddit). A pure Writer concern.
//
// ── LAYER-RESPONSIBILITY RULE ──
// Voice owns PROSE EXPRESSION only — rhythm, vocabulary, humor, register. It does NOT touch what
// happens (Planner/Elements), why it works (Mechanics), or the tradition (Style). When a channel
// sets narrativeVoice, it LAYERS ON / OVERRIDES the genre writer-identity's default sound
// (typicalRhythm/emotionalPalette); unset = the identity's default. It never competes with story
// mechanics — different axis entirely.
//
// NAMING: this is `narrativeVoice` — the PROSE narrator's sound, NOT the TTS/audio voice
// (voiceId/voiceMode/voicePool) and NOT voiceSearchKeyword. Authored under unbiased-design:
// tendencies to reason from, never mandates. Versioned: any edit bumps STORY_VOICES_V1_VERSION.

export const STORY_VOICES_V1_VERSION = 'voices.v1.1'

export interface VoiceSpec {
  /** e.g. "Confessional" — shown in the picker */
  label: string
  /** how the narrator comes across */
  sound: string
  /** sentence-cadence tendency */
  sentenceRhythm: string
  /** word-choice lean */
  vocabularyLean: string
  /** where humor sits (or doesn't) */
  humor: string
  /** one-line "reads like…" */
  tell: string
}

// ~6 at launch (the owner's named set). Flat + cross-genre. Expand on real usage.
export const STORY_VOICES: Record<string, VoiceSpec> = {
  confessional: {
    label: 'Confessional',
    sound: 'Telling one person something they\'ve never told anyone — close, a little exposed, unperformed.',
    sentenceRhythm: 'Short, uneven; trails off; doubles back to correct itself.',
    vocabularyLean: 'Plain, spoken, the words you\'d actually use at 2AM — never literary.',
    humor: 'Rare; if any, nervous, at their own expense.',
    tell: 'Reads like a secret being said out loud for the first time.',
  },
  conversational: {
    label: 'Conversational',
    sound: 'Talking to a friend — warm, casual, direct address, "you know that feeling…".',
    sentenceRhythm: 'Easy and varied; asides and little check-ins with the listener.',
    vocabularyLean: 'Everyday, relaxed; contractions, slang where natural.',
    humor: 'Light and frequent; the tone of someone easy to be around.',
    tell: 'Reads like a voice note to your closest group chat.',
  },
  deadpan: {
    label: 'Deadpan',
    sound: 'Flat, unbothered, understated — the bigger the thing, the calmer the telling.',
    sentenceRhythm: 'Clipped, controlled; the weight sits in what\'s NOT reacted to.',
    vocabularyLean: 'Spare, matter-of-fact; no adjectives doing emotional work.',
    humor: 'Dry, from the gap between the event and the flat delivery.',
    tell: 'Reads like someone reporting chaos like it\'s a grocery list.',
  },
  documentary: {
    label: 'Documentary',
    sound: 'Observed and precise — an outside recounting of what happened, grounded in specifics.',
    sentenceRhythm: 'Measured, even; time and place stated cleanly.',
    vocabularyLean: 'Concrete nouns, dates, details; restrained.',
    humor: 'Minimal; the interest is in the facts, not the teller.',
    tell: 'Reads like a well-made mini-doc narration.',
  },
  diary: {
    label: 'Diary',
    sound: 'Private, in-the-moment — written to no one, so it hides nothing.',
    sentenceRhythm: 'Fragmentary, present-tense drift; time-stamps and "I don\'t know why I\'m writing this".',
    vocabularyLean: 'Intimate, unedited, small ordinary details.',
    humor: 'Incidental, wry only to itself.',
    tell: 'Reads like a page not meant to be read.',
  },
  campfire: {
    label: 'Campfire',
    sound: 'A practised teller holding a circle — builds suspense, drops the voice, times the beat.',
    sentenceRhythm: 'Rolling build then sudden stops; direct "and then—".',
    vocabularyLean: 'Vivid, a touch performed; leans on the pause.',
    humor: 'Playful in the build, gone by the payoff.',
    tell: 'Reads like the story that goes quiet right before the end.',
  },
}

// Cast to a non-empty tuple so `z.enum(VOICE_VALUES)` type-checks.
export const VOICE_VALUES = Object.keys(STORY_VOICES) as unknown as [string, ...string[]]

// Resolve a voice. null = use the genre writer-identity's default sound (no override).
export function resolveVoice(voice: string | null | undefined): VoiceSpec | null {
  if (!voice) return null
  return STORY_VOICES[voice] ?? null
}

// Writer-facing. Overrides the identity's default sound when set. Judgment-framed.
export function renderVoice(spec: VoiceSpec): string {
  return `NARRATOR VOICE — how this narrator SOUNDS on the page (this overrides your default register; the story still outranks it):
${spec.sound}
Rhythm: ${spec.sentenceRhythm}
Words: ${spec.vocabularyLean}
Humor: ${spec.humor}
It should read like: ${spec.tell}`
}
