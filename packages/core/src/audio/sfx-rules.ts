// SFX hygiene rules — keeps the sound design from fighting the narration.
//
// 1) NO SYNTHESIZED VOCALS FROM THE SFX LAYER. ElevenLabs SFX renders "creepy soft laughter" /
//    "startled gasp" / "whisper echoes" as uncanny HUMAN VOICES, which read as random strangers in the
//    room next to the narrator (owner feedback 2026-07-06: "random voices and laugh"). audioscript.v1.3
//    bans them at the prompt; this filter is the safety net for anything that slips through. A story's
//    intentional second voice goes through the operator/smart SPEECH cue path (one, deliberate), never SFX.
//
// 2) NO STACKED CUES ON THE SAME BEAT. The LLM SFX layer and the smart/operator cue layer place
//    independently, and exact-anchor dedupe misses same-moment-different-anchor collisions ("mahinang
//    tawa" vs "may narinig akong mahinang tawa" → two laughs at once). Time-proximity dedupe drops the
//    LLM cue near a protected (operator/smart) cue — the operator layer always wins.

const VOCAL_SFX = /\b(voice|voices|vocal|whisper|whispering|laugh|laughter|laughing|giggle|giggling|chuckle|gasp|gasping|breath|breathing|scream|screaming|shriek|moan|moaning|groan|groaning|sob|sobbing|crying|weep|wail|hum|humming|sing|singing|chant|chanting|speak|speaking|talk|talking|mutter|murmur)\b/i

// Does this SFX prompt describe a human/vocal sound? (Word-boundary match so "slam" ≠ "scream".)
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
