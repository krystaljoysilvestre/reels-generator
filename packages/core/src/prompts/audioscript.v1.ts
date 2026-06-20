// audioscript.v1 — audio script annotation template (docs/04 §3)

export const AUDIOSCRIPT_V1_VERSION = 'audioscript.v1'

export function buildAudioScriptPrompt(narration: string): { system: string; userMessage: string } {
  const system = `You are a sound designer for cinematic narrated reels.`

  const userMessage = `Given the narration below, output an audio design plan.
Anchor every cue to an EXACT substring of the narration (verbatim, unique within the text — extend the span until unique).

Narration:
"""${narration}"""

Design rules:
- 1 ambient bed for the whole reel, may evolve once (e.g. rain starts).
- 3–7 SFX one-shots max. Less is scarier. Place them ON meaning-bearing words (the knock lands on the word for knock).
- Mark 1 "silence_drop" if the story has a turn — cutting all sound is the strongest effect available.
- Optional music: one low drone/swell toward the climax only. Set "peakAnchor" to the twist line.

OUTPUT (JSON only) — schema "audio_script.v1". Use these EXACT field names; null where unused:
{
  "ambient": { "packTags": ["province_night"], "evolution": null },
  "sfx": [
    { "anchor": "exact narration substring", "offsetMs": 0, "prompt": "sound to generate", "volumeDb": -8 }
  ],
  "silenceDrop": null,
  "music": null
}

When a field is populated instead of null, it MUST use exactly these keys (no others):
- ambient.evolution: { "anchor": "exact substring", "change": "how the bed shifts, e.g. rain starts" }
- silenceDrop: { "anchor": "exact substring", "durationMs": 800 }
- music: { "type": "low_drone" | "drone_swell" | "riser_sting", "startAnchor": "substring or empty string", "peakAnchor": "the twist line or empty string", "moodTags": ["dread"] }`

  return { system, userMessage }
}
