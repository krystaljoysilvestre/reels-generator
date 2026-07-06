// SFX hygiene rules — keeps the sound design from fighting the narration.
//
// 1) NO OVERT / VERBAL VOICES FROM THE SFX LAYER. ElevenLabs SFX renders "creepy laughter" / "a voice
//    says…" / "startled gasp" as an uncanny PERSON — a stranger in the room next to the narrator (owner
//    feedback 2026-07-06). Those belong in the deliberate SPEECH path, never SFX. But quiet NON-VERBAL
//    TEXTURES — breath, a faint whisper hush, a low hum — are legitimate horror atmosphere (owner
//    2026-07-06: fine "as long as they fit, not forced"), so they are ALLOWED; the designer places them
//    sparingly and low. This filter only blocks the overt/verbal end (laughter, screams, spoken words).
//
// 2) NO STACKED CUES ON THE SAME BEAT. The LLM SFX layer and the smart/operator cue layer place
//    independently, and exact-anchor dedupe misses same-moment-different-anchor collisions ("mahinang
//    tawa" vs "may narinig akong mahinang tawa" → two laughs at once). Time-proximity dedupe drops the
//    LLM cue near a protected (operator/smart) cue — the operator layer always wins.

// Overt/verbal human sounds only. Textures (breath, breathing, whisper, hum) are intentionally NOT here —
// they're allowed as atmosphere. A person performing (laughing, screaming, speaking words) is not.
// (No "word(s)" here — it false-matches wordless descriptions like "whisper, no words"; overt speech is
// already caught by voice/speak/spoken/says/talk.)
const VOCAL_SFX = /\b(voice|voices|vocal|laugh|laughter|laughing|giggle|giggling|chuckle|chuckling|gasp|gasping|scream|screaming|shriek|shrieking|moan|moaning|groan|groaning|sob|sobbing|crying|weeping|wail|wailing|sing|singing|chant|chanting|speak|speaking|spoken|talk|talking|mutter|muttering|murmur|murmuring|says)\b/i

// Does this SFX prompt describe an OVERT/VERBAL human sound? (Word-boundary match so "slam" ≠ "scream".)
// Quiet non-verbal textures (breath, whisper, hum) pass — they're valid atmosphere, not a stray person.
export function isVocalSfxPrompt(prompt: string): boolean {
  return VOCAL_SFX.test(prompt)
}

// Drop events that land within `windowMs` of any protected event's time. Used to keep LLM SFX from
// stacking on a beat the operator/smart layer already owns.
export function dropEventsNear<T extends { atMs: number }>(
  events: T[],
  protectedAtMs: number[],
  windowMs = 1500,
): T[] {
  if (protectedAtMs.length === 0) return events
  return events.filter((e) => protectedAtMs.every((p) => Math.abs(e.atMs - p) > windowMs))
}
