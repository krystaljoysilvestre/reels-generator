import {
  DepictionRoutingSchema,
  allowsRealWorldEntityPlates,
  depictionModeForHuman,
  type DepictionRouting,
  type SourcePolicy,
} from '@reels/core'
import { llmCall, resolveSubjectIdentity, wikidataPersonFacts } from '@reels/providers'
import {
  buildEntitySourceDecidePrompt,
  EntitySourceDecisionSchema,
  ENTITY_SOURCE_V1_VERSION,
} from '../prompts-bridge.js'

const DEPICTION_MODEL = 'claude-haiku-4-5-20251001'

const entityName = (id: string) =>
  id.split('-').map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word)).join(' ')

/**
 * Resolve HOW a Story Bible entity may be depicted before scene planning. This call classifies identity and
 * permission only; image search and verification remain lazy until the board proves the entity is visible.
 * Every paid call returns through costCents so the caller can record it in one runStep ledger entry.
 */
export async function routeDepiction(
  entity: { id: string; kind: 'character' | 'location' | 'object'; description: string },
  policy: SourcePolicy,
  region: string | undefined,
  narrationEvidence?: string,
): Promise<{ routing: DepictionRouting; costCents: number }> {
  const generated = (
    eligibilityReason: DepictionRouting['eligibilityReason'],
    subjectClass: DepictionRouting['subjectClass'] = 'generic',
  ) => DepictionRoutingSchema.parse({
    subjectClass,
    depictionMode: 'generated',
    eligibilityReason,
    query: '',
    classifierVersion: ENTITY_SOURCE_V1_VERSION,
  })
  let costCents = 0
  try {
    if (!allowsRealWorldEntityPlates(policy)) return { routing: generated('not_permitted'), costCents }

    const name = entityName(entity.id)
    const prompt = buildEntitySourceDecidePrompt(entity.kind, name, entity.description, region, narrationEvidence)
    const decide = await llmCall({
      templateVersion: ENTITY_SOURCE_V1_VERSION,
      schema: EntitySourceDecisionSchema,
      provider: 'anthropic',
      model: DEPICTION_MODEL,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.userMessage }],
    })
    costCents += decide.costCents
    const { subjectClass } = decide.data
    const query = (decide.data.query ?? '').trim()

    if (subjectClass === 'fictional') return { routing: generated('fictional_subject', 'fictional'), costCents }
    if (subjectClass === 'generic') return { routing: generated('generic_subject', 'generic'), costCents }
    if (!decide.data.sourceable || !query) return { routing: generated('generic_subject', subjectClass), costCents }

    if (subjectClass !== 'human') {
      return {
        routing: DepictionRoutingSchema.parse({
          subjectClass,
          depictionMode: 'reference_plate',
          eligibilityReason: 'real_subject',
          query,
          classifierVersion: ENTITY_SOURCE_V1_VERSION,
        }),
        costCents,
      }
    }

    if (policy.realPeople === 'none') return { routing: generated('not_permitted', 'human'), costCents }

    const identity = await resolveSubjectIdentity(query)
    const facts = identity ? await wikidataPersonFacts(identity.wikibaseItem) : null
    if (identity && facts && !facts.isHuman) {
      console.warn(
        `[depiction-routing] "${entity.id}": query "${query}" resolved to ${identity.wikibaseItem} (${identity.title}), which is not a person — identity unverified`,
      )
    }
    const decided = depictionModeForHuman({
      wikibaseItem: facts?.isHuman ? identity!.wikibaseItem : null,
      deathYear: facts?.deathYear ?? null,
      currentYear: new Date().getUTCFullYear(),
    })
    return {
      routing: DepictionRoutingSchema.parse({
        subjectClass: 'human',
        ...decided,
        query: decided.depictionMode === 'generated' ? '' : query,
        classifierVersion: ENTITY_SOURCE_V1_VERSION,
      }),
      costCents,
    }
  } catch (error) {
    console.warn(
      `[depiction-routing] routing failed for "${entity.id}" → generated: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { routing: generated('generic_subject'), costCents }
  }
}
