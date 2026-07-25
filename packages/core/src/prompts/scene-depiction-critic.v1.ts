// scene-depiction-critic.v1 — the judge half of the DEPICTION GATE. Judges a scene breakdown for
// SEMANTIC FIDELITY: does each shot depict its narration span's load-bearing claim, or is it wallpaper
// (a shot that would board equally well under any other script on this topic)? Runs at breakdown, after
// the best roll is chosen; a fail buys a scene-depiction-doctor repair, never a re-roll of the board.
//
// This is the SECOND instance of the reusable judge → targeted-repair → re-judge gate pattern (the plan
// gate, story-plan-critic/doctor.v1, was the first). Write future gates (character/continuity/lighting)
// as copies of this shape; per the anti-abstraction rule, a shared Gate interface is earned when the
// THIRD gate lands, not before.
//
// Boundary: "depiction" here = does the shot depict its span's CLAIM. Distinct from real-places'
// "depictive fidelity" (= does a render match the real place) — see hypotheses/real-places.md.
// Evidence: the 2026-07-25 voiceover probe — boards scored 0/8, 1/7, 1/5 on load-bearing claims even with
// the informational genre grammar present; soft prompt guidance is satisficed, judgment is not
// (hypotheses/voiceover-perspective.md Phase 0). Scoped to informational media-genre boards today; the
// defect is genre-universal (a drama's "she saw the divorce papers" boarded as "woman at window" is the
// same failure) — widen only with genre evidence.
// Future dimensions, deliberately NOT judged yet: timing (a 0.8s teaching frame teaches nothing),
// legibility, camera focus — informational quality is narration + image + timing.
// Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'

export const SCENE_DEPICTION_CRITIC_V1_VERSION = 'scene-depiction-critic.v1.0'

// Per-scene verdict. `claim` is the anti-gaming device (mirrors the plan critic's evidence-restatement):
// the judge must restate what the span actually claims before judging the shot against it — a shot can't
// pass on topical vocabulary alone. `reason` (failing scenes) steers the doctor's repair.
export const SceneDepictionVerdictSchema = z.object({
  scenes: z.array(
    z.object({
      idx: z.number().int(), // 1-based position in the submitted list
      claim: z.string(), // the span's load-bearing claim, restated (noun/quantity/comparison/change)
      depicted: z.boolean(), // does the shot render THAT claim as something seen?
      interchangeable: z.boolean(), // would this shot board equally well under a different script on this topic?
      reason: z.string().default(''), // one blunt sentence for failing scenes — steers the doctor
    }),
  ),
})
export type SceneDepictionVerdict = z.infer<typeof SceneDepictionVerdictSchema>

export interface SceneDepictionCriticVars {
  nicheDescription: string
  genreCategory: string
  // Reel-wide embodiment: under 'voiceover', a shot that visually introduces a narrator/host figure fails
  // depiction outright (the durable judgment behind scene-qa's temporary lexical backstop).
  narratorPerspective?: string | undefined
  scenes: { idx: number; narrationText: string; imagePrompt: string; tier: string }[]
}

export function buildSceneDepictionCriticPrompt(v: SceneDepictionCriticVars): { system: string; userMessage: string } {
  const voiceoverClause =
    v.narratorPerspective === 'voiceover'
      ? `\n- This reel is VOICEOVER: the narrator is a voice above the story, never on screen. A shot that visually introduces a narrator, host, presenter, reporter, or any on-camera teller figure — by any word for it — FAILS depiction (reason: names the figure).`
      : ''

  const system = `You are the DEPICTION GATE for a short-form ${v.genreCategory} reel. Niche: ${v.nicheDescription}.
A director has boarded the narration into scenes. You answer ONE question per scene: does the shot DEPICT what its narration span actually claims — or is it wallpaper?

HOW TO JUDGE — this is the important part:
- First RESTATE the span's load-bearing claim in "claim": the specific noun, quantity, comparison, or change the span asserts (not its topic). "₱75 billion in taxes and 190,000 jobs" is a claim; "the economy" is a topic.
- "depicted" = the imagePrompt renders THAT claim as something SEEN — the thing itself, the quantity made physical, the comparison staged in frame, the change made visible. A viewer with the sound OFF should learn the claim from the shot. Judge SEMANTIC FIDELITY only — never prose style, entity naming, or cinematography quality.
- "interchangeable" = the wallpaper test: would this exact shot board equally well under a DIFFERENT script on the same broad topic? A skyline under an economics line, a generic celebration under a specific score — interchangeable, and interchangeable shots are almost never faithful.
- People-free conceptual imagery, abstract data-visualization forms, macro object shots, and environment shots are ALL valid ways to depict a claim — there are no required shot types. Judge what the shot teaches, not what kind of shot it is.
- Judge structure, not vocabulary: a shot that name-drops the span's nouns as background set-dressing while the frame is generic scenery has not depicted the claim.${voiceoverClause}
- When evidence is insufficient, FAIL. If you cannot point at the element of the shot that carries the claim, it is not there.
- You do NOT rewrite shots. For each failing scene, "reason" is ONE blunt sentence naming what the claim needed and what the shot shows instead (it steers the repair).`

  const userMessage = `SCENES (span → shot):\n${v.scenes
    .map((s) => `SCENE ${s.idx} [${s.tier}]\nspan: ${s.narrationText.trim()}\nshot: ${s.imagePrompt.trim()}`)
    .join('\n\n')}\n\nJudge every scene. Keep "claim" and "reason" to one short sentence each. OUTPUT (JSON only):\n{ "scenes": [ { "idx": 1, "claim": "", "depicted": false, "interchangeable": true, "reason": "" } ] }`

  return { system, userMessage }
}
