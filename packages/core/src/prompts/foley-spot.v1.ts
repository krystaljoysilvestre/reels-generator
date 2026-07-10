// foley-spot.v1 — "spotting" pass (the film-sound term for watching picture and marking where sound must
// land). A vision model watches frames sampled across ONE animated i2v clip and returns the VISIBLE
// physical MOTIONS that would make a sound, each with a clip-relative timestamp + a foley prompt. These
// become sound effects placed on the exact visual beat (door swings → its creak; she turns → cloth rustle)
// — sync we otherwise can't get, since the i2v model animates the still at times we never know.
//
// Genre-agnostic (see .claude/skills/unbiased-design): no quotas, an empty list is the correct answer for
// a drift-only clip, and the model decides what the picture actually shows — we don't prescribe sounds.

import { z } from 'zod'

export const FOLEY_SPOT_V1_VERSION = 'foley-spot.v1'

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// One spotted motion event. Transform-clamps (not .min/.max) so one out-of-range value never fails the
// whole parse and forces a needless vision retry.
export const FoleyEventSchema = z.object({
  atSec: z.number().transform((v) => Math.max(0, v)),        // clip-relative timestamp of the motion
  description: z.string().min(1),                            // what visibly moves ("door swings open")
  sfxPrompt: z.string().min(1),                              // non-vocal foley prompt for ElevenLabs
  durationSec: z.number().default(1.5).transform((v) => clamp(v, 0.5, 3)),
  // Foley sits in the audible-realism band — clearly heard under the narrator, never a climax hit.
  volumeDb: z.number().default(-8).transform((v) => clamp(v, -10, -6)),
})
export type FoleyEvent = z.infer<typeof FoleyEventSchema>

export const FoleySpotSchema = z.object({
  // Cap, not a quota — most clips have 0–2 sound-worthy motions. Empty is valid and common.
  events: z.array(FoleyEventSchema).max(3).default([]),
})
export type FoleySpot = z.infer<typeof FoleySpotSchema>

export function buildFoleySpotPrompt(params: {
  durationSec: number
  frameTimestampsSec: number[]
  motionPrompt: string | null
}): { system: string; userMessage: string } {
  const system = `You are a film sound editor SPOTTING a short animated clip: you watch it and mark the moments where a physical motion on screen would make a sound, so foley can be laid exactly on the picture. You are NOT judging quality — only reading what visibly moves and WHEN.`

  const stamps = params.frameTimestampsSec.map((t) => `${t.toFixed(1)}s`).join(', ')
  const userMessage = `These frames are sampled in time order from ONE animated clip that is ${params.durationSec.toFixed(1)}s long. Their timestamps (seconds from the clip's start) are: ${stamps}.${params.motionPrompt ? `\nThe clip was animated from this intent: "${params.motionPrompt}".` : ''}

Find the VISIBLE physical motions that would make a real sound, and place each on the frame where the motion most clearly happens:
- a door/drawer/lid opening or closing; footsteps as someone walks; a head or body turning (cloth/hair movement); an object picked up, set down, or knocked; a hand touching a surface; water, a switch, a phone against a hard surface.
- Report atSec = the clip timestamp (between 0 and ${params.durationSec.toFixed(1)}) where that motion commits.
- sfxPrompt = a short NON-VOCAL foley description for that exact sound.

Rules:
- ONLY sounds caused by a motion you can actually SEE across these frames. If the clip is just a slow camera drift with no real subject motion, return an empty list — that is the correct answer.
- NO ambience, room tone, music, or continuous beds (those are handled elsewhere). NO voices, speech, laughter, breathing, or any human vocal sound — foley is objects and bodies, never performance.
- At most the 3 most sound-important motions; fewer is better. Don't invent motion that isn't visible.

Return JSON only: { "events": [ { "atSec": 1.8, "description": "cubicle door swings open", "sfxPrompt": "old wooden door swinging open on a dry hinge", "durationSec": 1.2, "volumeDb": -7 } ] }  — or { "events": [] } if nothing on screen makes a sound.`

  return { system, userMessage }
}
