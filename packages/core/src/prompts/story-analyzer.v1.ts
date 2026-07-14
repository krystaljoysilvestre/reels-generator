// story-analyzer.v1 — read a FINISHED narration and extract its recurring entities as a Story Bible
// (see specs/story-bible.md). This is the symbol table the scene breakdown references and the assembler
// splices, so a recurring person/place/object reads as the SAME one across the independently-generated
// scene images. The analyzer is an information EXTRACTOR, not a creative writer: facts only, no fabrication.
//
// Output is validated against StoryBibleSchema (packages/core/src/types/story-bible.ts). The caller merges
// this with the channel's normalized canon (mergeBible) before persisting the resolved bible on the reel.

import { StoryBibleSchema } from '../types/story-bible.js'
import type { BibleEntity } from '../types/story-bible.js'

export const STORY_ANALYZER_V1_VERSION = 'story-analyzer.v1.14'

// The analyzer emits a full StoryBible; the caller validates with this schema.
export { StoryBibleSchema }

export interface StoryAnalyzerVars {
  narration: string
  channelCanon: BibleEntity[] // normalized channel canon (recurring across reels) — reuse these ids
  nicheDescription: string
  era: string
  regionDescriptor: string
}

export function buildStoryAnalyzerPrompt(v: StoryAnalyzerVars): { system: string; userMessage: string } {
  const system = `You are a continuity analyst for a narrated vertical (9:16) reel. You read the FINISHED narration and extract its recurring people, places, and objects as a stable visual reference — a "story bible" the storyboard team will reuse so the same character, room, or object looks identical every time it appears.

You are an information EXTRACTOR, not a creative writer. You describe only what the narration states or directly implies, in plain depictable terms. You never invent.

CHANNEL NICHE: ${v.nicheDescription}
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const canonBlock = v.channelCanon.length
    ? `EXISTING CHANNEL CANON (recurring across this channel's reels — when THIS story features one of these, REUSE its id instead of minting a duplicate, and you may extend its description with story-specific facts):
${JSON.stringify(v.channelCanon, null, 2)}
CRITICAL: the canon is a shared vocabulary, NOT a checklist. Include a canon entity ONLY if THIS narration actually features it. Do NOT copy canon entities the story never mentions into your output — the bible must contain only the people, places, and objects that appear in THIS story. A story set entirely in a school restroom must NOT list the channel's dorm, office, or hospital.`
    : `EXISTING CHANNEL CANON: none.`

  const userMessage = `Read the narration and extract its Story Bible.

${canonBlock}

Narration:
"""${v.narration}"""

Extract:

ENTITIES — the recurring people, places, and objects that ANCHOR the story. Rules:
- Extract ONLY what RECURS or ANCHORS — be STRICT, a short cast beats a padded list. An entity must EITHER
  appear across MULTIPLE beats, OR be central to what the story is about (a character, the main setting, the
  object the whole story turns on). The test: would it look WRONG if it changed appearance between shots? If
  it never reappears, the answer is no — it is NOT an entity. Incidental props the narration mentions in
  passing (earphones, a phone's clock, a fridge light, a glass of water, a single text bubble) are NOT
  entities — they belong in the one scene's inline description, not the bible. When unsure, LEAVE IT OUT.
- THE FIRST-PERSON NARRATOR IS ALWAYS AN ENTITY. If the narration is told in first person ("ako", "ko", "nakita ko", "I", "my"), you MUST extract the narrator as a "character" entity with a FULLY committed look (gender + wardrobe + hair + build), EVEN in a solo story where no one else appears and they are only ever seen as their own hands, a reflection, or a partial body. A first-person narrator IS shown — hands on a sink, a face in a mirror, a shoulder edging the frame — so without a locked appearance every such shot renders a DIFFERENT person. Set continuity.narratorEntityId to this entity's id, and list this id in the journey leg's "present" array for every leg the narrator is physically in (for the narrator, that is every leg).
- FACTS ONLY. Each "description" is a short, depictable noun phrase of OBSERVABLE traits — for a person: gender, apparent age, build, hair, and wardrobe (ALL of these — an under-described person renders as a random, often wrong, figure), plus one distinguishing detail; for a place: layout, key furniture, materials, colours, wear; for an object: count, state, condition. NO mood words, NO adjectives of feeling, NO interpretation (write "an old mirror, dark wood frame, cracked glass", never "a creepy mirror").
- PEOPLE need a COMMITTED gender + wardrobe, derived from EVIDENCE — never from a default. Read GENDER from the narration's OWN cues (gendered words, honorifics, names, pronouns, role) and commit to what they indicate. Read WARDROBE from the story's setting and activity together with the channel's stated era and region (above): name what a person of that role, in that place and time, would actually wear — specifically, not a vague placeholder. Do not impose traits the evidence doesn't support; once the cues point one way, commit, so the figure stays consistent instead of drifting. Where appearance is left entirely unspecified, the "commit to ONE plausible look" rule below applies — pick a neutral, context-appropriate look, not a stereotype. GENDER IS NEVER DEFERRED: NEVER write "gender unspecified", "male or female", "depending on gender", or "a skirt or pants" — a hedged gender renders a DIFFERENT person every single shot (a boy in one, a girl in the next). Tagalog/Taglish first-person ("ako", "ko", "nakita ko") carries NO grammatical gender, so you will OFTEN have no explicit cue — in that case INFER gender from the surrounding cast and context (a schoolgirl's best friend + a female-coded story → female), and if it is STILL genuinely ambiguous, COMMIT to one plausible gender + one concrete uniform anyway. The renderer must never be left to choose the gender.
- SAME-SETTING CAST SHARE A UNIFORM BASE, but stay DISTINCT people. Characters who belong to the same institution/group (the same school, the same workplace) wear the SAME uniform — identical garments and colours (two students at one school: the SAME white blouse + the SAME plaid skirt, not one in a skirt and one in pants). But they MUST read as visually DISTINCT individuals — differ in hair (length/style), build, height, and one identifying detail — so two classmates never render as the same person. Give recurring students a consistent context prop (a backpack) where natural. State each person's shared-base + distinct-detail explicitly in their description.
- STABLE IDENTITY ONLY — describe what someone/something permanently IS, never what it is momentarily HOLDING or DOING. Transient props and actions belong to a SCENE, not an entity: a friend who LOSES or goes to LOOK FOR her tumbler must NOT be described as "carrying a tumbler" — she'd be drawn holding the very thing she's searching for. A prop that is lost, sought, only-sometimes-present, or appears in a single beat is either its OWN object entity (if it recurs) or a per-scene detail — never welded onto a person's permanent look.
- DECLARATIVE looks, NO hedging. Write each description as one committed look — never "possibly", "maybe", "perhaps", "likely", "or". If the narration leaves a RECURRING thing's appearance unspecified, commit to ONE plausible, genre-appropriate concrete look and state it plainly: that single frozen choice is exactly what keeps the thing consistent across shots.
- DON'T FABRICATE BIOGRAPHY. Committing to a plausible LOOK for something unspecified — a prop, a place, or a person's appearance (gender, wardrobe, hair, build) — is your job (above). But never invent BIOGRAPHICAL facts the narration doesn't give: a specific numeric age, a name, a relationship, a brand, or backstory — and never state an inferred look as if it were a stated fact. Appearance you commit to; biography you don't invent.
- THE SUPERNATURAL THREAT is a CHARACTER entity — always, even when only implied. When the narration presents an IMPOSSIBLE or UNEXPLAINED presence (a figure who can't be there, a second face in a reflection, a voice with no source, an aswang/multo/white lady), extract it as a "character" with role: "threat" described as a VISIBLE, unmistakably DEAD apparition in the Filipino/Asian-horror tradition (a multo / white lady / Sadako-type wraith) — because this text is spliced verbatim into the reveal shot and must render as a ghost that is clearly SEEN, not hidden. The wrongness must live in features that read as a CORPSE, never as cosmetics: pallid, waxy, WET/clammy skin; long black hair hanging DOWN OVER and around the face, partly veiling it; the eyes DEEP-SUNKEN in shadowed sockets, mostly lost to black, each catching a single wet GLINT of light — describe it as deep SHADOW pooling in the eye hollows (a lighting effect), NOT dark eyeshadow or painted-dark eyes (which render as makeup), and NOT a flat featureless white (which renders as blank skin); a fixed, unnatural too-wide smile baring CROOKED, uneven, jagged teeth; the head at a slightly wrong angle, unnaturally still. Do NOT describe it as hidden in shadow (renders as a black blob) and NOT as "pale skin + dark eyes" (renders as goth makeup). Never pretty, never bloody, never a mood word. This gives the threat a single locked, deliberately-scary identity that stays consistent every scene it haunts. Describe it with NON-PERSON words — "a tall figure", "a gaunt form", "a shape" — NOT "a woman/man/girl": its description is spliced verbatim into image prompts, and naming a PERSON in a dead or menacing state trips the image model's safety filter, whereas the same thing as a "figure/form" renders identically and passes. Mark ONLY the supernatural presence with role: "threat"; ordinary people get no role. Usually exactly one.
- LOCATIONS must enumerate the physical light sources / openings present (a window, a bare bulb, a gasera/kerosene lamp, "no electricity") — these are facts of the place. (Which light is ON, and the time of day, are decided later, per scene — don't fix them here.)
- A DWELT-IN SETTING IS A LOCATION ENTITY, not a transit space. Any place where the narrator DWELLS or that hosts 2+ beats — e.g. a stage/backstage where they finish props across several beats — MUST be extracted as a "location" entity with a full description, even if they later move on. The story's OPENING / primary setting (where the first events happen — the classroom, the stage, the bedroom) is ALWAYS a location entity: it anchors the opening shots, so it needs a locked look even when the narration describes it in only a sentence or two. It gets a locked look and renders consistently. RESERVE a transit space (a journey leg with locationEntityId set to null) ONLY for a place merely CROSSED in a single pass-through beat (a corridor walked through once on the way somewhere). Do NOT dump a dwelt-in setting into a bare transit label — that leaves it with no description and it renders as a generic room (a "stage" came out as a storage room). So: dwelt-in / multi-beat → entity; single-pass-through → transit.
- SPLIT RECURRING ENCLOSED SUB-SPACES into their OWN location — this is the DEFAULT, not the exception. A smaller enclosed space you sit or stand INSIDE, walled off so the rest of the place is NOT visible from within — a toilet cubicle inside a restroom, a car interior on a street, a confessional inside a church, a shower stall, an elevator — is a SEPARATE location from its parent whenever EITHER: (a) the story sets TWO OR MORE beats inside it, OR (b) the narrator stays inside it through one SUSTAINED stretch (e.g. sitting in a cubicle through a whole back-and-forth exchange). When that test passes you MUST emit BOTH entities:
  • the INTERIOR (e.g. "restroom-cubicle-interior") — described by ONLY what is seen from within: the partition walls pressing close, the latched door, the toilet. NEVER the parent's far features (no sinks, no mirror, no window wall) — they aren't visible from inside and would force the wrong space into the shot.
  • the PARENT (e.g. "school-restroom", with its sinks and mirror) — for the wide establishing / entering / exiting shots.
  This matters because each description is spliced VERBATIM into every shot that references it: put "a mirror above the sinks" into a shut-cubicle shot and the model renders the open room instead of the cubicle. The scene breakdown then tags whichever one a beat is physically inside.
  The ONLY time you keep a SINGLE location is when the enclosed space appears in exactly ONE brief, non-central beat and never recurs — then don't mint a duplicate; keep the parent and let that one shot note its tight framing inline. When in doubt for a space the story actually dwells in: SPLIT.
- EVERY entity MUST have a full, depictable visual description — never just its name/id, and never a bare non-English term. The description is spliced straight into an image prompt, so a name alone ("lumang kwarto") is useless: write what it LOOKS like ("an old wooden room, plank walls, a single bed"). Translate every non-English name into its appearance (e.g. "gasera" → "a small kerosene gas lamp", "lumang kwarto" → "a small old wooden bedroom").
- REUSE channel-canon ids where an entity matches — but still write its FULL visual description (the canon may only have the name; you supply the look). Only mint a new id for something the canon doesn't cover.
- id: ENGLISH kebab-case (e.g. "rented-bedroom", "cracked-mirror", "grandmother"). TRANSLATE any Tagalog/other-language name to English for the id — never mint a Tagalog id ("salamin-ng-banyo" → "bathroom-mirror", "cr-sa-eskwela" → "school-restroom", "reloh-sa-telepono" → "phone-clock"). This matters because the scene breakdown often echoes the id as the shot's label, and the image model only understands English — a Tagalog id renders the wrong object or fails. kind: "character" | "location" | "object".

CONTINUITY:
- narratorPerspective: "first_person" if the narration is told as "I/ako/ko/nakita ko/akin"; otherwise "third_person".
- narratorEntityId: for a first_person reel this is the id of the narrator character you extracted above (you ALWAYS extract one for first-person — see ENTITIES); it tells the storyboard the narrator is POV, not a separate full figure, and locks their look for hand/reflection shots. null ONLY for third_person.
- timeline: optional short ordered time-of-day cues if the story makes them explicit (e.g. ["evening", "3 AM"]); else [].
- journey: an ORDERED list tracing the narrator THROUGH the story — one leg per contiguous stretch where the PLACE and WHO-IS-PRESENT stay stable. This is the world-state the storyboard OBEYS, so it must be ACCURATE, not vague; walk the narration front-to-back and change legs whenever the narrator moves or someone joins/leaves. For each leg:
  • span: the VERBATIM narration substring this leg covers (copy-paste, no ellipsis); the legs together cover the narration in order.
  • locationLabel: a short ENGLISH label for where the narrator physically IS this leg — INCLUDING transit spaces that may not be entities (a stage, a path, a hallway). "Walking toward X" is its OWN leg in the space passed THROUGH, never inside X.
  • locationEntityId: the bible LOCATION entity the narrator is physically INSIDE this leg; null for a transit space with no entity. NEVER the destination they're only heading toward.
  • present: entity ids of the characters PHYSICALLY here this leg — only who the narration actually places here. Someone who left (went back for something, stayed behind) is NOT present until they return. In a first-person story the narrator is present in EVERY leg.
  • visible: the subset of present actually ON-camera. Usually equals present; make it NARROWER for POV / reflection / hidden beats (narrator present but off-camera; a threat seen only in a reflection). [] means "same as present".
  • occupancyState: "outside" | "approaching" | "inside" | "leaving" — the narrator's relation to this leg's place; omit if genuinely unclear.
  • isReflection: true only if the narrator sees this leg via a mirror / window / dark glass.
  MOVEMENT IS CONTINUOUS — the narrator can't teleport: never go from INSIDE one place straight to INSIDE another without a leaving/transit leg between them.

CONSTRAINTS:
- directorNotes: only STORY-SPECIFIC visual rules that the genre wouldn't already imply (e.g. "the reflection must never clearly show a face"). Leave empty if nothing specific. Do NOT restate generic genre conventions.

OUTPUT (JSON only, matching this shape exactly):
{
  "entities": [
    { "id": "rented-bedroom", "kind": "location", "description": "a small rented bedroom, cream concrete walls with peeling paint, a single wooden bed, one shuttered window, a bare ceiling bulb" },
    { "id": "the-figure", "kind": "character", "role": "threat", "description": "a tall gaunt figure, waxen greyish corpse-like skin, dark hollow eyes, a too-wide unnatural grin baring uneven yellowed teeth, long lank black hair" }
  ],
  "continuity": {
    "narratorPerspective": "first_person",
    "narratorEntityId": null,
    "timeline": [],
    "journey": [
      { "span": "verbatim narration for this leg", "locationLabel": "school stage", "locationEntityId": null, "present": ["narrator", "best-friend"], "visible": [], "occupancyState": "inside", "isReflection": false },
      { "span": "next verbatim span", "locationLabel": "school restroom", "locationEntityId": "school-restroom", "present": ["narrator"], "visible": ["narrator"], "occupancyState": "inside", "isReflection": false }
    ]
  },
  "constraints": { "directorNotes": [] }
}`

  return { system, userMessage }
}
