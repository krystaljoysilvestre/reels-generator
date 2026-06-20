// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).

export const SCENES_V1_VERSION = 'scenes.v1'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  narration: string
  targetScenes: number // ~1 scene per ~12s of reel — scales with the channel's reel length
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

WORLD BIBLE: ${v.worldBibleJson}
Visual canon: use canonical names for recurring places/objects so they render consistently.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const userMessage = `Split the narration into about ${v.targetScenes} scenes (no fewer than 3, no more than 16) — scale to the narration's length. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration that this scene covers (copy-paste exactly, no truncation with "…")
- imagePrompt: CONTENT ONLY — subject, framing, light source, time of day. 9:16 composition. NO style words. Concrete nouns from the world bible, not synonyms.
- motionPrompt: one slow camera/element movement, present tense ("camera pushes in slowly; curtain shifts once"). No cuts, no fast moves.
- tier: "video" for the 2–3 highest-impact beats (always the hook and the climax), "still" otherwise.
- mood: 2–3 words for ambient/grade hints.

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
      "mood": ["dread", "quiet"]
    }
  ]
}`

  return { system, userMessage }
}
