// story-analyzer.v1 — read a FINISHED narration and extract its recurring entities as a Story Bible
// (see specs/story-bible.md). This is the symbol table the scene breakdown references and the assembler
// splices, so a recurring person/place/object reads as the SAME one across the independently-generated
// scene images. The analyzer is an information EXTRACTOR, not a creative writer: facts only, no fabrication.
//
// Output is validated against StoryBibleSchema (packages/core/src/types/story-bible.ts). The caller merges
// this with the channel's normalized canon (mergeBible) before persisting the resolved bible on the reel.

import { StoryBibleSchema } from '../types/story-bible.js'
import type { BibleEntity } from '../types/story-bible.js'

export const STORY_ANALYZER_V1_VERSION = 'story-analyzer.v1.3'

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
- FACTS ONLY. Each "description" is a short, depictable noun phrase of OBSERVABLE traits — for a person: gender, apparent age, build, hair, and wardrobe (ALL of these — an under-described person renders as a random, often wrong, figure), plus one distinguishing detail; for a place: layout, key furniture, materials, colours, wear; for an object: count, state, condition. NO mood words, NO adjectives of feeling, NO interpretation (write "an old mirror, dark wood frame, cracked glass", never "a creepy mirror").
- PEOPLE need a COMMITTED gender + wardrobe, derived from EVIDENCE — never from a default. Read GENDER from the narration's OWN cues (gendered words, honorifics, names, pronouns, role) and commit to what they indicate. Read WARDROBE from the story's setting and activity together with the channel's stated era and region (above): name what a person of that role, in that place and time, would actually wear — specifically, not a vague placeholder. Do not impose traits the evidence doesn't support; once the cues point one way, commit, so the figure stays consistent instead of drifting. Where appearance is left entirely unspecified, the "commit to ONE plausible look" rule below applies — pick a neutral, context-appropriate look, not a stereotype.
- STABLE IDENTITY ONLY — describe what someone/something permanently IS, never what it is momentarily HOLDING or DOING. Transient props and actions belong to a SCENE, not an entity: a friend who LOSES or goes to LOOK FOR her tumbler must NOT be described as "carrying a tumbler" — she'd be drawn holding the very thing she's searching for. A prop that is lost, sought, only-sometimes-present, or appears in a single beat is either its OWN object entity (if it recurs) or a per-scene detail — never welded onto a person's permanent look.
- DECLARATIVE looks, NO hedging. Write each description as one committed look — never "possibly", "maybe", "perhaps", "likely", "or". If the narration leaves a RECURRING thing's appearance unspecified, commit to ONE plausible, genre-appropriate concrete look and state it plainly: that single frozen choice is exactly what keeps the thing consistent across shots.
- DON'T FABRICATE BIOGRAPHY. Committing to a plausible LOOK for something unspecified — a prop, a place, or a person's appearance (gender, wardrobe, hair, build) — is your job (above). But never invent BIOGRAPHICAL facts the narration doesn't give: a specific numeric age, a name, a relationship, a brand, or backstory — and never state an inferred look as if it were a stated fact. Appearance you commit to; biography you don't invent.
- LOCATIONS must enumerate the physical light sources / openings present (a window, a bare bulb, a gasera/kerosene lamp, "no electricity") — these are facts of the place. (Which light is ON, and the time of day, are decided later, per scene — don't fix them here.)
- SPLIT ENCLOSABLE SUB-SPACES only when the interior RECURS. When the story sets MULTIPLE beats INSIDE a smaller enclosed space from which the rest of the place is NOT visible — a toilet cubicle within a restroom, a car interior on a street, a confessional within a church — AND also shows the wider parent in other beats, make that interior a SEPARATE location entity (e.g. "restroom-stall-interior", describing only what is seen from within) and keep the parent ("school-restroom", with its sinks and mirror) for the wide establishing/exit shots. Rationale: the full parent description is spliced verbatim into every shot that references it, so the parent's far details (the sink wall, the street outside) would otherwise be forced into a tightly-enclosed shot where they can't be seen. BUT do NOT split a sub-space that appears in only a SINGLE beat — that just mints a duplicate location with its own diverging look. In that case keep ONE location entity (the parent) and let the single enclosed shot note its tight framing inline. Same place = one entity unless the interior genuinely recurs.
- EVERY entity MUST have a full, depictable visual description — never just its name/id, and never a bare non-English term. The description is spliced straight into an image prompt, so a name alone ("lumang kwarto") is useless: write what it LOOKS like ("an old wooden room, plank walls, a single bed"). Translate every non-English name into its appearance (e.g. "gasera" → "a small kerosene gas lamp", "lumang kwarto" → "a small old wooden bedroom").
- REUSE channel-canon ids where an entity matches — but still write its FULL visual description (the canon may only have the name; you supply the look). Only mint a new id for something the canon doesn't cover.
- id: kebab-case (e.g. "rented-bedroom", "cracked-mirror", "lola"). kind: "character" | "location" | "object".

CONTINUITY:
- narratorPerspective: "first_person" if the narration is told as "I/ako/ko/nakita ko/akin"; otherwise "third_person".
- narratorEntityId: if first_person AND the narrator is an embodied character you listed as an entity, set this to that entity's id (so the storyboard knows not to render them as a separate figure); otherwise null.
- timeline: optional short ordered time-of-day cues if the story makes them explicit (e.g. ["evening", "3 AM"]); else [].

CONSTRAINTS:
- directorNotes: only STORY-SPECIFIC visual rules that the genre wouldn't already imply (e.g. "the reflection must never clearly show a face"). Leave empty if nothing specific. Do NOT restate generic genre conventions.

OUTPUT (JSON only, matching this shape exactly):
{
  "entities": [
    { "id": "rented-bedroom", "kind": "location", "description": "a small rented bedroom, cream concrete walls with peeling paint, a single wooden bed, one shuttered window, a bare ceiling bulb" }
  ],
  "continuity": { "narratorPerspective": "first_person", "narratorEntityId": null, "timeline": [] },
  "constraints": { "directorNotes": [] }
}`

  return { system, userMessage }
}
