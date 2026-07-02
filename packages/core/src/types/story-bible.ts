import { z } from 'zod'

// Story Bible — the per-reel symbol table of recurring entities (see specs/story-bible.md).
// The analyzer is the SOLE author; each `description` is written once and spliced byte-identically
// wherever its id is referenced, so a recurring element never paraphrase-drifts across the
// independently-generated scene images.

// A recurring thing with stable visual identity.
export const BibleEntitySchema = z.object({
  id: z.string().min(1), // kebab-case symbol: "bedroom", "ashley", "cracked-mirror"
  kind: z.enum(['character', 'location', 'object']),
  // Optional role marker for routing. 'threat' = the story's supernatural presence (ghost/aswang/figure);
  // its reference plate is minted on the grittier Flux engine for horror so it isn't beautified. Set by the
  // analyzer. Absent for ordinary entities. (The narrator is tracked separately via continuity.narratorEntityId.)
  role: z.enum(['threat']).optional(),
  // Canonical depictable noun phrase — FACTS ONLY, in the channel's narration language. Written once,
  // never regenerated. For a LOCATION this MUST enumerate the physical light sources/openings present
  // (a window, a bare bulb, a gasera, "no electricity") — they are facts of the place; WHICH source is
  // active + the time of day are per-scene decisions.
  description: z.string().min(1),
  // R2 key of this entity's canonical reference plate — a single image generated once from `description`
  // (see analyze_story). The scene-image step conditions on it so the entity keeps its pixel-level identity
  // across scenes, not just its prose. NOT authored by the analyzer LLM (it's populated post-analysis and
  // overwritten if present); the assembler/resolver treat it as optional, so a missing plate degrades the
  // scene to text-only — never a failure. Absent on channel-canon entities until they're given a plate.
  referenceImageKey: z.string().optional(),
  // Operator override marker. true = a human edited this entity's description (the analyzer's guess was
  // wrong/under-specified). Locked entities are HUMAN TRUTH: re-deriving the bible (analyze_story) must
  // carry them forward verbatim instead of overwriting them with a fresh machine guess. Not set by the
  // analyzer LLM. Dormant since the cast-review UI was removed; preserveLockedEntities still honours it.
  locked: z.boolean().optional(),
})
export type BibleEntity = z.infer<typeof BibleEntitySchema>

export const StoryBibleSchema = z.object({
  entities: z.array(BibleEntitySchema).default([]),

  continuity: z
    .object({
      // Authoritative reel-wide perspective (the scene LLM no longer re-detects it per run).
      narratorPerspective: z.enum(['first_person', 'third_person']).default('third_person'),
      // Which entity id IS the narrator, if embodied. Drives perspective-aware expansion: in a
      // first_person reel the assembler must NOT splice this entity as a full figure. null = none.
      narratorEntityId: z.string().nullable().default(null),
      // Optional ordered time-of-day cues, if the story makes them explicit.
      timeline: z.array(z.string()).default([]),
    })
    .default({ narratorPerspective: 'third_person', narratorEntityId: null, timeline: [] }),

  // Story-wide rules the genre default wouldn't already imply. Free text on purpose — a typed flag is
  // added only once a scene-stage consumer honors it. e.g. "the reflection must stay ambiguous".
  constraints: z
    .object({ directorNotes: z.array(z.string()).default([]) })
    .default({ directorNotes: [] }),
})
export type StoryBible = z.infer<typeof StoryBibleSchema>

// Fail-soft empty bible: a valid bible with no entities. Every reference is unresolved, which the
// assembler tolerates (it drops the splice), so the pipeline degrades to invent-inline, never fails.
export const EMPTY_STORY_BIBLE: StoryBible = StoryBibleSchema.parse({})
