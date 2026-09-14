// story-plan-doctor.v1 — the FORCE half of plan-level judge-and-force. When the plan gate
// (story-plan-critic.v1) fails a plan for lack of structural agency, the doctor REPAIRS that specific
// plan in place — keeps the world/relationships/texture, surgically fixes only the agency the judge
// flagged — instead of re-rolling a fresh premise. (A bare planner re-roll does NOT converge: it
// re-satisfices back to the passive attractor. A repair converges — probe-plan-force.ts, 2026-07-20.)
//
// LEAN is load-bearing: the doctor builds the plan around ONE central choice + its consequence (few,
// big beats). A beat-dense repair produced flowing-agency-in-the-plan but a CHOPPY short story (no room
// for connective tissue at ~75s); leaning it fixed the flow at the source (RUN 1 of the same probe).
//
// Returns only the writer-visible plan fields; the caller carries elements/mechanics/register over from
// the original plan (a repair, not a re-composition). Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

export const STORY_PLAN_DOCTOR_V1_VERSION = `story-plan-doctor.v1.1+${STORY_CONTEXT_VERSION}`

export const PlanDoctorSchema = z.object({
  premise: z.string().min(1),
  conflict: z.string().min(1),
  escalation: z.string().min(1),
  twist: z.string().min(1),
  ending: z.string().min(1),
  emotionalDestination: z.string().min(1),
  logline: z.string().min(1),
})
export type DoctoredPlan = z.infer<typeof PlanDoctorSchema>

export interface PlanDoctorVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  channelName: string
  nicheDescription: string
  targetSeconds: number
  plan: {
    premise: string
    conflict: string
    escalation: string
    twist: string
    ending: string
    emotionalDestination: string
    logline: string
  }
  reason: string // the plan gate's one-sentence diagnosis — fix exactly this
}

export function buildStoryPlanDoctorPrompt(v: PlanDoctorVars): { system: string; userMessage: string } {
  const system = `${v.creativeContext ? `${renderStoryCreativeContext(v.creativeContext)}\n\n` : ''}${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}\n\nYou are a STORY-PLAN DOCTOR for the channel "${v.channelName}". Niche: ${v.nicheDescription}.
You are handed a plan that FAILED a structural-agency check, and the exact reason it failed. REPAIR this plan — do not replace it. Keep what works (the world, the relationships, the specific texture, the emotional territory it was reaching for) and change as little as possible, but fix the agency so ALL THREE now hold:
1. DECISION — the protagonist makes ONE clear ACTIVE CHOICE with a live alternative and a real cost they themselves pay (name the alternative and the cost).
2. CHAIN — the escalation is CAUSED by that choice and its consequence (therefore / but) — not events happening to a witness, not a feeling intensifying.
3. CAUSED ENDING — the ending is the DIRECT CONSEQUENCE of the decision; had they chosen otherwise it would differ. NEVER resolve on a reveal, a coincidence, a resurfacing memory, an object's disclosure, or another character's act. (A reveal may TRIGGER the story; it must not RESOLVE it.)
KEEP IT LEAN — this becomes a ~${v.targetSeconds}-second story in the creator's chosen perspective and form. Build the plan around ONE central choice and its consequence: use only the developments needed to earn that consequence within the duration, rather than a dense chain of micro-beats. A spare escalation the writer can breathe into and make FLOW beats a crammed one every time. Write the escalation as a few clear sentences, not a paragraph of stacked turns.
Preserve the chosen perspective and story form; do not turn a costly choice into a tidy moral. Return the full repaired plan.`

  const view = {
    premise: v.plan.premise,
    conflict: v.plan.conflict,
    escalation: v.plan.escalation,
    twist: v.plan.twist,
    ending: v.plan.ending,
    emotionalDestination: v.plan.emotionalDestination,
    logline: v.plan.logline,
  }
  const userMessage = `FAILING PLAN:\n${JSON.stringify(view, null, 2)}\n\nWHY IT FAILED (fix exactly this):\n${v.reason}\n\nReturn the repaired plan as JSON with the same fields.`

  return { system, userMessage }
}
