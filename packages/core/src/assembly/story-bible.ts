// Pure resolution + normalization for the Story Bible symbol table (see specs/story-bible.md).
// No LLM, no IO — used by the assembler (to expand references into prompts) and by the scene-QA
// step (to flag references that resolve to nothing).

import type { WorldBible } from '../types/channel.js'
import type { BibleEntity, StoryBible } from '../types/story-bible.js'

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

// Resolve the final per-reel bible from channel canon + the analyzer's story extraction. The analyzer
// is told to reuse canon ids, so for a shared id its (richer, possibly story-extended) entity WINS;
// canon entities the analyzer didn't mention are appended so a channel-recurring place keeps its look
// even when this story doesn't elaborate it. Continuity + constraints come from the analyzer.
export function mergeBible(canon: BibleEntity[], analyzed: StoryBible): StoryBible {
  const bySlug = new Map<string, BibleEntity>()
  for (const e of canon) bySlug.set(slug(e.id), e)
  for (const e of analyzed.entities) bySlug.set(slug(e.id), e) // analyzer wins on shared id
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
