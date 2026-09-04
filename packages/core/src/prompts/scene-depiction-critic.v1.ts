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
// Boundary: "depiction" here = does the shot depict its span's CLAIM. Distinct from depictive-fidelity's
// "depictive fidelity" (= does a render match the real place) — see specs/depictive-fidelity.md.
// Evidence: the 2026-07-25 voiceover probe — boards scored 0/8, 1/7, 1/5 on load-bearing claims even with
// the informational genre grammar present; soft prompt guidance is satisficed, judgment is not
// (hypotheses/voiceover-perspective.md Phase 0). Scoped to informational media-genre boards today; the
// defect is genre-universal (a drama's "she saw the divorce papers" boarded as "woman at window" is the
// same failure) — widen only with genre evidence.
// Future dimensions, deliberately NOT judged yet: timing (a 0.8s teaching frame teaches nothing),
// legibility, camera focus — informational quality is narration + image + timing.
// Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'

export const SCENE_DEPICTION_CRITIC_V1_VERSION = 'scene-depiction-critic.v1.7'

export const VisualTruthViolationSchema = z.enum([
  'unsupported_specificity',
  'invented_event_record',
  'invented_venue_identity',
  'chronology_leak',
  'modality_collapse',
  'wrong_identity_state',
  'source_context_mismatch',
  'source_should_be_present',
])

const TruthCheckStatusSchema = z.enum(['supported', 'not_applicable', 'unsupported'])
const TruthChecksSchema = z.object({
  eventRecord: TruthCheckStatusSchema,
  venueIdentity: TruthCheckStatusSchema,
  chronology: TruthCheckStatusSchema,
  modality: TruthCheckStatusSchema,
  identityState: TruthCheckStatusSchema,
  sourceUse: TruthCheckStatusSchema,
  unsupportedSpecificity: TruthCheckStatusSchema,
})
const TruthCheckNameSchema = z.enum(['eventRecord', 'venueIdentity', 'chronology', 'modality', 'identityState', 'sourceUse', 'unsupportedSpecificity'])
const TruthCheckReasonsSchema = z.array(z.object({ check: TruthCheckNameSchema, reason: z.string() })).max(7)

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
      truthPass: z.boolean(), // could this frame honestly be shown under the supplied evidence + basis?
      truthViolations: z.array(VisualTruthViolationSchema).default([]),
      truthChecks: TruthChecksSchema,
      truthCheckReasons: TruthCheckReasonsSchema,
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
  evidenceFacts?: unknown
  bibleEntities?: unknown
  journey?: unknown
  scenes: {
    idx: number
    narrationText: string
    imagePrompt: string
    tier: string
    depictionBasis: 'source' | 'reconstruction' | 'representative' | 'conceptual'
    primaryEntity?: string | null
    supportingEntities?: string[]
    sourcePresentationEntity?: string | null
    appearanceByEntity?: Record<string, string>
  }[]
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

  const truthSystem = `

VISUAL TRUTH CONTRACT — also judge whether the proposed frame can honestly be shown as this basis:
- source: the exact verified source pixels named by sourcePresentationEntity. It must be the primary entity and match the narrated source, edition, page, time, and state. The renderer ignores generative staging language and copies those verified pixels untouched, so judge visible source content from its Story Bible provenance—not as an invented generated scene and not from whether imagePrompt paraphrases every detail on the page. If verified source pixels are the evidence the audience needs to inspect, a generated facsimile fails source_should_be_present.
- reconstruction: a generated depiction of a specific supported moment. Every visible event, venue, organization identity, participant, object state, and time cue must be supported by the narration or supplied anchors. Documentary-looking specificity is a claim, even without text.
- representative: anonymous/non-specific staging that carries the claim without claiming to record its exact people, venue, meeting, ceremony, or moment. It fails if it acquires identifiable event or venue details.
- conceptual: a clearly interpretive visualization of an idea, hypothetical, counterfactual, metaphor, or mechanism. It fails when it looks like historical documentation of an event that did not happen or was only proposed.

Use only the narration span and supplied anchors below. Do not use outside knowledge and do not reward plausible invention. Your reason may not name a supposedly correct venue, participant, date, state, or fact unless it appears in those inputs; say only that the proposed detail is unsupported. Flag:
- unsupported_specificity: a visible detail presented as factual without support;
- invented_event_record: a fabricated documentary-looking meeting, ceremony, exhibition, audience, vote, action, or other event;
- invented_venue_identity: an exact hall, office, emblem, signage, flag, or institutional setting not established;
- chronology_leak: a later/earlier object, publication, state, participant, or setting leaks into this beat;
- modality_collapse: a claim, proposal, hypothesis, counterfactual, or uncertainty is rendered as an observed fact;
- wrong_identity_state: the exact person/place/object is shown in the wrong event-time state;
- source_context_mismatch: source pixels are real but do not match the source the span asks the audience to inspect;
- source_should_be_present: the scene asks viewers to inspect available verified evidence but proposes a generated substitute. "Available verified evidence" means the supplied entity/state has an exact sourceAssetKey. Never infer source_should_be_present from depictionMode:"archival_only", a sourcing query, or the mere absence of a sourceAssetKey. When no exact sourceAssetKey is supplied, judge representative/conceptual staging on its own truth and depiction; a weak or incomplete representation may fail depiction, but sourceUse remains not_applicable rather than unsupported.

truthPass is false on any violation. When either depiction or truth fails, reason must name the concrete repair needed without inventing a shot. This is a correctness gate, not a taste review.`

  const boundarySystem = `

KEEP DEPICTION AND TRUTH SEPARATE:
- An omission, weak metaphor, ambiguous gesture, generic shot, or failure to make the whole claim understandable with sound off is a DEPICTION failure only: depicted:false, but truthPass:true if the pixels do not positively assert a false/unsupported fact.
- unsupported_specificity means the frame ADDS a concrete visible fact absent from the anchors. It never means the frame lacks enough specificity to prove the narration.
- modality_collapse means uncertainty/proposal/hypothesis/counterfactual is positively rendered as an observed real event. It never means that part of a factual narration span was omitted.
- A resignation letter that is not visibly recognizable as a protest may be weak depiction; it is not a truth violation unless the shot adds unsupported people, venue, event, wording, or circumstances.
The hard gate is honesty, not perfect communication. Do not put depiction/craft failures in truthViolations.`

  const checkSystem = `

MANDATORY TRUTH CHECKLIST — answer every dimension independently before truthPass:
- eventRecord: are the exact visible human interaction, participants, action, procedure, and event staging established? A supported outcome does not establish the unseen conversation/meeting/handoff.
- venueIdentity: is every visible studio, showroom, office, gallery, hall, pedestal, furnishing, emblem, sign, architecture, and light-source context established? A generic-looking invented studio is still unsupported.
- chronology: do all visible objects, publications, people, and states exist in this beat?
- modality: does the frame preserve fact vs claim/inference/hypothesis/counterfactual?
- identityState: does every exact identity match its one event-time state, with no unanchored duplicate state?
- sourceUse: when the narration asks viewers to see a photograph, page, document, artwork, map, or other evidence and the supplied entity has exact sourceAssetKey pixels (including a canonical-state appearance source), are those pixels presented with basis:source instead of reconstructed? Does a selected source match the span? If no exact sourceAssetKey is supplied, mark sourceUse not_applicable; depictionMode alone is never a source.
- unsupportedSpecificity: does any other concrete visible detail assert a fact absent from the anchors?

For each check return supported, not_applicable, or unsupported. In truthCheckReasons include ONE short grounded reason only for checks marked unsupported; use [] when all pass. Any unsupported check MUST make truthPass:false and add its mapped violation. Do not skip a check because the overall scene feels plausible.`

  const userMessage = `SUPPLIED EVIDENCE FACTS:\n${JSON.stringify(v.evidenceFacts ?? null, null, 2)}\n\nSTORY BIBLE ENTITIES / VERIFIED SOURCES / STATES:\n${JSON.stringify(v.bibleEntities ?? null, null, 2)}\n\nCHRONOLOGY / JOURNEY:\n${JSON.stringify(v.journey ?? null, null, 2)}\n\nSCENES (span → truth contract → shot):\n${v.scenes
    .map((s) => `SCENE ${s.idx} [${s.tier}]\nspan: ${s.narrationText.trim()}\nbasis: ${s.depictionBasis}\nprimaryEntity: ${s.primaryEntity ?? 'null'}\nsupportingEntities: ${JSON.stringify(s.supportingEntities ?? [])}\nsourcePresentationEntity: ${s.sourcePresentationEntity ?? 'null'}\nappearanceByEntity: ${JSON.stringify(s.appearanceByEntity ?? {})}\nshot: ${s.imagePrompt.trim()}`)
    .join('\n\n')}\n\nJudge every scene. Keep "claim", "reason", and each truthCheckReasons reason to one short sentence. OUTPUT (JSON only):\n{ "scenes": [ { "idx": 1, "claim": "", "depicted": false, "interchangeable": true, "truthPass": false, "truthViolations": ["unsupported_specificity"], "truthChecks": { "eventRecord": "not_applicable", "venueIdentity": "supported", "chronology": "supported", "modality": "supported", "identityState": "supported", "sourceUse": "supported", "unsupportedSpecificity": "unsupported" }, "truthCheckReasons": [ { "check": "unsupportedSpecificity", "reason": "" } ], "reason": "" } ] }`

  return { system: `${system}${truthSystem}${boundarySystem}${checkSystem}`, userMessage }
}
