// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).
//
// Structure: a niche-NEUTRAL CORE (always sent) + ONE genre MODULE, so a reel only pays for its own
// genre's rules (a cooking reel never reads the horror darkness rules; a horror reel never reads "show
// the subject bright and clear"). The module is chosen from the channel's `genreCategory` — an
// LLM-derived bucket stored at channel creation (channel.v1). `classifyGenre` is the keyword fallback,
// used when a channel predates the column (or the value is unrecognized).

export const SCENES_V1_VERSION = 'scenes.v1.38'

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
  maxVideoTiers: number // motion budget — max scenes the director may mark tier "video" (see MOTION_BUDGET)
  // The narrator's JOURNEY (world-state ground truth from analyze_story) — where the narrator is + who's
  // present per leg. When provided, the director MUST obey it: tag only the leg's location, cast only who's
  // present. Structural shape (kept decoupled from the bible types).
  journey?: {
    span: string
    locationLabel: string
    locationEntityId: string | null
    present: string[]
    visible?: string[] | undefined
    occupancyState?: string | undefined
    isReflection?: boolean | undefined
  }[]
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
THE REVEAL — SHOW THE CONTRADICTION, NOT THE CREATURE. The threat is the story's supernatural presence (infer it: when the narration presents a figure/presence that is IMPOSSIBLE or UNEXPLAINED — someone who can't be there, a second figure in a reflection, a voice with no source — that IS the threat, even if the narration never says "ghost"). The payoff is ONE believable photograph whose horror is the viewer discovering exactly ONE impossible visual CONTRADICTION — two truths that cannot coexist, both in the frame, in a scene that otherwise reads completely real. THE CONTRADICTION IS BINARY: name Reality A and Reality B and show them TOGETHER ("the narrator stands alone at the sinks" + "the mirror holds two faces"; "every stall hangs open and empty" + "feet are visible under one door"; "the bed is unoccupied" + "the blanket is compressed by weight"). The image model doesn't need to understand horror — it only needs to draw A and B in one photograph; obey the STORY-WIDE DIRECTION's Contradiction when one is given. IN-FRAME VERIFIABILITY (the load-bearing rule): when the contradiction is spatial, compose so Reality A and Reality B are SIMULTANEOUSLY verifiable in the same frame with no inference — the empty room AND the occupied mirror both readable; the floor outside the stall shares the frame with the feet; the blocked hallway geometry shares the frame with the figure. When the contradiction is temporal or cumulative (footprints that end at the narrator's own feet), compose so the contradiction itself is directly OBSERVABLE in this one frame — never something reconstructed from earlier shots. A contradiction split across shots, or implied off-frame, loses the scare. THE CONTRADICTION IS LOAD-BEARING, NEVER THE FACE: image models render facial wrongness pretty (a "too-wide grin" comes out a pleasant smile) — compose so the scare survives even if the face renders normal: what is WHERE it can't be, what's MISSING that must exist, what DISAGREES between reflection and room, what hasn't MOVED. LIGHT IT AS DISCOVERY (chiaroscuro): deep black swallows most of the figure and frame; ONE hard, cold light source (whatever this place actually has — a phone screen, a dying fluorescent, a doorway's spill) catches the threat's committed anomaly — the light DISCOVERS the anomaly, it does not illuminate the creature; the lit sliver occupies a SMALL fraction of the frame and wins the eye by CONTRAST, never by lighting more of the figure. Steer between the two failures: (1) TOO-LIT — most of the figure visible reads as a living person in costume posing for a portrait; keep most of it in true black; (2) TOO-DARK — if the contradiction/anomaly isn't genuinely readable, the frame is just an empty dark room. ESCALATION — expectation established → expectation violated → violation UNDENIABLE, and never more: escalation means the violation gets harder to ignore, NEVER more creature (a full monster portrait is the classic failure); pre-reveal beats render the narration's OWN wrongness cues as environmental evidence (the glimmer, the gap under the door — never a figure; SHOW ONLY WHAT IS SEEN governs). Keep it DRY — never bloody or gory (gore is cheap AND trips the safety filter); NEVER telling-words ("ominous", "eerie") — describe where the light lands, what it finds, what the dark swallows. FRAME IT TIGHT: push close so the contradiction dominates; NEVER a wide shot of a small, distant figure on a payoff; when the contradiction's geometry needs room (both realities in frame), you judge the tightest frame that keeps them verifiable in ONE believable photograph. LEAD WITH IT: the imagePrompt opens on the contradiction, not the room and not the narrator (they're context at the edge). MOTION — a VIDEO payoff: the THREAT moves, ONE slow deliberate motion in shadow terms (the glint shifting as the head slowly tilts, the grin-edge widening into the light) in subjectMotion, paired with cameraMove:push_in; NEVER an empty subjectMotion on a scare — a payoff that holds perfectly still wastes the reel's most important shot; the slowness is what unnerves. (Write the threat as a figure/form/shape, never a named person — see FILTER-SAFE PHRASING in the core rules.) A reveal seen in a mirror / window / dark glass is still just a photograph — compose it however THIS moment reads scariest; the only requirement is that it looks like ONE real photograph of a real place, never a composite.
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
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so it lands as its own shot. FRAME THE PAYOFF TIGHT: this shot pushes to an EXTREME CLOSE-UP on the one thing the line pays off (the scare, the reveal, the object the whole reel was building to) — it fills almost the entire frame, any other person at most a partial sliver at the edge. A payoff seen wide reads as small and undramatic; the closer the frame, the harder it lands. (cameraMove: push_in.) If the payoff's real geometry (a reflection, a doorway) needs more room, you judge the tightest frame that still reads as one believable photograph.`
    : ''

  // Prefer the channel's LLM-derived category; fall back to keyword classification for older channels.
  const module = asGenreModule(v.genreCategory) ?? classifyGenre(v.nicheDescription)
  const genreModule = GENRE_MODULES[module]
  const moduleBlock = genreModule ? `\n\n${genreModule}` : ''

  // Perspective is authoritative from the Story Bible when known; otherwise the director detects it.
  const POV_RULE = 'FIRST-PERSON → POV: the camera IS the narrator\'s eyes; every shot is what THEY see (never the narrator as a separate full figure; their hands/feet/shoulder may edge the frame). Write POV as a CONCRETE COMPOSITION, never the bare word "POV" — image models render a described frame far better than the abstract instruction. Anchor the near foreground with something that belongs to the narrator (a hand, a forearm, the back of their head/shoulders) and place the subject in the space beyond it. A REFLECTION beat (a mirror, a window, dark glass) is the ONLY time the narrator\'s own face is on screen — YOU choose how to compose the reflection shot for this moment; just keep the narrator a reflection/back/partial, never a front-facing figure staring into the lens. The system locks the narrator\'s appearance on reflection beats automatically, so you never need to tag them — just write the shot. QUIET BEATS ARE STILL POV: when little happens (the narrator waiting, uneasy, thinking, "standing" somewhere), do NOT fall back to describing HER as a standing/facing figure ("the narrator stands facing forward") — that is the #1 POV failure and, since her look is only locked in reflections, it renders a DIFFERENT person each shot. Instead frame what she SEES (the empty space, the object of her unease, a telling detail) or her hands / the back of her head in the near foreground. The narrator is a full FIGURE only in a reflection.'
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

  // The journey is GROUND TRUTH the director must obey: which place each span is in, and who is present.
  // It fixes "characters already in the CR" and invented cast by removing the guess about where/who.
  const journeyBlock = v.journey?.length
    ? `\n\nJOURNEY — GROUND TRUTH (obey EXACTLY; never place anyone anywhere this contradicts). Each leg is a span of the narration:\n${v.journey
        .map((lg, i) => {
          const loc = lg.locationEntityId
            ? `INSIDE location "${lg.locationEntityId}"`
            : `a TRANSIT space "${lg.locationLabel}" — NOT inside any bible location; tag NO location entity, describe the space inline`
          const vis = lg.visible && lg.visible.length ? lg.visible.join(', ') : lg.present.join(', ') || 'no one'
          const span = lg.span.length > 70 ? `${lg.span.slice(0, 70)}…` : lg.span
          const reflectionNote = lg.isReflection
            ? '; REVEAL — give this leg its OWN dedicated scene (never merge it into a neighbour): open on the threat/apparition, so primaryEntity MUST be that threat character.'
            : ''
          return `  ${i + 1}. "${span}" → ${loc}; present: [${lg.present.join(', ') || 'no one'}]; on-camera: [${vis}]${reflectionNote}`
        })
        .join('\n')}\nFor EACH scene: tag ONLY the location entity of the leg its narration falls in (or none, for a transit leg); include ONLY the characters that leg lists as present; NEVER add a person who isn't there. A leg marked REVEAL is the payoff — it is ALWAYS its own scene, opening on the threat (primaryEntity = the threat).`
    : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension, NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order. Keep every scene SHORT: no single scene should cover more than ~16 seconds of spoken narration (roughly 40 words) — one image or clip held longer than that goes visually DEAD on a phone (the #1 pacing failure). If a beat's narration is long, CUT IT into consecutive shots that each advance the visual (a new angle, tighter framing, the next action, a telling detail), never restating the same frame. On a longer story this means favouring the UPPER end of the ${v.minScenes}–${v.maxScenes} range so no shot drags — but NEVER produce more than ${v.maxScenes} scenes. ONE PHYSICAL MOVEMENT PER SCENE: each scene is a single beat of action in a single place — do NOT collapse an approach and the arrival into one shot. "Walking toward a room" and "inside that room" are SEPARATE scenes; give the journey (leaving one place, moving through another, entering the next) its own beats instead of jumping straight to the destination.${peakBlock}

Narration:
"""${v.narration}"""${journeyBlock}

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration this scene covers (copy-paste exactly, no "…").
- primaryEntity: the bible id of the ONE thing this shot leads with — it MUST be the same subject your imagePrompt OPENS on. Do not lead the imagePrompt with one thing and tag a different thing as primary. On a reveal/payoff you open on the threat/apparition, so THAT is the primaryEntity — even in a first-person reel where the narrator's reflection or body is also in frame, the narrator goes in supportingEntities, NOT primary. (Tagging the narrator primary on a reveal splices the narrator's face onto the shot and you get the narrator instead of the threat.) Use null if the subject you lead with is NOT a bible entity (a shadow, the narrator's own hands).
- supportingEntities: the bible ids of the other recurring bible things visible in this shot. Include the scene's LOCATION entity here — but ONLY the place the scene is physically IN, NOT a place the character is merely HEADING TOWARD. A "walking toward a room" beat is set in the space they pass through (a hallway, a path, a yard), not inside that room — don't tag it with the destination (that drops them inside it); tag the place actually on screen. Also include the NARRATOR entity whenever their own reflection or body is visible (see PERSPECTIVE), so their appearance is locked. Use exact ids; never invent one.
- imagePrompt: a VIVID, SPECIFIC description of this exact shot — aim for 45–75 words, not a terse tag list. Cover concretely: WHO is in frame and the precise action they are caught MID-doing (their posture, what their hands are doing, their expression, and where their gaze goes — at the object, at each other, into the dark — NOT into the camera); the shot size + camera angle; one foreground element for depth; the ACTIVE light source + its direction; the texture of the place. Show people ABSORBED in the moment — candid, mid-motion, never posing or staring into the lens (a person facing the camera doing nothing is the #1 failure). Refer to bible entities by a natural label only ("the mirror", "the friend") — the system splices their look; describe NON-bible subjects inline. No style, medium, or colour-grade words (the system owns the look).
- sceneIntent: a short phrase for what the audience should NOTICE first in this shot (e.g. "the reflection before the woman", "the shadow under the door").
- cameraMove: the ONE camera move that best fits this beat — choose from: drift (slow, subtle), push_in, pull_out, pan_left, pan_right, tilt_up, tilt_down, handheld (loose, immediate), locked (almost still). Match it to the beat: push_in for emphasis, pull_out for a reveal, locked for observation/stillness, drift for atmosphere, handheld for immediacy, pan/tilt to follow or discover.
- subjectMotion: OPTIONAL, and only meaningful when this beat is tier "video". What the SUBJECT itself DOES on screen — above all a horror scare/reveal, where the THREAT is what moves. Write ONE short, concrete, SLOW motion (e.g. "her blank dead stare slowly splits into an impossibly wide grin, too many teeth baring", "the tall figure looms slowly closer, swelling to fill the frame", "her head tilts slowly, unnaturally, to one side, eyes never blinking"). One motion only — never a list, never frantic; the slowness is the dread. Leave it "" for any beat where only the CAMERA moves (an establishing shot, an atmosphere beat, and every "still" beat). On a scare/reveal beat DO fill it, and pair it with cameraMove:push_in so the frame closes in as the threat moves.
- tier: "video" for up to ${v.maxVideoTiers} of the most visually DYNAMIC beats — always include the opening; "still" otherwise. At most ${v.maxVideoTiers} video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene is (e.g. "rented bedroom"). Same label for the same place; a new label only when the place actually changes.

ENGLISH ONLY (every genre): the imagePrompt, sceneIntent, location label, and mood MUST be written in ENGLISH — the image model does not understand Tagalog/Taglish and renders a non-English word as the WRONG thing or fails outright (e.g. "salamin ng banyo" rendered a lab bench, not a bathroom mirror). TRANSLATE every place, object, action, and time word to English: banyo/CR → "restroom", salamin → "mirror", eskwela → "school", gabi → "night", reloh → "clock". Reference a bible entity by an ENGLISH natural label ("the mirror", "the restroom", "the friend") — NEVER its raw id and NEVER a Tagalog phrase, even when the entity's id is Tagalog. Only the narration/voiceover stays in its original language; everything you write to describe the SHOT is English.

NEVER A CAMERA-FACING, STATIC POSE (every genre): a person standing still, front-on, looking into the lens and doing nothing is the SINGLE most common failure and reads as dead. EVERY shot with a person MUST specify (a) the concrete action they are caught MID-doing (reaching, turning, stepping, gripping, leaning, wiping) and (b) exactly where their gaze goes WITHIN the scene — at the object, at the other person, down, into the dark — anywhere but the camera. Prefer three-quarter, profile, over-the-shoulder, or from-behind angles over a flat frontal one. If the beat is genuinely a person alone doing little, give them a small real action and an off-camera gaze; a POV/first-person reel avoids this by construction (the camera is their eyes — never frame the narrator front-on).

VISUAL PRIORITY (every genre): each imagePrompt MUST begin with the most important VISIBLE thing — the specific subject, person, or action the line is about — never the setting it merely sits in. The setting is context, not the shot. Lead with the collapsed bridge, not the city skyline; the crispy pork belly on the board, not the kitchen; the couple boarding the banca, not the beach; the shadow under the closed door, not the empty hallway. If the line has no concrete subject, lead with the single detail that carries its meaning.

CONTINUITY: recurring people, places, and objects in the STORY BIBLE are already pinned — reference them by id (primaryEntity / supportingEntities) and NEVER redescribe them; the system splices their canonical look identically every time. For anything NOT in the bible, each image is generated independently, so it reads as the SAME one ONLY if you describe it the same way every time: fix its defining traits on first appearance and reuse them near-verbatim on every return; never redesign it.

LIGHTING & TIME: match the narration's time of day (incl. Tagalog cues) by naming the physical light source(s) present or implied in THIS place — not a label, and not a default. Night / gabi / madaling-araw / 3 AM → light only by what genuinely exists there: a lamp or candle in a rural bedroom, but stall lights and neon in a night market, streetlights and signage on a city road, a screen, a fire. Do NOT assume night means a dark room — a brightly lit night scene is correct when the place has light. Day / umaga / tanghali = daylight; dusk/dawn = low ambient. (How DARK a night gets, and whether windows go black, is a genre decision — see the genre module if one applies.)

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees. If something is only HEARD (a voice, a knock) or FELT and never said to be SEEN, do NOT render its source — render the visible reaction and the space around it, not an invented source. Only depict people, objects, or events the narration explicitly says are visible.

DESCRIBE PRESENCE, NOT ABSENCE: each imagePrompt must state only what IS in the frame, never what is absent. The image model reads "no sink", "without a mirror" or "strictly no X" as a cue to DRAW that very thing — so to keep something OUT, describe what fills that space instead, leaving no room for the unwanted element (e.g. to keep a fixture out of a cramped interior: "the walls press in close on both sides", not "no sink"). Never write "no", "without" or "strictly no" in an imagePrompt.

FILTER-SAFE PHRASING (every genre): when a PERSON is depicted dead, a corpse, a victim, bloodied or gravely injured, or as a supernatural / menacing presence, describe them with NON-PERSON words — "a figure", "a form", "a shape", "it" — NEVER "a woman / man / girl / boy" or "her / him" for THAT subject. Naming a person in such a state trips the image model's safety filter and the shot fails to render entirely; the exact same subject described as "a figure / form" renders an identical image and passes. This holds in ANY genre — a news tragedy, a true-crime victim, a horror apparition. But ORDINARY, living, unharmed people stay PEOPLE — describe them normally (a woman, the friend, a chef); this rule is ONLY for the dead, harmed, menacing, or supernatural.

CAST CONTROL: only the people the narration actually places in this scene appear in frame — NEVER invent background extras, passers-by, bystanders, or a crowd the story doesn't mention. Frame exactly who the beat names; if the narration says the place is empty or the narrator is alone, show the space deserted around them. Stating who is present (and that the rest is empty) stops the model populating the background with strangers.

PERSPECTIVE: ${perspectiveRule}

BE TRUE TO THE BEAT: depict what is literally happening in THIS line — including the subject's exact POSTURE and what any device/screen actually shows. If the action implies sitting, show them seated; if they are reading a message, the phone shows a text-message screen (not a camera viewfinder or home screen); match the real activity, not a generic stand-and-pose. If the narration says something is missing, lost, forgotten, or left behind, do NOT show it; if a character is going TO LOOK FOR an object, they don't have it yet (don't hand them the thing they're searching for). Keep each shot to ONE clear focal action — don't stack competing subjects or effects into a single frame, or it renders as a muddled, illegible image.

PROGRESSION & VARIETY: the reel is a sequence, not similar stills. Each scene must ADVANCE the reel with new visual information — never restate the previous shot as the same moment from a slightly different angle unless the narration genuinely lingers there. Don't repeat the same shot size / distance / focal point on consecutive scenes; vary framing (wide, medium, close, low/high). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut to an unrelated environment shot.

ENCLOSED SPACE (every genre): when consecutive scenes sit INSIDE the same small enclosed space (a toilet cubicle, a car interior, an elevator, a confessional — the journey keeps the same interior location across those legs), frame them TIGHT and from WITHIN, with the door CLOSED: the latched/locked door, the narrator's own hands, the phone screen, the gap under the door, the partition walls pressing close. NEVER cut to a wide shot of the person standing out in the open room, and NEVER have them wander out of the space until the narration says they leave. Imply mundane business (using the toilet) — never depict it; show the tension (a gripped latch, a held breath, eyes on the door gap) instead. VARY within the box: a different tight detail each beat (the door, then the hands, then the phone, then the floor gap), not the same framing repeated and not an escape to a bigger space.

SAFETY (all genres): no gore, no graphic violence, no nudity/sexualization, no minors in harmful or sexual contexts.${moduleBlock}${notesBlock}

OUTPUT (JSON only):
{
  "scenes": [
    { "idx": 1, "narrationText": "complete verbatim substring", "primaryEntity": "cracked-mirror", "supportingEntities": ["the-tenant"], "imagePrompt": "the tenant steps toward the glass, medium shot from behind their shoulder, dust adrift, the bare bulb throwing weak light from above", "sceneIntent": "the reflection before the figure", "cameraMove": "push_in", "subjectMotion": "", "tier": "still", "mood": ["tense", "quiet"], "location": "rented bedroom" }
  ]
}`

  return { system, userMessage }
}
