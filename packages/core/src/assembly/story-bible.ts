// Pure resolution + normalization for the Story Bible symbol table (see specs/story-bible.md).
// No LLM, no IO — used by the assembler (to expand references into prompts) and by the scene-QA
// step (to flag references that resolve to nothing).

import type { WorldBible } from '../types/channel.js'
import type { BibleEntity, CharacterAppearance, StoryBible, JourneyLeg } from '../types/story-bible.js'

// Normalize a free-form name/id to a comparison key: lowercase, unicode-aware, punctuation → hyphen.
// "The Mirror" / "the_mirror" / "the-mirror" all collapse to "the-mirror".
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

// v1 channel canon is name-only; treat each as an entity whose description IS the name (v2 where
// description === name). Lets the assembler see channel canon and story entities uniformly, with no
// version fork — old channels resolve, just with a thin (name-only) description until re-derived.
export function normalizeCanon(
  wb: Partial<Pick<WorldBible, 'persistentEntities' | 'canonLocations' | 'canonObjects'>>,
): BibleEntity[] {
  const out = new Map<string, BibleEntity>()
  // v1 shape first: name-only, so description === name (a thin but valid entity). Old channels resolve
  // unchanged, just without a real depictable description until they're re-derived.
  for (const name of wb.canonLocations ?? []) out.set(slug(name), { id: slug(name), kind: 'location', description: name })
  for (const name of wb.canonObjects ?? []) out.set(slug(name), { id: slug(name), kind: 'object', description: name })
  // v2 shape LAST so it wins on id collision: it carries a real description and a real kind, and it is
  // the only shape that can express a recurring CHARACTER.
  for (const e of wb.persistentEntities ?? []) out.set(slug(e.name), { id: slug(e.name), kind: e.kind, description: e.description })
  return [...out.values()]
}

// Lenient single-reference resolution. The continuity guarantee hinges on the scene LLM reproducing
// ids, and it won't always be byte-exact — so: (1) exact slug match, else (2) UNAMBIGUOUS containment
// either direction ("mirror" ↔ "cracked-mirror"), guarded so two doors don't both match "door".
export function resolveEntityRef(bible: StoryBible, ref: string): BibleEntity | null {
  const t = slug(ref)
  if (!t) return null
  const exact = bible.entities.find((e) => slug(e.id) === t)
  if (exact) return exact
  const partial = bible.entities.filter((e) => {
    const s = slug(e.id)
    return s.includes(t) || t.includes(s)
  })
  return partial.length === 1 ? partial[0]! : null
}

// Resolve the final per-reel bible from channel canon + the analyzer's story extraction. The reel bible is
// exactly what the analyzer extracted for THIS story (it reuses canon ids where a canon entity actually
// appears, so shared ids stay consistent across reels). We deliberately do NOT append canon entities the
// story never features: an unreferenced channel location/object gets no reference plate and no scene points
// at it, so appending it only bloats the bible with dead settings. If the analyzer produced nothing (analysis
// failed), fall back to the full canon so the reel still carries its channel-recurring anchors.
export function mergeBible(canon: BibleEntity[], analyzed: StoryBible): StoryBible {
  if (analyzed.entities.length === 0) return { ...analyzed, entities: [...canon] }
  const bySlug = new Map<string, BibleEntity>()
  for (const e of analyzed.entities) bySlug.set(slug(e.id), e) // analyzer wins (it saw the story); canon-only ids dropped
  return { ...analyzed, entities: [...bySlug.values()] }
}

export interface EntityRefs {
  primaryEntity: string | null
  supportingEntities: string[]
  // Per-entity appearance id selected by the story's anchored temporal context. Missing = base appearance.
  appearanceByEntity?: Record<string, string>
}

export interface ResolvedEntities {
  // Resolved entities in splice order: primary first, then supporting. Deduped by entity id (an entity
  // referenced as both primary and supporting appears once, keeping the primary slot).
  resolved: BibleEntity[]
  // Reference strings that matched no entity — surfaced as scene-QA notes so a continuity miss is
  // observable, never silent.
  unresolved: string[]
}

export function resolveEntities(bible: StoryBible, refs: EntityRefs): ResolvedEntities {
  const ordered = [...(refs.primaryEntity ? [refs.primaryEntity] : []), ...refs.supportingEntities]
  const resolved: BibleEntity[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()
  for (const ref of ordered) {
    const entity = resolveEntityRef(bible, ref)
    if (!entity) {
      unresolved.push(ref)
      continue
    }
    if (seen.has(entity.id)) continue
    seen.add(entity.id)
    resolved.push(entity)
  }
  return { resolved, unresolved }
}

// Resolve one character appearance by slug-tolerant id. Kept separate from resolveEntityRef because an
// appearance is never a cast member in its own right — it can only be reached through its parent identity.
export function resolveCharacterAppearance(entity: BibleEntity, appearanceId: string | null | undefined): CharacterAppearance | null {
  const target = appearanceId ? slug(appearanceId) : ''
  if (!target) return null
  return entity.appearances?.find((a) => slug(a.id) === target) ?? null
}

// Materialize the render-facing entity for one scene. All semantic/safety fields remain on the parent;
// only the frozen look + plate/provenance are replaced. Returning a BibleEntity keeps every existing
// assembler/provider boundary unchanged while guaranteeing base and variant are never injected together.
export function entityAtAppearance(entity: BibleEntity, appearanceId: string | null | undefined): BibleEntity {
  const appearance = resolveCharacterAppearance(entity, appearanceId)
  if (!appearance) return entity
  return {
    ...entity,
    description: appearance.description,
    referenceImageKey: appearance.referenceImageKey,
    referenceOrigin: appearance.referenceOrigin,
  }
}

export function appearanceIdForEntity(bindings: Record<string, string> | null | undefined, entity: BibleEntity): string | undefined {
  if (!bindings) return undefined
  const target = slug(entity.id)
  const hit = Object.entries(bindings).find(([entityRef]) => slug(entityRef) === target)
  return hit?.[1]
}

// The appearance binding for a scene is inherited from the journey leg covering the START of its narration
// span. A cut that crosses a real temporal boundary is already a storyboard error: scenes must cut on time
// shifts. Missing/legacy journeys return {}, preserving the base appearance path.
export function appearanceBindingsForScene(
  bible: StoryBible,
  fullNarration: string,
  sceneNarration: string,
): Record<string, string> {
  const sceneAt = fullNarration.indexOf(sceneNarration.trim())
  if (sceneAt < 0) return {}
  for (const leg of bible.continuity.journey) {
    const span = leg.span.trim()
    if (!span) continue
    const legAt = fullNarration.indexOf(span)
    if (legAt >= 0 && sceneAt >= legAt && sceneAt < legAt + span.length) return leg.appearanceByEntity ?? {}
  }
  return {}
}

// Validate analyzer-authored bindings before they become deterministic render input. These are reference
// integrity checks, not taste: a binding must name one real character variant and only for a character
// present in that anchored leg. Empty output means the default/base appearance is unambiguous.
export function validateAppearanceBindings(bible: StoryBible): string[] {
  const issues: string[] = []
  const entityById = new Map(bible.entities.map((e) => [slug(e.id), e]))
  for (const entity of bible.entities) {
    if (entity.kind !== 'character' && (entity.appearances?.length ?? 0) > 0) {
      issues.push(`Entity "${entity.id}" is ${entity.kind} but declares character appearance variants.`)
    }
    const seen = new Set<string>()
    for (const appearance of entity.appearances ?? []) {
      const id = slug(appearance.id)
      if (seen.has(id)) issues.push(`Entity "${entity.id}" repeats appearance id "${appearance.id}".`)
      seen.add(id)
    }
  }
  bible.continuity.journey.forEach((leg, i) => {
    const present = new Set((leg.present ?? []).map(slug))
    for (const [entityRef, appearanceRef] of Object.entries(leg.appearanceByEntity ?? {})) {
      const entity = entityById.get(slug(entityRef))
      if (!entity) {
        issues.push(`Journey leg ${i + 1} binds appearance for unknown entity "${entityRef}".`)
        continue
      }
      if (entity.kind !== 'character') issues.push(`Journey leg ${i + 1} binds an appearance to non-character "${entity.id}".`)
      if (!present.has(slug(entity.id))) issues.push(`Journey leg ${i + 1} binds "${entity.id}" but that character is not present in the leg.`)
      if (!resolveCharacterAppearance(entity, appearanceRef)) {
        issues.push(`Journey leg ${i + 1} binds "${entity.id}" to unknown appearance "${appearanceRef}".`)
      }
    }
  })
  return issues
}

// ── Operator overrides ────────────────────────────────────────────────────────
// The operator (PM) can correct an entity the analyzer guessed wrong — the human's truth, not the machine's.

export interface BibleEdit {
  entityId: string
  description?: string | undefined // new canonical description (trimmed, spliced verbatim). Marks the entity locked.
  drop?: boolean | undefined // remove this entity from the bible entirely
}

// Apply one operator edit to a bible, returning a NEW bible (pure). A description edit replaces the text,
// marks the entity `locked` (so re-derivation can't clobber it), and clears its reference plate key so the
// caller re-mints the plate from the new description. A drop removes the entity. Slug-tolerant id match.
export function applyBibleEdit(bible: StoryBible, edit: BibleEdit): StoryBible {
  const target = slug(edit.entityId)
  if (edit.drop) {
    return { ...bible, entities: bible.entities.filter((e) => slug(e.id) !== target) }
  }
  const desc = edit.description?.trim()
  if (!desc) return bible // nothing to apply
  return {
    ...bible,
    entities: bible.entities.map((e) =>
      slug(e.id) === target ? { ...e, description: desc, locked: true, referenceImageKey: undefined } : e,
    ),
  }
}

// Carry operator-locked entities from a PRIOR bible into a freshly re-derived one, so re-running the
// analyzer never overwrites a human correction. A locked prior entity replaces the fresh entity of the
// same id (or is appended if the fresh derivation dropped it). Fresh, unlocked entities pass through.
export function preserveLockedEntities(fresh: StoryBible, prior: StoryBible | null | undefined): StoryBible {
  // A minted plate makes the base description an established visual fact. Prompt-version re-analysis may
  // discover new timeline states, but it must not silently redesign the already-rendered base character,
  // place, or object. Match leniently because a better analyzer may refine an id ("balete-tree" →
  // "balete-tree-san-esteban") while still referring to the same unambiguous entity.
  const established = (prior?.entities ?? []).filter((entity) => entity.referenceImageKey)
  const withEstablishedLooks = fresh.entities.map((entity) => {
    const previous = resolveEntityRef({ ...fresh, entities: established }, entity.id)
    if (!previous || previous.kind !== entity.kind) return entity
    const priorAppearances = new Map((previous.appearances ?? []).map((appearance) => [slug(appearance.id), appearance]))
    const appearances = (entity.appearances ?? []).map((appearance) => {
      const old = priorAppearances.get(slug(appearance.id))
      return old?.referenceImageKey ? { ...appearance, ...old } : appearance
    })
    return {
      ...entity,
      description: previous.description,
      referenceImageKey: previous.referenceImageKey,
      ...(previous.referenceOrigin ? { referenceOrigin: previous.referenceOrigin } : {}),
      ...(previous.depiction ? { depiction: previous.depiction } : {}),
      ...(appearances.length ? { appearances } : {}),
    }
  })

  const locked = (prior?.entities ?? []).filter((e) => e.locked)
  if (locked.length === 0) return { ...fresh, entities: withEstablishedLooks }
  const lockedBySlug = new Map(locked.map((e) => [slug(e.id), e]))
  const merged = withEstablishedLooks.map((e) => lockedBySlug.get(slug(e.id)) ?? e)
  const present = new Set(merged.map((e) => slug(e.id)))
  for (const e of locked) if (!present.has(slug(e.id))) merged.push(e)
  return { ...fresh, entities: merged }
}

// An entity is DEPICTABLE only if its description adds visual information beyond its bare name/id. Channel
// canon stores entities as NAMES (description === name, e.g. "reloh sa telepono"), which an image model
// renders as literal TEXT — it prints the words instead of drawing the thing. Such label-only entities
// carry no usable visual, so they're dropped from splicing, plating, and the cast list; the scene's own
// prose covers them. (The real fix is structured channel canon with real descriptions — deferred.)
export function isDepictableEntity(e: BibleEntity): boolean {
  const desc = e.description.trim()
  return desc.length > 0 && slug(desc) !== slug(e.id)
}

// The entities that apply to a scene, in splice order. This resolver does NOT decide narrator visibility —
// generate_images applies the first-person VISIBILITY rule upstream (strip the narrator from the refs on a
// POV beat, re-add her only when her face is on-screen in a reflective surface) BEFORE calling this, so by
// the time refs reach here the narrator is present only on beats where she should genuinely be spliced. That
// keeps her out of pure-POV shots as a full front-facing figure while still locking her look for a reflection
// payoff. Only depictability filters here (label-only entities excluded — see isDepictableEntity).
export function sceneEntities(bible: StoryBible, refs: EntityRefs): BibleEntity[] {
  const { resolved } = resolveEntities(bible, refs)
  return resolved
    .map((entity) => entityAtAppearance(entity, appearanceIdForEntity(refs.appearanceByEntity, entity)))
    .filter(isDepictableEntity)
}

// Validate the JOURNEY as a state machine over adjacent legs (not each leg in isolation) — catch the
// narrator "teleporting". CONSERVATIVE by design: flag only the physically-IMPOSSIBLE, never stylistic
// compression. A legitimate cut (approaching → inside, with no explicit "entering" leg) is fine and must
// NOT be flagged. Returns human-readable issues (empty = OK); the analyzer feeds them into one repair round.
export function validateJourneyTransitions(journey: JourneyLeg[]): string[] {
  const issues: string[] = []
  for (let i = 1; i < journey.length; i++) {
    const prev = journey[i - 1]!
    const cur = journey[i]!
    // The one clearly-impossible case: cut straight from INSIDE one place to INSIDE a DIFFERENT place with
    // no leaving/transit leg between them. In a continuous narration that means a movement beat was skipped.
    // Requires BOTH legs explicitly `inside` + both entity-located + different → rare to hit legitimately.
    if (
      prev.occupancyState === 'inside' &&
      cur.occupancyState === 'inside' &&
      prev.locationEntityId &&
      cur.locationEntityId &&
      prev.locationEntityId !== cur.locationEntityId
    ) {
      issues.push(
        `Journey leg ${i + 1} jumps straight from INSIDE "${prev.locationEntityId}" to INSIDE "${cur.locationEntityId}" with no leaving/transit leg between — the narrator can't teleport. Insert the movement (a "leaving ${prev.locationEntityId}" leg and/or a transit leg with locationEntityId=null) between them.`,
      )
    }
  }
  return issues
}

// ── Archival fulfilment (specs/depictive-fidelity.md) ────────────────────────────────────────────
/**
 * Which archival subject — if any — this scene should be FULFILLED by, i.e. replaced with a genuine
 * photograph instead of a generated frame. Null means generate the scene (with any archival identity
 * withheld and scrubbed).
 *
 * Two conditions, and the second was taught by live data:
 *
 * 1. EXACTLY ONE archival subject. Per-subject lead-image sourcing cannot yield a photograph containing two
 *    specific people, and compositing them is forbidden — a composite of two real people is a fabricated
 *    record. Two or more → representative staging.
 * 2. That subject is the scene's PRIMARY one, i.e. its depiction is what the beat is about.
 *
 * Condition 2 is NOT a retreat to keying media mode off `primaryEntity` — DETECTION still scans the whole
 * entity set, because a real person can matter without being primary. It governs FULFILMENT only. On the
 * 2026-08-12 Crossroads reel, two scenes whose subject was Duchamp's urinal listed Duchamp as merely
 * supporting; fulfilling them with a portrait of him would have discarded the actual subject of the shot.
 * Presence is a reason to WITHHOLD an identity; it is not a reason to make the shot about that person.
 */
export function archivalShotTarget(
  archivalEntities: readonly BibleEntity[],
  primaryEntityId: string | null | undefined,
): BibleEntity | null {
  if (archivalEntities.length !== 1 || !primaryEntityId) return null
  const only = archivalEntities[0]!
  return slug(only.id) === slug(primaryEntityId) ? only : null
}
