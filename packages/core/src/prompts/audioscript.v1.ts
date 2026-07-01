// audioscript.v1 — audio script annotation template (docs/04 §3)

export const AUDIOSCRIPT_V1_VERSION = 'audioscript.v1.2'

export function buildAudioScriptPrompt(narration: string): { system: string; userMessage: string } {
  const system = `You are a sound designer for cinematic narrated reels.`

  const userMessage = `Given the narration below, output an audio design plan.
Anchor every cue to an EXACT substring of the narration (verbatim, unique within the text — extend the span until unique).

Narration:
"""${narration}"""

Design rules:
- 1 ambient bed for the whole reel, may evolve once (e.g. rain starts).
- 4–7 SFX one-shots. Place each ON its meaning-bearing word (the knock lands on the word for knock), and keep dread PRESENT across the reel — don't leave long stretches with no sound design.
- For each SFX set "impactAtEnd": a sound that BUILDS to its hit (a riser, swell, or crescendo) is true — its impact lands ON the anchor word; an instant one-shot (a knock, slam, footstep) is false — it fires right on the word.
- ALWAYS punctuate the PEAK/twist line with a strong impact cue — a riser swelling into a hit, a sudden low boom, or a sharp sting — so the climax lands hard. This is the most important SFX; anchor it to the same line you use for music "peakAnchor". A riser/swell here is "impactAtEnd": true; a single boom/sting is false.
- Mark 1 "silence_drop" if the story has a turn — a beat of cut sound right before that impact makes the hit land harder.
- Optional music: one low drone/swell toward the climax only. Set "peakAnchor" to the twist line.

OUTPUT (JSON only) — schema "audio_script.v1". Use these EXACT field names; null where unused:
{
  "ambient": { "packTags": ["province_night"], "evolution": null },
  "sfx": [
    { "anchor": "exact narration substring", "offsetMs": 0, "prompt": "sound to generate", "volumeDb": -8, "impactAtEnd": false }
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
