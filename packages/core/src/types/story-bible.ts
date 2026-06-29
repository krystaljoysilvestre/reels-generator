import { z } from 'zod'

// Story Bible — the per-reel symbol table of recurring entities (see specs/story-bible.md).
// The analyzer is the SOLE author; each `description` is written once and spliced byte-identically
// wherever its id is referenced, so a recurring element never paraphrase-drifts across the
// independently-generated scene images.

// A recurring thing with stable visual identity.
export const BibleEntitySchema = z.object({
  id: z.string().min(1), // kebab-case symbol: "bedroom", "ashley", "cracked-mirror"
  kind: z.enum(['character', 'location', 'object']),
  // Canonical depictable noun phrase — FACTS ONLY, in the channel's narration language. Written once,
  // never regenerated. For a LOCATION this MUST enumerate the physical light sources/openings present
  // (a window, a bare bulb, a gasera, "no electricity") — they are facts of the place; WHICH source is
  // active + the time of day are per-scene decisions.
  description: z.string().min(1),
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
