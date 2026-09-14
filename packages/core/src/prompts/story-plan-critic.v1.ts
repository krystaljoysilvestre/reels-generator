// story-plan-critic.v1 — the PLAN GATE. Judges the committed plan (the IDEA, before any prose) for
// STRUCTURAL AGENCY: is the story driven by the protagonist's own costly choices? It runs BETWEEN the
// planner and the writer and never ships anything — a fail buys a plan-doctor repair (story-plan-doctor.v1),
// not a rejection. Distinct from story-critic.v2 (which judges FINISHED prose): this judges the plan.
//
// OPT-IN, NOT UNIVERSAL. Per the ratified universal-vs-cultural craft line, "agency vs. endurance" is a
// CULTURAL/channel-DNA choice, not universal craft — so this gate must never be imposed on every channel.
// generate-story only runs it when a channel/operator opts in (a channel whose drama IS agency-driven).
// The CHECKS here are genre-agnostic story physics; WHETHER to apply them is the channel's call.
//
// Validated as an inline probe (plan-judge.v0-probe, apps/worker/scripts/probe-plan-force.ts, 2026-07-20):
// calibrated + honest (passes real costly decisions, fails decoration), and predicts the final gate.
// Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

export const STORY_PLAN_CRITIC_V1_VERSION = `story-plan-critic.v1.1+${STORY_CONTEXT_VERSION}`

// Rich verdict: three sub-checks each carry EVIDENCE (a short quote + a restatement) — the anti-gaming
// mechanism (a plan can't pass on decision-verbs alone; the judge must restate the act as a concrete
// could-have-done-otherwise). `reason` is one blunt sentence that steers the doctor's repair.
export const PlanCriticSchema = z.object({
  pass: z.boolean(),
  decision: z.object({ pass: z.boolean(), evidence: z.string() }),
  chain: z.object({ pass: z.boolean(), evidence: z.string() }),
  causedEnding: z.object({ pass: z.boolean(), evidence: z.string() }),
  reason: z.string().min(1),
})
export type PlanCriticVerdict = z.infer<typeof PlanCriticSchema>

export interface PlanCriticVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  channelName: string
  nicheDescription: string
  // The writer-visible plan fields ONLY (mechanics/elements are stripped, same blindness as the Writer).
  plan: {
    premise: string
    conflict: string
    escalation: string
    twist: string
    ending: string
    emotionalDestination: string
    logline: string
  }
}

export function buildStoryPlanCriticPrompt(v: PlanCriticVars): { system: string; userMessage: string } {
  const system = `${v.creativeContext ? `${renderStoryCreativeContext(v.creativeContext)}\n\n` : ''}${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}\n\nYou are the PLAN GATE for the channel "${v.channelName}". Niche: ${v.nicheDescription}.
A planner has committed ONE idea for a story whose creator opted into structural-agency review. The narrator may be outside the events; judge the protagonist, not the narrator's grammatical person. No prose exists yet — you judge the IDEA.
You answer ONE question: does this plan have STRUCTURAL AGENCY — is the story driven by the protagonist's own costly choices? Yes or no.

Three checks. ALL must hold (pass=true only if all three sub-checks pass):
1. DECISION — the protagonist DECIDES something, with a live alternative and a felt cost: the plan says what choosing costs and what they could have done instead. Realizing, noticing, receiving, discovering, enduring, being told, or a letter/message/reveal arriving are things that happen TO a person — none is a decision.
2. CHAIN — the escalation moves BECAUSE of what the protagonist chooses (therefore / but), each step raising the cost — not a sequence of events happening to a passive witness, and not a single feeling intensifying ("and then... and then").
3. CAUSED ENDING — the ending is the CONSEQUENCE of the protagonist's decision: had they chosen otherwise, the ending would differ. An ending delivered by a reveal, a coincidence, or another character's act regardless of anything the protagonist did, fails. (A reveal may TRIGGER the story; it must not RESOLVE it.)

HOW TO JUDGE — this is the important part:
- Judge STRUCTURE, not vocabulary. The words "decides", "chooses", "refuses" prove nothing by themselves — a plan written to please this judge sprinkles decision verbs over a passive spine, and that plan must FAIL.
- For each check, in "evidence": quote the plan's own clause, THEN restate the act in your own words as a specific could-have-done-otherwise act (e.g. "she hands the envelope over instead of enrolling herself, losing three years of savings"). If you cannot restate it as a specific act with a specific alternative and cost, it is decoration — fail that check.
- When genuinely borderline, FAIL. A borderline decision at plan level becomes no decision in the prose; the repair should clarify its structure before prose is written.
- You do NOT fix or rewrite the plan. Pass or fail. "reason" is ONE blunt sentence naming the passive mechanism in THIS plan (it steers the repair).`

  const view = {
    premise: v.plan.premise,
    conflict: v.plan.conflict,
    escalation: v.plan.escalation,
    twist: v.plan.twist,
    ending: v.plan.ending,
    emotionalDestination: v.plan.emotionalDestination,
    logline: v.plan.logline,
  }
  const userMessage = `PLAN:\n${JSON.stringify(view, null, 2)}\n\nKeep each "evidence" to ONE short sentence (≤25 words: a short quote + your restatement) and "reason" to one sentence. OUTPUT (JSON only):\n{ "pass": false, "decision": { "pass": false, "evidence": "" }, "chain": { "pass": false, "evidence": "" }, "causedEnding": { "pass": false, "evidence": "" }, "reason": "" }`

  return { system, userMessage }
}
