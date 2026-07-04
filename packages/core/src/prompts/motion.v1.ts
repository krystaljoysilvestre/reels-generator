// motion.v1 — turn an operator's plain-language motion request into a structured animation instruction.
// The operator types how they want a hero shot to move ("the woman laughs at her in the mirror while the
// narrator freezes"); i2v models follow a described motion far better than an abstract one, so an LLM
// translates it into ONE concrete subjectMotion + a camera move. This is the motion analog of
// revise-scene.v1 (which does the same for the image). Output composes into the scene's motion prompt.

import { z } from 'zod'
import { CAMERA_MOVE_KEYS } from '../motion/motion.js'

export const MOTION_V1_VERSION = 'motion.v1'

export const SuggestMotionSchema = z.object({
  // ONE concrete, slow motion the SUBJECT performs on screen. Names which subject moves (by position —
  // "the figure to her right", "in the mirror") so i2v targets it and not the wrong face. "" = only the
  // camera moves (no subject motion).
  subjectMotion: z.string(),
  cameraMove: z.enum(CAMERA_MOVE_KEYS),
})

export function buildSuggestMotionPrompt(
  imagePrompt: string,
  request: string,
  opts?: { genreCategory?: string; currentMotion?: string },
): { system: string; userMessage: string } {
  const horrorClause =
    opts?.genreCategory === 'horror'
      ? `

This is a HORROR channel. The unnerving power of a scare is SLOWNESS and restraint — ONE deliberate, wrong motion (a grin stretching too wide, a head tilting the wrong way, a figure looming closer), never frantic or busy. Do not describe blood or gore. Refer to a menacing/supernatural subject with non-person words ("the figure", "the form", "it") rather than "the woman/man/girl".`
      : ''

  const system = `You are a motion director for image-to-video (i2v). You are given a still shot and the operator's request for how it should move, and you output ONE animation instruction the i2v model can follow.

Rules:
- i2v animates ONLY what is already IN the still — never invent a subject or action for something not in the frame. Describe motion for the people/things actually shown.
- Name WHICH subject moves and WHERE it is in the frame ("the figure to her right", "the reflection in the mirror", "the woman in the doorway") so the animator targets the correct subject and not the most prominent face by default.
- ONE motion only — concrete, physical, and SLOW/deliberate; never a list of actions, never frantic. A subject that should stay still is described as still ("frozen", "rigid", "unmoving").
- subjectMotion is what the SUBJECT does; the camera move is separate. Leave subjectMotion "" only if the operator wants a pure camera move with nothing in the frame moving.
- Pick the ONE cameraMove that best serves the request (push_in to close in on a subject, pull_out for a reveal, drift for atmosphere, handheld for immediacy, locked for stillness, pan/tilt to follow).${horrorClause}`

  const userMessage = `The still shows:
"""${imagePrompt}"""
${opts?.currentMotion ? `\nCurrent motion (for reference — you are replacing it):\n"""${opts.currentMotion}"""\n` : ''}
The operator wants it to move like this:
"""${request}"""

Write ONE subjectMotion (concrete, slow, naming which subject moves and where) and pick ONE cameraMove.

OUTPUT (JSON only): { "subjectMotion": "…", "cameraMove": "drift" | "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "handheld" | "locked" }`

  return { system, userMessage }
}
