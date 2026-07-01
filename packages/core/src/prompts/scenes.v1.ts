// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).
//
// Structure: a niche-NEUTRAL CORE (always sent) + ONE genre MODULE, so a reel only pays for its own
// genre's rules (a cooking reel never reads the horror darkness rules; a horror reel never reads "show
// the subject bright and clear"). The module is chosen from the channel's `genreCategory` — an
// LLM-derived bucket stored at channel creation (channel.v1). `classifyGenre` is the keyword fallback,
// used when a channel predates the column (or the value is unrecognized).

export const SCENES_V1_VERSION = 'scenes.v1.15'

export type GenreModule = 'horror' | 'informational' | 'lifestyle' | 'general'

export interface ScenesPromptVars {
  // The reel's Story Bible entities (id, kind, description) as JSON. The breakdown REFERENCES these by id;
  // the image assembler splices their frozen descriptions (see specs/story-bible.md). '[]' = no bible
  // (fail-soft) → the director describes everything inline, as it did before this stage existed.
  bibleEntitiesJson: string
  narratorPerspective?: 'first_person' | 'third_person' | undefined // authoritative (from the bible); undefined = detect from narration
  directorNotes?: string[] // story-wide visual constraints from the bible (genre-default rules NOT restated here)
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
  horror: `GENRE — HORROR / THRILLER / PARANORMAL: build DREAD, and let it ESCALATE — early/mundane beats stay mostly NORMAL with only a faint wrongness (don't drench a calm setup shot in full horror; save the darkness for when the story turns), so the scare has contrast to land against.
THE REVEAL — SHOW LESS, NOT MORE. The threat is the story's supernatural presence (infer it: when the narration presents a figure/presence that is IMPOSSIBLE or UNEXPLAINED — someone who can't be there, a second figure in a reflection, a voice with no source — that IS the threat, even if the narration never says "ghost"). But a fully-rendered, clearly-lit monster face is NOT scary — image models can't make a face truly frightening, so a clear face reads as costume. A DARK LOOMING SILHOUETTE — bold form, no detail. The threat must be a BOLD, unmistakable, LOOMING presence — clearly there and clearly wrong, NOT a faint sliver (too subtle reads as nothing). Render it as a tall DARK figure: mostly unlit, a black shape against the dark, its outline unmistakable and wrong — too tall, too still, shoulders at a slightly off angle, long hair a dark mass. But it must NOT be pure shadow (a featureless black blob reads as nothing) — let exactly ONE wrong detail catch the weak light so there's a readable scare: most powerfully a pale, unnaturally wide, stretched GRIN glowing faintly where the face should be (or a single glint of an eye). That one detail is clearly visible; everything else — the eyes, the body — stays lost in shadow. NEVER a full pale lit body or a clear whole face (that reads as costume AND trips the image model's safety filter). So: dark looming FORM + ONE lit wrong detail (the grin) + the rest swallowed in dark. This renders cleanly, stays on-look with the reel, and is scariest — the seen detail plus the unseen rest. Still avoid literal gore. NEVER telling-words ("ominous", "eerie") — describe the concrete composition (the dark form, where the one weak light falls, the shadow swallowing the rest). FRAME IT TIGHT — the looming silhouette fills the frame, the narrator at most a sliver of foreground caught in the weak light.
DARKNESS: night beats are shadow-DOMINATED — ceiling, far corners and deep background fall to black, NOT lit like an evening room. But the shot's KEY SUBJECT must stay clearly READABLE: the ONE light source (a weak lamp, a candle, a phone screen) actually lands on the subject and the nearest surfaces so the focal action reads at a glance, with darkness closing in AROUND it — a pool of light eaten by shadow, never a frame that's black where the subject is. Deep rural night has NO usable moonlight, so every window/opening is a near-BLACK rectangle, nothing visible outside (a glowing 3 AM window is the #1 mistake).`,
  informational: `GENRE — INFORMATIONAL / NEWS / EDUCATIONAL: clarity first. The key subject is sharp and prominent (centred or on a third), legible at a glance; neutral, even lighting; clean, uncluttered framing. Show the actual thing being explained — the object, place, person, or data — not mood for its own sake.`,
  lifestyle: `GENRE — LIFESTYLE / FOOD / TRAVEL: bright, inviting, aspirational. Natural or warm light; the subject hero-lit, fresh and appealing (appetizing food, scenic place); vibrant but not garish; clean negative space.`,
  general: ``,
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

CHANNEL GENRE / NICHE: ${v.nicheDescription}
Compose every shot in the visual language of THIS genre — show what it shows, imply what it implies. Do NOT import conventions from other genres. Match the genre.

STORY BIBLE — the recurring people, places, and objects in THIS reel, each with a fixed id and a canonical look:
${v.bibleEntitiesJson}
The system AUTOMATICALLY splices each entity's canonical description into the image — so do NOT re-describe a bible entity in imagePrompt. Instead REFERENCE it by its exact id (in primaryEntity / supportingEntities) and write only what it is DOING. Reuse the SAME id every time the same thing reappears. If a subject is NOT in the bible, describe it inline in imagePrompt (fix its traits on first appearance, reuse them on return). If a bible entry conflicts with the narration, the narration wins.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so it lands as its own shot.`
    : ''

  // Prefer the channel's LLM-derived category; fall back to keyword classification for older channels.
  const module = asGenreModule(v.genreCategory) ?? classifyGenre(v.nicheDescription)
  const genreModule = GENRE_MODULES[module]
  const moduleBlock = genreModule ? `\n\n${genreModule}` : ''

  // Perspective is authoritative from the Story Bible when known; otherwise the director detects it.
  const POV_RULE = 'FIRST-PERSON → POV: the camera IS the narrator\'s eyes; every shot is what THEY see (never the narrator as a separate full figure; their hands/feet/shoulder may edge the frame). Write POV as a CONCRETE COMPOSITION, never the bare word "POV" — image models render a described frame far better than the abstract instruction. Anchor the near foreground with something that belongs to the narrator (a hand, a forearm, the back of their head/shoulders) and place the subject in the space beyond it. A REFLECTION beat (a mirror, a window, a dark screen) is the hard case: frame the back of the narrator\'s head and shoulders in the near foreground with the subject seen as a REFLECTION beyond them — never a straight-on portrait facing the camera. CRITICAL: whenever the narrator\'s OWN reflection, hands, or body are visible in the shot, REFERENCE the narrator entity (add their id to supportingEntities) so their reference plate locks their appearance — otherwise they render as a random, wrong figure. Keep them a reflection/back/partial, never a front-facing figure.'
  const OBSERVER_RULE = 'THIRD-PERSON → observer framing: show the character(s).'
  const perspectiveRule =
    v.narratorPerspective === 'first_person'
      ? `this reel is FIRST-PERSON. ${POV_RULE}`
      : v.narratorPerspective === 'third_person'
        ? `this reel is THIRD-PERSON. ${OBSERVER_RULE}`
        : `detect the narration's voice and apply ONE perspective to the whole reel. FIRST-PERSON ("ako", "ko", "nakita ko", "I", "my") → ${POV_RULE} ${OBSERVER_RULE}`

  // Story-wide visual constraints from the bible (deviations from the genre default only).
  const notesBlock = v.directorNotes?.length
    ? `\n\nSTORY-WIDE DIRECTION (apply to every relevant shot):\n- ${v.directorNotes.join('\n- ')}`
    : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension, NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.${peakBlock}

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration this scene covers (copy-paste exactly, no "…").
- primaryEntity: the bible id of the ONE thing this shot leads with (see VISUAL PRIORITY). Use null if the subject is NOT a bible entity (e.g. a shadow, the narrator's own hands).
- supportingEntities: the bible ids of the other recurring bible things visible in this shot. Include the scene's LOCATION entity here — but ONLY the place the scene is physically IN, NOT a place the character is merely HEADING TOWARD. A "walking toward a room" beat is set in the space they pass through (a hallway, a path, a yard), not inside that room — don't tag it with the destination (that drops them inside it); tag the place actually on screen. Also include the NARRATOR entity whenever their own reflection or body is visible (see PERSPECTIVE), so their appearance is locked. Use exact ids; never invent one.
- imagePrompt: a VIVID, SPECIFIC description of this exact shot — aim for 45–75 words, not a terse tag list. Cover concretely: WHO is in frame and the precise action they are caught MID-doing (their posture, what their hands are doing, their expression, and where their gaze goes — at the object, at each other, into the dark — NOT into the camera); the shot size + camera angle; one foreground element for depth; the ACTIVE light source + its direction; the texture of the place. Show people ABSORBED in the moment — candid, mid-motion, never posing or staring into the lens (a person facing the camera doing nothing is the #1 failure). Refer to bible entities by a natural label only ("the mirror", "the friend") — the system splices their look; describe NON-bible subjects inline. No style, medium, or colour-grade words (the system owns the look).
- sceneIntent: a short phrase for what the audience should NOTICE first in this shot (e.g. "the reflection before the woman", "the shadow under the door").
- cameraMove: the ONE camera move that best fits this beat — choose from: drift (slow, subtle), push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, handheld (loose, immediate), locked (almost still). Match it to the beat: push_in for emphasis, pull_out for a reveal, locked for observation/stillness, drift for atmosphere, handheld for immediacy, pan/tilt to follow or discover.
- tier: "video" for the 2–3 most visually DYNAMIC beats — always include the opening; "still" otherwise. At most 3 video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene is (e.g. "rented bedroom"). Same label for the same place; a new label only when the place actually changes.

VISUAL PRIORITY (every genre): each imagePrompt MUST begin with the most important VISIBLE thing — the specific subject, person, or action the line is about — never the setting it merely sits in. The setting is context, not the shot. Lead with the collapsed bridge, not the city skyline; the crispy pork belly on the board, not the kitchen; the couple boarding the banca, not the beach; the shadow under the closed door, not the empty hallway. If the line has no concrete subject, lead with the single detail that carries its meaning.

CONTINUITY: recurring people, places, and objects in the STORY BIBLE are already pinned — reference them by id (primaryEntity / supportingEntities) and NEVER redescribe them; the system splices their canonical look identically every time. For anything NOT in the bible, each image is generated independently, so it reads as the SAME one ONLY if you describe it the same way every time: fix its defining traits on first appearance and reuse them near-verbatim on every return; never redesign it.

LIGHTING & TIME: match the narration's time of day (incl. Tagalog cues) by naming the physical light source(s) present or implied in THIS place — not a label, and not a default. Night / gabi / madaling-araw / 3 AM → light only by what genuinely exists there: a lamp or candle in a rural bedroom, but stall lights and neon in a night market, streetlights and signage on a city road, a screen, a fire. Do NOT assume night means a dark room — a brightly lit night scene is correct when the place has light. Day / umaga / tanghali = daylight; dusk/dawn = low ambient. (How DARK a night gets, and whether windows go black, is a genre decision — see the genre module if one applies.)

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees. If something is only HEARD (a voice, a knock) or FELT and never said to be SEEN, do NOT render its source — render the visible reaction and the space around it, not an invented source. Only depict people, objects, or events the narration explicitly says are visible.

DESCRIBE PRESENCE, NOT ABSENCE: each imagePrompt must state only what IS in the frame, never what is absent. The image model reads "no sink", "without a mirror" or "strictly no X" as a cue to DRAW that very thing — so to keep something OUT, describe what fills that space instead, leaving no room for the unwanted element (e.g. to keep a fixture out of a cramped interior: "the walls press in close on both sides", not "no sink"). Never write "no", "without" or "strictly no" in an imagePrompt.

CAST CONTROL: only the people the narration actually places in this scene appear in frame — NEVER invent background extras, passers-by, bystanders, or a crowd the story doesn't mention. Frame exactly who the beat names; if the narration says the place is empty or the narrator is alone, show the space deserted around them. Stating who is present (and that the rest is empty) stops the model populating the background with strangers.

PERSPECTIVE: ${perspectiveRule}

BE TRUE TO THE BEAT: depict what is literally happening in THIS line — including the subject's exact POSTURE and what any device/screen actually shows. If the action implies sitting, show them seated; if they are reading a message, the phone shows a text-message screen (not a camera viewfinder or home screen); match the real activity, not a generic stand-and-pose. If the narration says something is missing, lost, forgotten, or left behind, do NOT show it; if a character is going TO LOOK FOR an object, they don't have it yet (don't hand them the thing they're searching for). Keep each shot to ONE clear focal action — don't stack competing subjects or effects into a single frame, or it renders as a muddled, illegible image.

PROGRESSION & VARIETY: the reel is a sequence, not similar stills. Each scene must ADVANCE the reel with new visual information — never restate the previous shot as the same moment from a slightly different angle unless the narration genuinely lingers there. Don't repeat the same shot size / distance / focal point on consecutive scenes; vary framing (wide, medium, close, low/high). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut to an unrelated environment shot.

SAFETY (all genres): no gore, no graphic violence, no nudity/sexualization, no minors in harmful or sexual contexts.${moduleBlock}${notesBlock}

OUTPUT (JSON only):
{
  "scenes": [
    { "idx": 1, "narrationText": "complete verbatim substring", "primaryEntity": "cracked-mirror", "supportingEntities": ["the-tenant"], "imagePrompt": "the tenant steps toward the glass, medium shot from behind their shoulder, dust adrift, the bare bulb throwing weak light from above", "sceneIntent": "the reflection before the figure", "cameraMove": "push_in", "tier": "still", "mood": ["tense", "quiet"], "location": "rented bedroom" }
  ]
}`

  return { system, userMessage }
}
