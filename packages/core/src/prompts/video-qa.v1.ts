// video-qa.v1 — vision check of a generated i2v clip for animation ARTIFACTS (not brief-fidelity; the
// source still already passed image-qa). Image-to-video is where faces melt, hands grow extra fingers,
// and identities morph — and the OPENING beat is always animated, so the most-watched shot is the most at
// risk, with nothing catching it today. We sample a couple of frames (mid + last — distortion accumulates
// over the clip) and ask whether the motion stayed physically coherent. Improves rather than gates: a fail
// triggers ONE re-roll (i2v is stochastic), but a reel is never failed on a verdict.

import { z } from 'zod'

export const VIDEO_QA_V1_VERSION = 'video-qa.v1'

export const VideoQASchema = z.object({
  pass: z.boolean(), // true = no serious animation artifact; false = clear warping/morphing
  issues: z.array(z.string()), // concrete artifacts when pass=false; [] when pass=true
})
export type VideoQA = z.infer<typeof VideoQASchema>

// The frames are sampled from across ONE clip (e.g. its midpoint and final frame), in order.
export function buildVideoQAPrompt(): { system: string; userMessage: string } {
  const system = `You are a strict QA reviewer checking frames sampled from a single AI-generated (image-to-video) clip for ANIMATION ARTIFACTS. You are NOT judging story, composition, grade, or mood — only whether the motion stayed physically coherent. The frames are in time order (later frames are further into the clip, where distortion tends to accumulate).`

  const userMessage = `These frames are sampled from one short animated clip, in time order. Decide whether the animation is physically coherent or visibly broken.

FAIL the clip if any frame shows a clear animation artifact:
- FACES: a face melting, smearing, warping, or morphing into a different face; features sliding off; eyes/mouth dissolving.
- HANDS / LIMBS: extra or missing fingers/arms/legs, limbs bending the wrong way, hands fusing or dissolving.
- BODIES / OBJECTS: a solid thing liquefying, duplicating, or tearing apart as it moves; a figure half-dissolving into the background.
- IDENTITY DRIFT: the main subject visibly changes into a different person/object across the frames.
- STRUCTURE: walls, doors, or furniture bending, rippling, or flowing like liquid.

PASS the clip if the frames look like a normal photograph in gentle motion — even if dark, grainy, moody, or low-contrast. Subtle camera drift, soft motion blur, and atmospheric darkness are NOT artifacts.

Return JSON only: { "pass": true, "issues": [] } if coherent, or { "pass": false, "issues": ["short concrete artifact", ...] } listing only clear breakage.`

  return { system, userMessage }
}
