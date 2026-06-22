// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).
//
// Structure: a niche-NEUTRAL CORE (always sent) + ONE genre MODULE chosen from the channel's niche, so
// a reel only pays for its own genre's rules (a cooking reel never reads the horror darkness rules; a
// horror reel never reads "show the subject bright and clear"). Classification is keyword-based for now;
// the upgrade path is an LLM-derived category stored on the channel at creation.

export const SCENES_V1_VERSION = 'scenes.v1'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  nicheDescription: string // the channel's genre/niche — drives the visual language + which module loads
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic beats.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
}

type GenreModule = 'horror' | 'informational' | 'lifestyle' | 'general'

// Coarse genre bucket from the niche text — picks which module loads. Deterministic + free.
export function classifyGenre(niche: string): GenreModule {
  const n = niche.toLowerCase()
  if (/horror|thriller|paranormal|aswang|multo|kulam|true[- ]?crime|creepy|scary|ghost|haunt|spooky|nightmare|eerie/.test(n)) return 'horror'
  if (/news|explain|educat|tutorial|histor|science|finance|document|how[- ]?to|fact|tech|business|review/.test(n)) return 'informational'
  if (/cook|food|recipe|travel|vlog|lifestyle|fashion|beauty|fitness|product|diy|craft|makeup/.test(n)) return 'lifestyle'
  return 'general'
}

// One genre MODULE is appended to the core (only the matched one is sent).
const GENRE_MODULES: Record<GenreModule, string> = {
  horror: `GENRE — HORROR / THRILLER / PARANORMAL: build DREAD. Compose for unease — heavy negative space that feels occupied, something subtly WRONG at the edge of frame, the suggestion of a presence just out of view, oppressive shadow, an unsettling off-centre focal point. Imply, never depict: a silhouette / reflection / barely-visible shape is scarier than showing it outright.
DARKNESS: push night beats to near-PURE BLACK — most of the frame swallowed, the ONE small light source (a weak lamp, a candle) barely reaching the nearest surface and falling off to black within a foot; bed, walls, far corners lost in black, not lit like an evening room. Deep rural night has NO usable moonlight, so every window/opening is a solid BLACK rectangle, nothing visible outside (a glowing 3 AM window is the #1 mistake).`,
  informational: `GENRE — INFORMATIONAL / NEWS / EDUCATIONAL: clarity first. The key subject is sharp and prominent (centred or on a third), legible at a glance; neutral, even lighting; clean, uncluttered framing. Show the actual thing being explained — the object, place, person, or data — not mood for its own sake.`,
  lifestyle: `GENRE — LIFESTYLE / FOOD / TRAVEL: bright, inviting, aspirational. Natural or warm light; the subject hero-lit, fresh and appealing (appetizing food, scenic place); vibrant but not garish; clean negative space.`,
  general: ``,
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

CHANNEL GENRE / NICHE: ${v.nicheDescription}
Compose every shot in the visual language of THIS genre — show what it shows, imply what it implies. Do NOT import conventions from other genres. Match the genre.

WORLD BIBLE: ${v.worldBibleJson}
Visual canon: use canonical names for recurring places/objects so they render consistently.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so it lands as its own shot.`
    : ''

  const genreModule = GENRE_MODULES[classifyGenre(v.nicheDescription)]
  const moduleBlock = genreModule ? `\n\n${genreModule}` : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension, NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.${peakBlock}

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration this scene covers (copy-paste exactly, no "…").
- imagePrompt: CONTENT ONLY. START with the single most important thing the viewer must see — the exact subject, person, or action the line is about (concrete, NOT a generic empty room). THEN, in order: shot size + camera angle; one foreground element for depth; the light source + its direction; a touch of atmosphere. One concrete sentence ~20-35 words — don't bury the key element. World-bible nouns, not synonyms. NO style/medium words ("cinematic", "photo", "painting", colour-grade terms) — the system owns the look.
- motionPrompt: one slow camera/element movement, present tense ("camera pushes in slowly"). No cuts, no fast moves.
- tier: "video" for the 2–3 most visually DYNAMIC beats — always include the opening; "still" otherwise. At most 3 video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene is (e.g. "rented bedroom"). Same label for the same place; a new label only when the place actually changes.

CONTINUITY (people, places, objects): each image is generated independently, so a recurring element reads as the SAME one ONLY if described the same way every time. First appearance → fix its defining traits; reuse them near-verbatim on every return; never redesign a recurring element.
- People/figures: build, age, hair, wardrobe, ONE distinguishing detail (+ face if this genre shows faces; if it only implies people, consistent silhouettes with faces in shadow).
- Places: layout, key furniture, materials, colours, wear — the door/window/bed in one scene are the SAME ones when you return.
- Objects: concretely — count, state, condition (a vague "door" renders open or as a double panel; a "window" glows). Pin it: "a single closed wooden door flush in the wall". Match the state the story implies (a shadow under the door ⇒ it's shut).

LIGHTING & TIME: match the narration's time of day (incl. Tagalog cues) by describing the actual light, not just a label. Night / gabi / madaling-araw / 3 AM = dark: the room dark, lit only by the small source you name (lamp/candle/phone), windows dark with nothing visible outside — never a lit evening room. Day / umaga / tanghali = daylight. Dusk/dawn = low ambient.

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees. If something is only HEARD (a voice, a knock) or FELT (a presence) and never said to be SEEN, do NOT render its source — render the narrator sensing it and the charged, empty space around them. Only show a presence when the narration says it was seen.

PERSPECTIVE: detect the narration's voice and apply ONE perspective to the whole reel. FIRST-PERSON ("ako", "ko", "nakita ko", "I", "my") → POV: the camera IS the narrator's eyes; every shot is what THEY see (never the narrator as a separate full figure; their hands/feet/shoulder may edge the frame). THIRD-PERSON → observer framing: show the character(s).

PROGRESSION & VARIETY: the reel is a sequence, not similar stills. Don't repeat the same shot size / distance / focal point on consecutive scenes unless the narration lingers; vary framing (wide, medium, close, low/high). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut to an unrelated environment shot.

SAFETY (all genres): no gore, no graphic violence, no nudity/sexualization, no minors in harmful or sexual contexts.${moduleBlock}

OUTPUT (JSON only):
{
  "scenes": [
    { "idx": 1, "narrationText": "complete verbatim substring", "imagePrompt": "", "motionPrompt": "", "tier": "still", "mood": ["tense", "quiet"], "location": "rented bedroom" }
  ]
}`

  return { system, userMessage }
}
