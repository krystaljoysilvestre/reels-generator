// image-qa.v1 — vision check of a generated scene image against the director's intent.
//
// generate_images has no quality gate today: only a content-filter rejection triggers a retry, so
// quality misses (a door rendered OPEN when the line implies it's shut, third-person when the prompt
// says POV, a figure shown when it should only be implied, day vs night flipped) get persisted silently.
// This is the pixel-level analog of the scene-text QA. Craft/communication misses may trigger one fresh
// re-roll and remain visible to the storyboard reviewer; only factual truth/identity failures can block
// rendering or publishing.

import { z } from 'zod'

export const IMAGE_QA_V1_VERSION = 'image-qa.v1.8'

export const ImageQASchema = z.object({
  pass: z.boolean(), // does the image faithfully match the description's checkable intent?
  issues: z.array(z.string()), // concrete mismatches when pass=false; [] when pass=true
  truthPass: z.boolean().default(true), // does the rendered frame preserve the factual depiction contract?
  truthIssues: z.array(z.string()).default([]),
})
export type ImageQA = z.infer<typeof ImageQASchema>

export function isBlockingImageTruthFailure(required: boolean, verdict: Pick<ImageQA, 'truthPass'>): boolean {
  return required && !verdict.truthPass
}

export interface ImageQATruthContext {
  required: boolean
  depictionBasis: 'source' | 'reconstruction' | 'representative' | 'conceptual'
  narrationText: string
}

export function buildImageQAPrompt(
  visualPrompt: string,
  expectedAppearance?: string,
  truth?: ImageQATruthContext,
  verifiedReferenceLabels: string[] = [],
): { system: string; userMessage: string } {
  const system = `You are a strict art-director QA reviewing a single AI-generated film still against the brief it was generated from. Return TWO independent judgments:
1. pass/issues — whether the frame communicates the brief's key checkable intent. This is craft feedback.
2. truthPass/truthIssues — whether the frame preserves factual identity, state, and depiction honesty. This is the only blocking verdict.
Judge only clear mismatches, never taste, grade, or a merely different artistic interpretation.`

  const userMessage = `BRIEF (what this shot is supposed to be):
"""${visualPrompt}"""
${expectedAppearance ? `\nEXPECTED VERIFIED ENTITY STATE (render ground truth — applies to people, objects, places, and other sourced identities):\n"""${expectedAppearance}"""\n` : ''}
${verifiedReferenceLabels.length > 0 ? `\nVERIFIED IDENTITY REFERENCES supplied after the generated frame:\n${verifiedReferenceLabels.map((label, index) => `REFERENCE ${index + 1}: ${label}`).join('\n')}\nCompare identity-defining geometry and visible features against these pixels. Use only the supplied brief, expected state, narration span, and reference images—never remembered or assumed facts about the subject. An alleged mismatch is invalid unless it is visible in a supplied reference or explicitly stated in the supplied text.\n` : ''}
${truth?.required ? `\nFACTUAL DEPICTION CONTRACT (blocking):\nbasis: ${truth.depictionBasis}\nnarration span: """${truth.narrationText}"""\n` : ''}

Look at the image and decide whether it faithfully delivers the brief's KEY, checkable elements:
- SUBJECT: the main thing the brief leads with is actually present and is the focus (not a generic empty room when a subject was named).
- PERSPECTIVE: if the brief says POV / first-person / "the camera is the narrator's eyes", the shot must be from that viewpoint — NOT a third-person view showing the narrator as a full figure.
- NAMED OBJECT STATE: if the brief specifies an object's state (e.g. a door "closed" / "shut" / "flush", or "open"), the image must match it — a closed door must read as closed, not open or a black gap.
- WHAT IS / ISN'T SHOWN: if the brief implies a presence WITHOUT showing it (shadow, sound, "just out of view"), no literal figure/body should be depicted; conversely a named subject must appear.
- CAST: no people appear BEYOND those the brief describes — FAIL on an invented extra (a bystander, a second figure, a stray hand/arm) that the brief doesn't call for. If the brief says the narrator is alone, no other person may be in frame.
${expectedAppearance ? '- VERIFIED ENTITY STATE: every bound entity must visibly preserve the expected identity and time-bound state. For a person this includes life stage; for an object/place it includes identity-defining geometry, orientation, configuration, and markings explicitly present in the verified state. Record a clear contradiction in truthIssues as well as issues.\n' : ''}- REAL-PARTY FABRICATION (depictive-ethics floor): if the brief names a real organization, office, or public figure, FAIL a frame that reads as a press or event photograph of identifiable people acting as that party — a recognizable face plus insignia, flags, a podium, a handshake, or ceremony staging. Representative staging passes: silhouettes, unbranded hands, distant or non-identifiable figures, empty symbolic setups.
- NO CAMERA-FACING / STATIC POSE: a person must be caught mid-action with their gaze directed WITHIN the scene (at an object, at another person, into the dark) — FAIL a flat, front-on portrait of a person standing still and staring into the lens doing nothing (unless the brief explicitly calls for a direct-to-camera stare).
- LIGHTING / TIME: day vs night and the named light source roughly match the brief (don't nitpick exact exposure).
- READABLE SUBJECT: the key subject must be VISIBLE — discernible at a glance even in a dark/low-key shot. A moody, shadow-heavy frame is fine; FAIL only when the subject (or the frame as a whole) is so underexposed it reads as a near-black image where you genuinely can't make out the focal action.

Ignore: color grade, film-stock look, minor composition, overall mood, artistic darkness (so long as the subject still reads), small non-identity detail accuracy. Those are not failures.

${truth?.required ? `Also return a separate blocking truth verdict. Judge the PIXELS, not merely whether they follow the brief:
- reconstruction may show a specific moment, but FAIL truth if the image adds documentary-looking participants, emblems, signage, flags, a named venue, ceremony, audience, meeting, publication, or object state that the narration/brief did not establish.
- representative must remain anonymous and non-specific. FAIL if it looks like a record of the exact event, organization, venue, or people.
- conceptual must read as interpretation. FAIL if a hypothesis, counterfactual, proposal, metaphor, or mechanism has collapsed into a plausible historical/documentary photograph.
- FAIL obvious wrong-time or wrong-state details, and any visible identity/state contradiction against EXPECTED VERIFIED ENTITY STATE. This includes a sourced object's defining geometry, orientation, configuration, or mark — never demote those to ordinary issues.
- Judge only what the pixels can actually establish. Do NOT require an internal, hidden, microscopic, or otherwise non-visible mechanism/state to be exposed merely because the narration names it. Missing visible proof of an inherently hidden state is not a contradiction; fail only a visible contradiction, the wrong identity, or the absence of a feature the brief explicitly says must be visible. The shot may honestly show an observable result while the narration explains its unseen cause.
- ABSENCE OF VISIBLE PROOF IS NEVER AN IDENTITY MISMATCH. Do not invent expected exterior evidence — holes, markings, pins, switches, arming/fuzing hardware, or indicators — unless EXPECTED VERIFIED ENTITY STATE explicitly says that evidence is visible. Judge identity from the exact subject's established visible form and reference-grounded features; keep an unseen condition in narration only.
- SOURCE-BOUNDED JUDGMENT: never use outside memory to invent a required color, material, marking, component, deployment rig, mechanism, or historical detail. A difference can block only when the supplied text requires it or the generated frame visibly contradicts a supplied verified reference. If no supplied evidence establishes the alleged detail, omit it from both issue lists.
- A conceptual frame may communicate the intended idea through a different composition or visual device. Put a clear communication miss in issues/pass; do NOT put it in truthIssues unless it also changes verified identity/state, invents a factual claim, or makes interpretation look like documentation.
- Do not fail merely because a generated image is illustrative or because it lacks labels. Name only concrete visual truth problems in truthIssues.
Set truthPass:false on any such problem; otherwise truthPass:true. The two verdicts are independent: pass:false with truthPass:true is valid for a craft/communication miss.` : 'This is not a factual truth-gated scene; set truthPass:true and truthIssues:[].'}

Return JSON only: { "pass": true, "issues": [], "truthPass": true, "truthIssues": [] }. Use short concrete mismatches only.`

  return { system, userMessage }
}
