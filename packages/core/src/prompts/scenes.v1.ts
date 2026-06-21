// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).

export const SCENES_V1_VERSION = 'scenes.v1'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  nicheDescription: string // the channel's genre/niche — drives the visual language (nothing hardcoded to one genre)
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic
  // beats, rather than a fixed clock-derived number.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

CHANNEL GENRE / NICHE: ${v.nicheDescription}
Compose every shot in the visual language of THIS genre — show what it shows, imply what it implies. Do NOT import conventions from other genres (e.g. don't make a bright cooking/travel/explainer reel dark and ominous, and don't make a horror reel flat and cheerful). Match the genre.

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
- imagePrompt: CONTENT ONLY. START with the single most important thing the viewer must see — the exact subject, person, or action the line is about (be concrete, NOT a generic empty room). THEN add, in order: shot size + camera angle (wide establishing / intimate close detail, low or high); one foreground element for depth; the light source with its direction (e.g. a single candle from the left, cold moonlight through slats); a touch of atmosphere (fog, haze, deep shadow, negative space). One concrete sentence, ~20-35 words — do NOT bury the key element under description. World-bible nouns, not synonyms. NO style or medium words ("cinematic", "photo", "painting", "woodcut", colour-grade terms) — the system owns the look.
- motionPrompt: one slow camera/element movement, present tense ("camera pushes in slowly; curtain shifts once"). No cuts, no fast moves.
- tier: "video" for the 2–3 highest-impact beats (always the hook and the climax), "still" otherwise.
- mood: 2–3 words for ambient/grade hints.

CHARACTERS: each scene image is generated independently, so a recurring person, figure, or creature only reads as the SAME individual if you describe it the same way every time. The FIRST time one appears, fix its canonical look — build, age, hair, clothing, and ONE distinguishing detail — then repeat that SAME description (near-verbatim) in every later scene it appears in. Lock the details that read as identity: build, posture, hair, wardrobe (and face, if this genre shows faces). If the genre implies people rather than showing them, keep them as consistent silhouettes with faces in shadow.

LIGHTING & TIME: read the time of day from the narration (including Tagalog cues) and make it unmistakable in the image — a time LABEL alone won't render correctly, you must describe the actual light. Night / gabi / madaling-araw / "alas-[1-4]" / 3 AM = NEAR-TOTAL DARKNESS: most of the frame deep black, the ONLY light from the source you name (a lamp, candle, the moon, a phone), and every window or opening is a BLACK rectangle — no daylight, no glow, nothing visible outside. Dusk/dawn = low warm/cold ambient. Day / umaga / tanghali / hapon = natural daylight. Lead with the darkness for night beats; never let a 3 AM scene look like a lit evening room.

SAFETY (all genres): no gore, no graphic violence, no nudity or sexualization, no minors in harmful or sexual contexts. (This also keeps generations within the image model's content policy.)
GENRE TREATMENT: render tension the way THIS genre does. For atmospheric / horror / thriller beats, imply rather than depict — silhouettes, doorways, reflections, the edge of frame — instead of showing graphic detail. For non-threatening genres, just show the subject clearly and well-lit per the scene.

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
