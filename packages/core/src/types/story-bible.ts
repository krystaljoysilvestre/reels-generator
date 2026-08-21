import { z } from 'zod'
import { DepictionRoutingSchema, MediaOriginSchema, type MediaOrigin } from './depiction.js'

// Story Bible — the per-reel symbol table of recurring entities (see specs/story-bible.md).
// The analyzer is the SOLE author; each `description` is written once and spliced byte-identically
// wherever its id is referenced, so a recurring element never paraphrase-drifts across the
// independently-generated scene images.

// A materially different, time-bound rendering of ONE character identity. The base entity description is
// the default appearance; variants exist only when the narration supports a visible change (e.g. the same
// grandmother now vs as a child). They are not separate characters: cast, relationships, and story identity
// stay on the parent entity. Reference/provenance fields are populated post-analysis, exactly like the base
// entity's plate.
export const CharacterAppearanceSchema = z.object({
  id: z.string().min(1), // English kebab-case within the parent identity: "remembered-youth"
  description: z.string().min(1), // COMPLETE render-facing look for this state, not a delta like "younger"
  referenceImageKey: z.string().optional(),
  referenceOrigin: MediaOriginSchema.optional(),
})
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>

export const AppearanceBindingsSchema = z.record(z.string(), z.string())
export type AppearanceBindings = z.infer<typeof AppearanceBindingsSchema>

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
  // Optional time-bound looks for a CHARACTER. Empty is the overwhelmingly common linear-story path and
  // preserves the existing one-description/one-plate behaviour. Non-character variants are rejected by
  // validateAppearanceBindings before scene planning rather than encoded as a shape every object must carry.
  appearances: z.array(CharacterAppearanceSchema).optional(),
  // R2 key of this entity's canonical reference plate — a single image generated once from `description`
  // (see analyze_story). The scene-image step conditions on it so the entity keeps its pixel-level identity
  // across scenes, not just its prose. NOT authored by the analyzer LLM (it's populated post-analysis and
  // overwritten if present); the assembler/resolver treat it as optional, so a missing plate degrades the
  // scene to text-only — never a failure. Absent on channel-canon entities until they're given a plate.
  referenceImageKey: z.string().optional(),
  // Provenance of the reference plate. A SOURCED real photograph (from Wikimedia Commons) carries its licence
  // + author so the reel can attribute it; a 'generated' plate (the default, and the only kind for non-factual
  // genres) needs none. Additive/optional → old reels and generated plates simply omit it. Populated
  // post-analysis alongside referenceImageKey; never authored by the analyzer LLM.
  referenceOrigin: MediaOriginSchema.optional(),
  // HOW this entity may be depicted (see types/depiction.ts). Resolved ONCE, before any sourcing, and read
  // by every downstream gate — nothing re-derives it from `kind` or re-checks liveness. Absent on entities
  // that predate depiction routing and on every non-factual reel, where 'generated' is the only mode.
  //
  // 'archival_only' is LOAD-BEARING FOR SAFETY, not a preference: such an entity may never contribute a
  // reference plate and may never be named in a generated image prompt (the depictive-ethics floor). Both
  // are enforced in generate-images, in code.
  depiction: DepictionRoutingSchema.optional(),
  // Operator override marker. true = a human edited this entity's description (the analyzer's guess was
  // wrong/under-specified). Locked entities are HUMAN TRUTH: re-deriving the bible (analyze_story) must
  // carry them forward verbatim instead of overwriting them with a fresh machine guess. Not set by the
  // analyzer LLM. Dormant since the cast-review UI was removed; preserveLockedEntities still honours it.
  locked: z.boolean().optional(),
})
export type BibleEntity = z.infer<typeof BibleEntitySchema>

// A "leg" of the narrator's JOURNEY through the story — the world-state ground truth the breakdown obeys
// and scene-QA validates against (see the scene-accuracy plan). One leg per contiguous stretch where the
// (place, who-is-present) is stable. Extracted by the analyzer; IMMUTABLE after analysis — downstream
// stages only READ it. Deliberately minimal (Phase 2A); richer cinematography fields are deferred.
// Under a VOICEOVER perspective the journey is a SUBJECT-MATTER ITINERARY instead: one leg per contiguous
// stretch of the argument's setting; spans still tile the narration; `present` lists only people the
// content itself depicts (never the narrator); occupancy/movement-continuity don't apply (an argument may
// jump between places freely — it's not locomotion), and isReflection stays false.
export const JourneyLegSchema = z.object({
  span: z.string().min(1), // verbatim narration substring this leg covers (resolved to scenes by offset)
  // English place label. Covers TRANSIT spaces that aren't bible entities (a stage, a path, a hallway), so
  // a "walking toward X" beat has a real place to sit in and the breakdown knows NOT to tag the destination.
  locationLabel: z.string().default(''),
  // The bible LOCATION entity the narrator is physically INSIDE this leg; null = a transit space with no
  // entity. This is what a scene's tagged location entity must match.
  locationEntityId: z.string().nullable().default(null),
  present: z.array(z.string()).default([]), // character entity ids physically present in this leg (cast gate)
  // Subset of `present` actually ON-camera. Empty array = "same as present" (nothing intentionally hidden).
  // Non-empty + narrower than present = POV / reflection / hidden-subject (narrator present but off-camera).
  visible: z.array(z.string()).default([]),
  // Appearance variant active for a character during this anchored span. Missing = the entity's base/default
  // description. This maps story time to identity state; it does NOT force the director to invent a flashback.
  // The analyzer only emits a binding when this span actually depicts a materially different visible state.
  appearanceByEntity: AppearanceBindingsSchema.optional(),
  // Minimal spatial state, just enough for the transition validator to catch teleportation.
  occupancyState: z.enum(['outside', 'approaching', 'inside', 'leaving']).optional(),
  isReflection: z.boolean().default(false), // this leg is seen via a mirror/window/glass (reflection beat)
})
export type JourneyLeg = z.infer<typeof JourneyLegSchema>

export const StoryBibleSchema = z.object({
  entities: z.array(BibleEntitySchema).default([]),

  continuity: z
    .object({
      // Authoritative reel-wide perspective (the scene LLM no longer re-detects it per run).
      // This is the EMBODIMENT/PRESENTATION axis, not grammatical person (the field name is historical):
      // the three values are three visual grammars — camera-as-eyes (first_person), camera-as-observer
      // (third_person), camera-as-illustrator ('voiceover' = a NON-DIEGETIC narrator: a voice above the
      // story's world with no body in it — news, documentary, explainer, essay, recap). The analyzer
      // decides via the participant test (did the teller LIVE the events, or report/argue about them?);
      // pronouns are evidence, participation is the verdict. See hypotheses/voiceover-perspective.md.
      narratorPerspective: z.enum(['first_person', 'third_person', 'voiceover']).default('third_person'),
      // Which entity id IS the narrator, if embodied. Drives perspective-aware expansion: in a
      // first_person reel the assembler must NOT splice this entity as a full figure. null = none —
      // always null for third_person AND voiceover (a voiceover narrator has no body, never an entity).
      narratorEntityId: z.string().nullable().default(null),
      // Optional ordered time-of-day cues, if the story makes them explicit.
      timeline: z.array(z.string()).default([]),
      // Ordered JOURNEY = the world-state ground truth (where the narrator is + who's present, per leg).
      // Additive/defaulted → old reels and analysis-off degrade to []. See JourneyLegSchema.
      journey: z.array(JourneyLegSchema).default([]),
    })
    .default({ narratorPerspective: 'third_person', narratorEntityId: null, timeline: [], journey: [] }),

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

// Attribution credits for every SOURCED real photograph a reel used — appended to its PUBLISHED description
// so licence terms (attribution, share-alike) are honoured.
//
// TWO sources of sourced media, and both must be credited: reference PLATES on bible entities, and archival
// stills PRESENTED as scenes (scenes.imageOrigin). Crediting only the former would under-attribute exactly
// the media that is shown to the viewer unaltered.
//
// Returns '' when nothing was sourced (the common case — generated plates need no credit), so callers can
// append unconditionally. NOTE: this satisfies attribution; it does NOT resolve freedom-of-panorama, which
// stays a human/legal check before publishing photos of modern structures in no-FoP countries.
export function formatImageCredits(bible: StoryBible, sceneOrigins: readonly unknown[] = []): string {
  const titleCase = (id: string) => id.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')
  // Scene origins arrive as raw jsonb, so parse rather than cast — a malformed row must drop out of the
  // credits, not crash a publish.
  const parsedScenes = sceneOrigins
    .map((o) => MediaOriginSchema.safeParse(o))
    .flatMap((r) => (r.success && r.data.type === 'sourced' ? [r.data] : []))
  const credited: { label: string; origin: MediaOrigin }[] = [
    ...bible.entities
      .filter((e) => e.referenceOrigin?.type === 'sourced')
      .map((e) => ({ label: titleCase(e.id), origin: e.referenceOrigin! })),
    ...parsedScenes.map((o) => ({ label: o.subjectClass === 'human' ? 'Archival photograph' : 'Archival image', origin: o })),
  ]
  if (!credited.length) return ''
  // One entity can appear as both a plate and a presented still, and the same file can back several scenes;
  // credit each distinct FILE once so the description doesn't repeat itself.
  const seen = new Set<string>()
  const lines: string[] = []
  for (const { label, origin: o } of credited) {
    const key = o.url || o.sourceAssetKey || label
    if (seen.has(key)) continue
    seen.add(key)
    const who = o.author ? ` by ${o.author}` : ''
    const lic = o.license ? ` (${o.license}${o.licenseUrl ? `, ${o.licenseUrl}` : ''})` : ''
    const via = o.provider === 'wikimedia' ? ', via Wikimedia Commons' : o.provider ? `, via ${o.provider}` : ''
    lines.push(`• ${label}${who}${lic}${via}`)
  }
  return `Image credits:\n${lines.join('\n')}`
}

// ── Scene depiction requirements ─────────────────────────────────────────────────────────────────
/**
 * What a scene needs, split by media mode.
 *
 * Resolved from the scene's full entity set BEFORE any fulfilment decision, rather than keying the media
 * mode off `primaryEntity`: a living person can be the significant depictive subject of a beat while some
 * other entity is primary ("the monument stands behind them during the ceremony"), and welding a whole
 * media mode onto the primary tag would miss exactly that case.
 */
export interface SceneDepiction {
  generatedEntities: BibleEntity[] // no real source — prompt + style
  referenceEntities: BibleEntity[] // may condition a generated frame
  archivalEntities: BibleEntity[] // may be PRESENTED as a photograph; may NEVER condition
  withheldEntities: BibleEntity[] // a real person we cannot verify: no real image, no invented one either
}

export function splitSceneDepiction(entities: readonly BibleEntity[]): SceneDepiction {
  const out: SceneDepiction = { generatedEntities: [], referenceEntities: [], archivalEntities: [], withheldEntities: [] }
  for (const e of entities) {
    // Absent routing means an unrouted entity (a pre-existing reel, a non-factual channel). 'generated' is
    // the correct and safe default — it is what every entity did before depiction routing existed.
    const mode = e.depiction?.depictionMode ?? 'generated'
    if (mode === 'archival_only') out.archivalEntities.push(e)
    else if (mode === 'identity_withheld') out.withheldEntities.push(e)
    else if (mode === 'reference_plate') out.referenceEntities.push(e)
    else out.generatedEntities.push(e)
  }
  return out
}

/**
 * Entities whose IDENTITY must not reach a generated frame — as a plate, as a spliced description, or as a
 * name in the prose. Two modes qualify, for the same underlying reason (do not fabricate this person), but
 * from opposite directions: `archival_only` may be shown from a REAL photograph and so must never be
 * synthesized; `identity_withheld` has no usable real photograph and must not be invented in its place.
 *
 * One function so the withholding rule is stated once. Only `archivalEntities` may ever FULFIL a scene.
 */
export function identityWithheldEntities(split: SceneDepiction): BibleEntity[] {
  return [...split.archivalEntities, ...split.withheldEntities]
}

/**
 * INVARIANT 1 — the reference plates a scene may condition on.
 *
 * An 'archival_only' entity NEVER contributes one. Its photograph may be PRESENTED as a shot, but it may
 * never condition a generated frame: that is the line between showing real media and fabricating a likeness
 * of a real person, and it is the depictive-ethics floor's core prohibition.
 *
 * A single function, so the rule holds wherever references are assembled instead of being re-implemented at
 * each call site.
 *
 * Appearance variants are materialized into their parent entity shape before this call. That keeps this
 * single safety guard load-bearing for both base and time-bound plates: an archival_only parent's variant
 * plate is prohibited conditioning in exactly the same way as its base plate.
 */
export function conditionableReferenceKeys(entities: readonly BibleEntity[]): string[] {
  return entities
    .filter((e) => !MODES_WITHOUT_PLATES.has(e.depiction?.depictionMode ?? 'generated'))
    .map((e) => e.referenceImageKey)
    .filter((k): k is string => Boolean(k))
}

/**
 * Modes that must never carry a reference plate — neither a sourced one nor a generated stand-in.
 * `archival_only`: a real photograph of this person may be SHOWN, but synthesizing them is the prohibition.
 * `identity_withheld`: we could not establish who they are, so inventing a face for a named real person is
 * exactly the fabrication to avoid.
 */
export const MODES_WITHOUT_PLATES: ReadonlySet<string> = new Set(['archival_only', 'identity_withheld'])

// ── Channel-level entity plates (W2) ─────────────────────────────────────────────────────────────
// A recurring entity's reference plate, minted ONCE per channel and reused by every reel, keyed by
// entity id. Before this, a recurring creature/mascot/host was re-described and re-minted per reel and
// therefore looked different in every episode.
//
// `descriptionHash` is what makes editing safe: the plate is only reused while the description that
// produced it is unchanged, so correcting an entity re-mints instead of silently serving the old look.
export const EntityPlateSchema = z.object({
  key: z.string().min(1), // R2 key of the plate
  descriptionHash: z.string().min(1),
  referenceOrigin: BibleEntitySchema.shape.referenceOrigin,
})
export type EntityPlate = z.infer<typeof EntityPlateSchema>

export const EntityPlateStoreSchema = z.record(z.string(), EntityPlateSchema).default({})
export type EntityPlateStore = z.infer<typeof EntityPlateStoreSchema>

/**
 * Stable fingerprint of the text a plate was rendered from. Not cryptographic — it only needs to change
 * when the description does. Normalized so trivial whitespace edits don't force a costly re-mint.
 */
export function entityDescriptionHash(description: string): string {
  const norm = description.replace(/\s+/g, ' ').trim().toLowerCase()
  let h = 5381
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
