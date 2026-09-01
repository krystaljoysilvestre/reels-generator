import { z } from 'zod'
import { VisualTruthViolationSchema } from './scene-depiction-critic.v1.js'

export const VISUAL_TRUTH_CRITIC_V1_VERSION = 'visual-truth-critic.v1.0'

const StatusSchema = z.enum(['supported', 'not_applicable', 'unsupported'])
export const VisualTruthVerdictSchema = z.object({
  scenes: z.array(z.object({
    idx: z.number().int(),
    checks: z.object({
      eventRecord: StatusSchema,
      venueIdentity: StatusSchema,
      chronology: StatusSchema,
      modality: StatusSchema,
      identityState: StatusSchema,
      sourceUse: StatusSchema,
      unsupportedSpecificity: StatusSchema,
    }),
    violations: z.array(VisualTruthViolationSchema).default([]),
    reasons: z.array(z.string()).max(7).default([]),
  })),
})

export interface VisualTruthCriticVars {
  evidenceFacts?: unknown
  bibleEntities?: unknown
  journey?: unknown
  scenes: {
    idx: number
    narrationText: string
    imagePrompt: string
    depictionBasis: 'source' | 'reconstruction' | 'representative' | 'conceptual'
    primaryEntity?: string | null
    supportingEntities?: string[]
    sourcePresentationEntity?: string | null
    appearanceByEntity?: Record<string, string>
  }[]
}

export function buildVisualTruthCriticPrompt(v: VisualTruthCriticVars): { system: string; userMessage: string } {
  const system = `You are the final VISUAL TRUTH verifier for a factual storyboard. You are not an editor, art director, or depiction critic. Do not judge beauty, clarity, drama, or whether the whole narration is understandable. Reject only when the proposed pixels would positively assert something the supplied narration/evidence/identity anchors do not support.

Use ONLY supplied inputs. Outside knowledge is forbidden, including in reasons. Plausibility is not evidence.

Audit every scene independently:
- eventRecord: a supported outcome does not establish an exact meeting, conversation, handoff, pose, audience, ceremony, procedure, or interaction.
- venueIdentity: a narration that does not establish a place does not authorize a studio, showroom, office, gallery, hall, stage, pedestal, furnishings, architecture, signage, emblem, flags, or specific lighting environment. "Generic" invented venue detail is still unsupported.
- chronology: later/earlier publications, participants, settings, or object states cannot leak into this beat.
- modality: inference, claim, proposal, uncertainty, and counterfactual must not look like observed historical documentation.
- identityState: each exact identity must match its one bound event-time state; no second differently aged/oriented/marked/restored replica may appear unanchored.
- sourceUse: when the span asks viewers to see a photograph/page/document/artwork/map/evidence and a matching exact sourceAssetKey is supplied, basis must be source with that sourcePresentationEntity. A related later container is not a substitute for the earlier exact source when the beat is about the source's creation.
- unsupportedSpecificity: every other concrete visible factual detail must be in the supplied anchors.

Basis rules: source copies exact verified pixels; reconstruction permits only a specifically supported moment and context; representative must stay anonymous/non-identifying; conceptual must visibly remain interpretation, never historical documentation.

Omission and weak communication are not truth failures. Mark unsupported only when the frame ADDS or collapses a factual assertion. Any unsupported check must have its mapped violation and a short grounded reason.`

  const userMessage = `EVIDENCE FACTS:\n${JSON.stringify(v.evidenceFacts ?? null, null, 2)}\n\nSTORY BIBLE / VERIFIED SOURCES / STATES:\n${JSON.stringify(v.bibleEntities ?? null, null, 2)}\n\nCHRONOLOGY / JOURNEY:\n${JSON.stringify(v.journey ?? null, null, 2)}\n\nSCENES:\n${v.scenes.map((s) => `SCENE ${s.idx}\nspan: ${s.narrationText}\nbasis: ${s.depictionBasis}\nprimary: ${s.primaryEntity ?? 'null'}\nsupporting: ${JSON.stringify(s.supportingEntities ?? [])}\nsourcePresentationEntity: ${s.sourcePresentationEntity ?? 'null'}\nappearanceByEntity: ${JSON.stringify(s.appearanceByEntity ?? {})}\nproposed pixels: ${s.imagePrompt}`).join('\n\n')}\n\nReturn JSON only. Include reasons only for unsupported checks:\n{ "scenes": [ { "idx": 1, "checks": { "eventRecord": "supported", "venueIdentity": "unsupported", "chronology": "supported", "modality": "supported", "identityState": "supported", "sourceUse": "supported", "unsupportedSpecificity": "supported" }, "violations": ["invented_venue_identity"], "reasons": ["The proposed studio is absent from the supplied anchors."] } ] }`

  return { system, userMessage }
}
