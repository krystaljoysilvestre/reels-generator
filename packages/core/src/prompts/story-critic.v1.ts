// story-critic.v1 — comparative ranking of best-of-N story candidates against a taste rubric.
// Versioned source code. Bump the version string on any prompt-affecting edit.

import { z } from 'zod'

export const STORY_CRITIC_V1_VERSION = 'story-critic.v1'

// Fallback rubric when the channel has no operator-edited tasteRubric yet. Hand-written for
// narrated short-form horror; terse and checkable on purpose — the critic scores against these
// lines, so vague virtues ("engaging", "well-paced") are useless here.
export const DEFAULT_TASTE_RUBRIC = `HOOK
- The first spoken line opens a curiosity gap or lands mid-tension; it names something concrete, not a mood.
- A viewer who hears only the first 3 seconds must need the answer to a question.
- Never opens with setting description, time-of-day, or a greeting.

BUILD
- Escalation happens through specific sensory details (a sound, an object out of place, a wrong reflection) — never through adjectives ("creepy", "terrifying").
- Ordinary life is textured and believable before anything unusual happens.
- Each beat raises the cost of ignoring the wrongness; no beat repeats the previous one at the same intensity.

PAYOFF
- The peak recontextualizes something planted earlier — a detail the viewer heard but misread.
- The ending lands within seconds of the peak; no epilogue that bleeds tension.
- Predictable-twist patterns are disqualifying: narrator-was-the-creature, it-was-a-dream, it-was-just-the-wind.

VOICE
- Reads as SPOKEN confession, not written prose: short lines, hesitations, one beat per line.
- Intimate 2AM register — telling a close friend, not narrating a documentary.

WORLD
- Grounded in believable local texture (places, habits, objects people actually have); nothing generic-western pasted in.

NEVER
- A hook that could open any story ("Something strange happened to me").
- Explaining the scare after it lands.
- More than two beats of setup before the first wrong detail.`

export const CriticVerdictSchema = z.object({
  label: z.string().min(1),          // the candidate's presentation label ('A', 'B', …)
  scores: z.object({
    hook: z.number().min(0).max(10),
    build: z.number().min(0).max(10),
    payoff: z.number().min(0).max(10),
    voice: z.number().min(0).max(10),
    freshness: z.number().min(0).max(10),
  }),
  total: z.number(),
  note: z.string(),                  // one-line judgment, shown to the operator
})
export type CriticVerdict = z.infer<typeof CriticVerdictSchema>

export const StoryCriticSchema = z.object({
  verdicts: z.array(CriticVerdictSchema).min(1),
  winnerLabel: z.string().min(1),
  rationale: z.string().min(1),      // 1–3 sentences: why the winner beat the rest
})
export type StoryCriticOutput = z.infer<typeof StoryCriticSchema>

export interface StoryCriticVars {
  channelName: string
  nicheDescription: string
  tasteRubric: string                // channel.tasteRubric ?? DEFAULT_TASTE_RUBRIC
  targetSeconds: number
  operatorFeedback?: string | undefined  // this reel's latest rejection (regeneration round)
  candidatesBlock: string            // pre-formatted, shuffled, labeled candidates
}

export function buildStoryCriticPrompt(v: StoryCriticVars): { system: string; userMessage: string } {
  const system = `You are the taste editor for "${v.channelName}", a short-form video channel.
Niche: ${v.nicheDescription}

Several writers drafted the same ~${v.targetSeconds}-second reel script independently. Rank the drafts against the channel's rubric and pick exactly ONE winner.

Rules:
- Judge ONLY against the rubric. Your personal preferences do not exist.
- Score every candidate on every axis, 0–10, before choosing. The winner is the draft a scroll-happy viewer is least able to swipe away from — not the most "literary" one.
- Candidates are presented in RANDOM order. Position carries no information; do not favor early or late entries.
- Be harsh. A 7+ on any axis must be earned by something you can point to in the text. Reserve 9–10 for lines you'd quote.
- The note per candidate is one blunt sentence an editor would say out loud.`

  const userMessage = `RUBRIC — this channel's bar:
${v.tasteRubric}
${
    v.operatorFeedback
      ? `\nOPERATOR FEEDBACK — the previous draft for this exact reel was rejected: "${v.operatorFeedback}". A candidate exhibiting the same flaw CANNOT win, regardless of its other scores.\n`
      : ''
  }
CANDIDATES (random order):
${v.candidatesBlock}

OUTPUT (JSON only):
{
  "verdicts": [
    { "label": "A", "scores": { "hook": 0, "build": 0, "payoff": 0, "voice": 0, "freshness": 0 }, "total": 0, "note": "" }
  ],
  "winnerLabel": "",
  "rationale": ""    // 1–3 sentences: what the winner does that the others don't
}`

  return { system, userMessage }
}
