// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).

export const SCENES_V1_VERSION = 'scenes.v1'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic
  // beats, rather than a fixed clock-derived number.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

WORLD BIBLE: ${v.worldBibleJson}
Visual canon: use canonical names for recurring places/objects so they render consistently.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so the climax lands as its own shot.`
    : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension (the hook, each escalation or turn, the peak, the resolution), NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number within that range. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.${peakBlock}

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration that this scene covers (copy-paste exactly, no truncation with "…")
- imagePrompt: CONTENT ONLY. START with the single most important thing the viewer must see — the subject or action that carries this beat (e.g. "the dark shape of two feet under the door", NOT a generic empty room). THEN add, in order: shot size + camera angle (wide establishing / intimate close detail, low or high); one foreground element for depth; the light source with its direction (e.g. a single candle from the left, cold moonlight through slats); a touch of atmosphere (fog, haze, deep shadow, negative space). One concrete sentence, ~20-35 words — do NOT bury the key element under description. World-bible nouns, not synonyms. NO style or medium words ("cinematic", "photo", "painting", "woodcut", colour-grade terms) — the system owns the look.
- motionPrompt: one slow camera/element movement, present tense ("camera pushes in slowly; curtain shifts once"). No cuts, no fast moves.
- tier: "video" for the 2–3 highest-impact beats (always the hook and the climax), "still" otherwise.
- mood: 2–3 words for ambient/grade hints.

CHARACTERS: each scene image is generated independently, so a recurring person/figure/creature only reads as the SAME individual if you describe it the same way every time. The FIRST time one appears, fix its canonical look — build, age, hair, clothing, and ONE distinguishing detail — then repeat that SAME description (near-verbatim) in every later scene it appears in. Keep it within the imply rule: lock silhouette, posture, hair, and wardrobe; faces stay obscured.

GUARDS: imply, never depict — silhouettes, doorways, reflections, things at the edge of frame. No gore, no faces of fear in close-up, no children in threatening contexts.

OUTPUT (JSON only):
{
  "scenes": [
    {
      "idx": 1,
      "narrationText": "complete verbatim substring",
      "imagePrompt": "",
      "motionPrompt": "",
      "tier": "still",
      "mood": ["tense", "quiet"]
    }
  ]
}`

  return { system, userMessage }
}
