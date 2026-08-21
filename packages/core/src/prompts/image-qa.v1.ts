// image-qa.v1 — vision check of a generated scene image against the director's intent.
//
// generate_images has no quality gate today: only a content-filter rejection triggers a retry, so
// quality misses (a door rendered OPEN when the line implies it's shut, third-person when the prompt
// says POV, a figure shown when it should only be implied, day vs night flipped) get persisted silently.
// This is the pixel-level analog of the scene-text QA. It's run on the HERO + PEAK scenes only (the ones
// that get animated + showcased) to keep cost bounded, and it improves rather than gates: a fail triggers
// a re-roll with a fresh seed, but a reel is never failed on a QA verdict.

import { z } from 'zod'

export const IMAGE_QA_V1_VERSION = 'image-qa.v1.3'

export const ImageQASchema = z.object({
  pass: z.boolean(), // does the image faithfully match the description's checkable intent?
  issues: z.array(z.string()), // concrete mismatches when pass=false; [] when pass=true
})
export type ImageQA = z.infer<typeof ImageQASchema>

export function buildImageQAPrompt(visualPrompt: string, expectedAppearance?: string): { system: string; userMessage: string } {
  const system = `You are a strict art-director QA reviewing a single AI-generated film still against the brief it was generated from. Judge ONLY clear, checkable mismatches — not taste, grade, or artistic interpretation. A still is a PASS unless it clearly contradicts the brief.`

  const userMessage = `BRIEF (what this shot is supposed to be):
"""${visualPrompt}"""
${expectedAppearance ? `\nEXPECTED TIME-BOUND CHARACTER APPEARANCE (render ground truth):\n"""${expectedAppearance}"""\n` : ''}

Look at the image and decide whether it faithfully delivers the brief's KEY, checkable elements:
- SUBJECT: the main thing the brief leads with is actually present and is the focus (not a generic empty room when a subject was named).
- PERSPECTIVE: if the brief says POV / first-person / "the camera is the narrator's eyes", the shot must be from that viewpoint — NOT a third-person view showing the narrator as a full figure.
- NAMED OBJECT STATE: if the brief specifies an object's state (e.g. a door "closed" / "shut" / "flush", or "open"), the image must match it — a closed door must read as closed, not open or a black gap.
- WHAT IS / ISN'T SHOWN: if the brief implies a presence WITHOUT showing it (shadow, sound, "just out of view"), no literal figure/body should be depicted; conversely a named subject must appear.
- CAST: no people appear BEYOND those the brief describes — FAIL on an invented extra (a bystander, a second figure, a stray hand/arm) that the brief doesn't call for. If the brief says the narrator is alone, no other person may be in frame.
${expectedAppearance ? '- CHARACTER LIFE STAGE: every named character must visibly match the expected time-bound appearance, especially child/young/adult/elderly state. FAIL a clear life-stage contradiction even when the person otherwise matches.\n' : ''}- REAL-PARTY FABRICATION (depictive-ethics floor): if the brief names a real organization, office, or public figure, FAIL a frame that reads as a press or event photograph of identifiable people acting as that party — a recognizable face plus insignia, flags, a podium, a handshake, or ceremony staging. Representative staging passes: silhouettes, unbranded hands, distant or non-identifiable figures, empty symbolic setups.
- NO CAMERA-FACING / STATIC POSE: a person must be caught mid-action with their gaze directed WITHIN the scene (at an object, at another person, into the dark) — FAIL a flat, front-on portrait of a person standing still and staring into the lens doing nothing (unless the brief explicitly calls for a direct-to-camera stare).
- LIGHTING / TIME: day vs night and the named light source roughly match the brief (don't nitpick exact exposure).
- READABLE SUBJECT: the key subject must be VISIBLE — discernible at a glance even in a dark/low-key shot. A moody, shadow-heavy frame is fine; FAIL only when the subject (or the frame as a whole) is so underexposed it reads as a near-black image where you genuinely can't make out the focal action.

Ignore: color grade, film-stock look, minor composition, overall mood, artistic darkness (so long as the subject still reads), small detail accuracy. Those are not failures.

Return JSON only. Always include "issues": { "pass": true, "issues": [] } if it matches, or { "pass": false, "issues": ["short concrete mismatch", ...] } listing only the clear contradictions.`

  return { system, userMessage }
}
