// entity-binding-critic.v1 — pre-image semantic coverage for verified real identities.
//
// A lexical detector was measured and rejected on Crossroads: "urinal" described both generic shop stock
// and the titled artwork, so matching nouns would have transferred the signature/plinth into the wrong beat.
// This critic judges the director's semantic choice before image spend. Its structured verdict may repair
// identity tags/state selections only; it never rewrites the shot or otherwise authors creative intent.
import { z } from 'zod'

export const ENTITY_BINDING_CRITIC_V1_VERSION = 'entity-binding-critic.v1.4'

const DepictedIdentityBindingSchema = z.object({
  entityId: z.string().min(1),
  stateId: z.string().nullable().default(null),
})

export const EntityBindingVerdictSchema = z.object({
  scenes: z.array(z.object({
    idx: z.number().int(),
    depictedBindings: z.array(DepictedIdentityBindingSchema).default([]),
    reason: z.string().default(''),
  })),
})

export interface EntityBindingCriticVars {
  entities: Array<{
    id: string
    description: string
    requiresVerifiedBinding: boolean
    appearances?: Array<{ id: string; description: string }> | undefined
  }>
  scenes: Array<{
    idx: number
    narrationText: string
    imagePrompt: string
  }>
}

export function buildEntityBindingCriticPrompt(v: EntityBindingCriticVars): { system: string; userMessage: string } {
  const system = `You are the VERIFIED IDENTITY CLASSIFIER for a storyboard. You determine which exact real subjects and story-time states each shot visibly depicts; deterministic code compares your classification with the scene tags.

This is semantic identity judgment, never keyword matching:
- A tag is required when the shot visibly depicts that exact named real subject. It is not required when the narration merely mentions it or the shot shows a generic member of the same category.
- "Depicts" includes the exact subject shown inside a photograph, printed page, screen, comparison, reconstruction, silhouette, display, or visual metaphor. If the frame means THAT real subject, its verified identity still anchors its recognizable form. A conceptual presentation is not permission to substitute a generic look.
- Resolve pronouns and generic nouns against the narration: when a span names Fountain and the shot shows "the urinal" as the object under discussion, that is Fountain unless the shot clearly establishes a different/generic example. When a span names The Blind Man and the shot shows its issue/page, that is the exact publication.
- A tagged subject is wrong when the frame depicts a precursor, replica, counterfactual, wrong-era version, destination not yet reached, or merely related person/place/object instead.
- When one physical identity changes state, keep its entity id and select the exact appearance state exposed below. Stable geometry may persist; state details must not leak across time.
- Judge only identity/state correctness. Camera, composition, lighting, visual style, and whether a subject should be shown are the director's creative choices.
- Never force coverage. A scene may correctly depict none of these entities.

The entity list also contains ordinary canonical identities for context. Classify ONLY entries with requiresVerifiedBinding=true.

For each scene, list EVERY visibly depicted requiresVerifiedBinding identity in depictedBindings, using its exact entityId and its exact non-default stateId when one applies (otherwise null). Judge from narration + visible shot content alone. You are not shown scene metadata, so your semantic answer cannot be biased by existing tags. Give one concise reason for the classification. You do not rewrite the scene.`

  const userMessage = `VERIFIED REAL IDENTITIES AND AVAILABLE STATES:
${JSON.stringify(v.entities, null, 2)}

SCENES:
${JSON.stringify(v.scenes.map((scene) => ({ idx: scene.idx, narrationText: scene.narrationText, imagePrompt: scene.imagePrompt })), null, 2)}

Return one verdict for every scene. OUTPUT (JSON only):
{ "scenes": [{ "idx": 1, "depictedBindings": [{ "entityId": "exact-id", "stateId": null }], "reason": "why these exact identities are or are not visible" }] }`

  return { system, userMessage }
}

export interface ReconciledIdentityTags {
  primaryEntity: string | null
  supportingEntities: string[]
  appearanceByEntity: Record<string, string>
}

export function verifiedIdentityBindingsMatch(
  scene: ReconciledIdentityTags,
  verifiedEntityIds: string[],
  depictedBindings: Array<{ entityId: string; stateId?: string | null | undefined }>,
): boolean {
  const key = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const canonicalByKey = new Map(verifiedEntityIds.map((id) => [key(id), id]))
  const expected = new Map<string, string | null>()
  for (const binding of depictedBindings) {
    const canonical = canonicalByKey.get(key(binding.entityId))
    if (canonical) expected.set(key(canonical), binding.stateId ? key(binding.stateId) : null)
  }
  const actualIds = new Set(
    [scene.primaryEntity, ...scene.supportingEntities]
      .filter((id): id is string => !!id && canonicalByKey.has(key(id)))
      .map(key),
  )
  if (actualIds.size !== expected.size || [...expected.keys()].some((id) => !actualIds.has(id))) return false
  for (const [entityId, expectedState] of expected) {
    const actualEntry = Object.entries(scene.appearanceByEntity).find(([id]) => key(id) === entityId)
    const actualState = actualEntry?.[1] ? key(actualEntry[1]) : null
    if (actualState !== expectedState) return false
  }
  return !Object.keys(scene.appearanceByEntity).some((id) => canonicalByKey.has(key(id)) && !expected.has(key(id)))
}

// A state selection is itself an explicit claim that this identity is visible. Make that claim structurally
// complete before semantic review; otherwise an orphaned state can survive while its source plate is absent.
export function tagVerifiedAppearanceBindings(
  scene: ReconciledIdentityTags,
  verifiedEntityIds: string[],
): ReconciledIdentityTags {
  const key = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const canonicalByKey = new Map(verifiedEntityIds.map((id) => [key(id), id]))
  const primaryKey = key(scene.primaryEntity ?? '')
  const supportingEntities = [...scene.supportingEntities]
  for (const entityRef of Object.keys(scene.appearanceByEntity)) {
    const canonical = canonicalByKey.get(key(entityRef))
    if (!canonical || key(canonical) === primaryKey || supportingEntities.some((id) => key(id) === key(canonical))) continue
    supportingEntities.push(canonical)
  }
  return { ...scene, supportingEntities }
}

// Apply a critic verdict without touching creative content. Only the audited identities are reconciled;
// all other canonical tags survive exactly as the director authored them.
export function reconcileVerifiedIdentityBindings(
  scene: ReconciledIdentityTags,
  verifiedEntityIds: string[],
  depictedBindings: Array<{ entityId: string; stateId?: string | null | undefined }>,
): ReconciledIdentityTags {
  const key = (value: string): string => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const canonicalByKey = new Map(verifiedEntityIds.map((id) => [key(id), id]))
  const isVerified = (id: string | null | undefined): boolean => !!id && canonicalByKey.has(key(id))
  const depicted = depictedBindings
    .map((binding) => ({ entityId: canonicalByKey.get(key(binding.entityId)), stateId: binding.stateId ?? null }))
    .filter((binding): binding is { entityId: string; stateId: string | null } => !!binding.entityId)

  const primaryWasVerified = isVerified(scene.primaryEntity)
  const primaryEntity = primaryWasVerified ? (depicted[0]?.entityId ?? null) : scene.primaryEntity
  const supportingEntities = scene.supportingEntities.filter((id) => !isVerified(id))
  for (const binding of depicted) {
    if (key(binding.entityId) !== key(primaryEntity ?? '') && !supportingEntities.some((id) => key(id) === key(binding.entityId))) {
      supportingEntities.push(binding.entityId)
    }
  }

  const appearanceByEntity = Object.fromEntries(
    Object.entries(scene.appearanceByEntity).filter(([id]) => !isVerified(id)),
  )
  for (const binding of depicted) {
    if (binding.stateId) appearanceByEntity[binding.entityId] = binding.stateId
  }
  return { primaryEntity, supportingEntities, appearanceByEntity }
}
