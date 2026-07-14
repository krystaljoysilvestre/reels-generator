// Pure resolution + normalization for the Story Bible symbol table (see specs/story-bible.md).
// No LLM, no IO — used by the assembler (to expand references into prompts) and by the scene-QA
// step (to flag references that resolve to nothing).

import type { WorldBible } from '../types/channel.js'
import type { BibleEntity, StoryBible, JourneyLeg } from '../types/story-bible.js'

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
export function normalizeCanon(wb: Pick<WorldBible, 'canonLocations' | 'canonObjects'>): BibleEntity[] {
  return [
    ...wb.canonLocations.map((name): BibleEntity => ({ id: slug(name), kind: 'location', description: name })),
    ...wb.canonObjects.map((name): BibleEntity => ({ id: slug(name), kind: 'object', description: name })),
  ]
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
  const locked = (prior?.entities ?? []).filter((e) => e.locked)
  if (locked.length === 0) return fresh
  const lockedBySlug = new Map(locked.map((e) => [slug(e.id), e]))
  const merged = fresh.entities.map((e) => lockedBySlug.get(slug(e.id)) ?? e)
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

// The entities that apply to a scene, in splice order. The first-person narrator is NO LONGER suppressed:
// she's the main character and needs a reference plate + conditioning so her face stays consistent when
// she IS shown (a reflection, her back, her hands) — suppressing her left her unanchored and drifting to a
// random figure. Keeping her out of pure-POV shots as a full front-facing figure is now the breakdown's job
// (the scenes.v1 POV rules compose her as a reflection/back/partial). Only depictability filters here
// (label-only entities excluded — see isDepictableEntity).
export function sceneEntities(bible: StoryBible, refs: EntityRefs): BibleEntity[] {
  const { resolved } = resolveEntities(bible, refs)
  return resolved.filter(isDepictableEntity)
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
