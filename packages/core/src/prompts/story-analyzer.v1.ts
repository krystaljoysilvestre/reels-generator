// story-analyzer.v1 — read a FINISHED narration and extract its recurring entities as a Story Bible
// (see specs/story-bible.md). This is the symbol table the scene breakdown references and the assembler
// splices, so a recurring person/place/object reads as the SAME one across the independently-generated
// scene images. The analyzer is an information EXTRACTOR, not a creative writer: facts only, no fabrication.
//
// Output is validated against StoryBibleSchema (packages/core/src/types/story-bible.ts). The caller merges
// this with the channel's normalized canon (mergeBible) before persisting the resolved bible on the reel.

import { StoryBibleSchema } from '../types/story-bible.js'
import type { BibleEntity } from '../types/story-bible.js'

export const STORY_ANALYZER_V1_VERSION = 'story-analyzer.v1'

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
    ? `EXISTING CHANNEL CANON (recurring across this channel's reels — REUSE these ids, don't mint duplicates; you may extend a description with story-specific facts):
${JSON.stringify(v.channelCanon, null, 2)}`
    : `EXISTING CHANNEL CANON: none.`

  const userMessage = `Read the narration and extract its Story Bible.

${canonBlock}

Narration:
"""${v.narration}"""

Extract:

ENTITIES — the recurring people, places, and objects that ANCHOR the story. Rules:
- Extract only what RECURS or anchors the story. A detail mentioned once and never seen again is NOT an entity.
- FACTS ONLY. Each "description" is a short, depictable noun phrase of OBSERVABLE traits — for a person: build, age (only if stated/implied), hair, wardrobe, one distinguishing detail; for a place: layout, key furniture, materials, colours, wear; for an object: count, state, condition. NO mood words, NO adjectives of feeling, NO interpretation (write "an old mirror, dark wood frame, cracked glass", never "a creepy mirror").
- DECLARATIVE looks, NO hedging. Write each description as one committed look — never "possibly", "maybe", "perhaps", "likely", "or". If the narration leaves a RECURRING thing's appearance unspecified, commit to ONE plausible, genre-appropriate concrete look and state it plainly: that single frozen choice is exactly what keeps the thing consistent across shots.
- DON'T FABRICATE FACTS. Committing to a plausible visual for an unspecified PROP/PLACE is your job (above). But never invent identity FACTS the narration doesn't give — ages, names, relationships, brands, backstory. Those become false continuity demands.
- LOCATIONS must enumerate the physical light sources / openings present (a window, a bare bulb, a gasera/kerosene lamp, "no electricity") — these are facts of the place. (Which light is ON, and the time of day, are decided later, per scene — don't fix them here.)
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
