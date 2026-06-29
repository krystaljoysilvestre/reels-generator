// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).
//
// Structure: a niche-NEUTRAL CORE (always sent) + ONE genre MODULE, so a reel only pays for its own
// genre's rules (a cooking reel never reads the horror darkness rules; a horror reel never reads "show
// the subject bright and clear"). The module is chosen from the channel's `genreCategory` — an
// LLM-derived bucket stored at channel creation (channel.v1). `classifyGenre` is the keyword fallback,
// used when a channel predates the column (or the value is unrecognized).

export const SCENES_V1_VERSION = 'scenes.v1'

export type GenreModule = 'horror' | 'informational' | 'lifestyle' | 'general'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  nicheDescription: string // the channel's genre/niche — drives the visual language
  genreCategory?: string // LLM-derived bucket stored on the channel; falls back to classifyGenre(niche)
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic beats.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
}

// Coarse genre bucket from the niche text — picks which module loads. Deterministic + free.
// Used as the fallback when a channel has no stored genreCategory (pre-dates the column).
export function classifyGenre(niche: string): GenreModule {
  const n = niche.toLowerCase()
  if (/horror|thriller|paranormal|aswang|multo|kulam|true[- ]?crime|creepy|scary|ghost|haunt|spooky|nightmare|eerie/.test(n)) return 'horror'
  if (/news|explain|educat|tutorial|histor|science|finance|document|how[- ]?to|fact|tech|business|review/.test(n)) return 'informational'
  if (/cook|food|recipe|travel|vlog|lifestyle|fashion|beauty|fitness|product|diy|craft|makeup/.test(n)) return 'lifestyle'
  return 'general'
}

// Coerce a stored/derived string to a known module, defaulting unknown values to 'general'.
export function asGenreModule(v: string | null | undefined): GenreModule | null {
  return v === 'horror' || v === 'informational' || v === 'lifestyle' || v === 'general' ? v : null
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
Visual canon: keep each recurring place/object visually consistent across scenes (same defining traits every time). The image prompt is read by an image model, so describe these in concrete, depictable terms — if a canon name is in another language, render its plain visual description, not the word alone (e.g. "gasera" → "a small kerosene gas lamp", "lumang bahay na kahoy" → "an old wooden house"). The narration keeps the canon name; the image prompt shows the thing.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so it lands as its own shot.`
    : ''

  // Prefer the channel's LLM-derived category; fall back to keyword classification for older channels.
  const module = asGenreModule(v.genreCategory) ?? classifyGenre(v.nicheDescription)
  const genreModule = GENRE_MODULES[module]
  const moduleBlock = genreModule ? `\n\n${genreModule}` : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension, NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.${peakBlock}

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration this scene covers (copy-paste exactly, no "…").
- imagePrompt: CONTENT ONLY, leading with the key subject (see VISUAL PRIORITY below). THEN, in order: shot size + camera angle; one foreground element for depth; the light source + its direction; a touch of atmosphere. ~30-50 words — enough to pin every element concretely without padding. World-bible nouns, not synonyms. Describe only what's in the frame — no style, medium, or colour-grade words (the system owns the look).
- cameraMove: the ONE camera move that best fits this beat — choose from: drift (slow, subtle), push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, handheld (loose, immediate), locked (almost still). Match it to the beat: push_in for emphasis, pull_out for a reveal, locked for observation/stillness, drift for atmosphere, handheld for immediacy, pan/tilt to follow or discover.
- tier: "video" for the 2–3 most visually DYNAMIC beats — always include the opening; "still" otherwise. At most 3 video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene is (e.g. "rented bedroom"). Same label for the same place; a new label only when the place actually changes.

VISUAL PRIORITY (every genre): each imagePrompt MUST begin with the most important VISIBLE thing — the specific subject, person, or action the line is about — never the setting it merely sits in. The setting is context, not the shot. Lead with the collapsed bridge, not the city skyline; the crispy pork belly on the board, not the kitchen; the couple boarding the banca, not the beach; the shadow under the closed door, not the empty hallway. If the line has no concrete subject, lead with the single detail that carries its meaning.

CONTINUITY (people, places, objects): each image is generated independently, so a recurring element reads as the SAME one ONLY if described the same way every time. First appearance → fix its defining traits; reuse them near-verbatim on every return; never redesign a recurring element.
- People/figures: build, age, hair, wardrobe, ONE distinguishing detail (+ face if this genre shows faces; if it only implies people, consistent silhouettes with faces in shadow).
- Places: layout, key furniture, materials, colours, wear — the door/window/bed in one scene are the SAME ones when you return.
- Objects: concretely — count, state, condition (a vague "door" renders open or as a double panel; a "window" glows). Pin it: "a single closed wooden door flush in the wall". Match the state the story implies (a shadow under the door ⇒ it's shut).

LIGHTING & TIME: match the narration's time of day (incl. Tagalog cues) by naming the ACTUAL light sources present in THIS place — not a label, and not a default. Night / gabi / madaling-araw / 3 AM → light only by what genuinely exists there: a lamp or candle in a rural bedroom, but stall lights and neon in a night market, streetlights and signage on a city road, a screen, a fire. Do NOT assume night means a dark room — a brightly lit night scene is correct when the place has light. Day / umaga / tanghali = daylight; dusk/dawn = low ambient. (How DARK a night gets, and whether windows go black, is a genre decision — see the genre module if one applies.)

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees. If something is only HEARD (a voice, a knock) or FELT and never said to be SEEN, do NOT render its source — render the visible reaction and the space around it, not an invented source. Only show a presence/subject when the narration says it was seen.

PERSPECTIVE: detect the narration's voice and apply ONE perspective to the whole reel. FIRST-PERSON ("ako", "ko", "nakita ko", "I", "my") → POV: the camera IS the narrator's eyes; every shot is what THEY see (never the narrator as a separate full figure; their hands/feet/shoulder may edge the frame). THIRD-PERSON → observer framing: show the character(s).

PROGRESSION & VARIETY: the reel is a sequence, not similar stills. Each scene must ADVANCE the reel with new visual information — never restate the previous shot as the same moment from a slightly different angle unless the narration genuinely lingers there. Don't repeat the same shot size / distance / focal point on consecutive scenes; vary framing (wide, medium, close, low/high). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut to an unrelated environment shot.

SAFETY (all genres): no gore, no graphic violence, no nudity/sexualization, no minors in harmful or sexual contexts.${moduleBlock}

OUTPUT (JSON only):
{
  "scenes": [
    { "idx": 1, "narrationText": "complete verbatim substring", "imagePrompt": "", "cameraMove": "push_in", "tier": "still", "mood": ["tense", "quiet"], "location": "rented bedroom" }
  ]
}`

  return { system, userMessage }
}
