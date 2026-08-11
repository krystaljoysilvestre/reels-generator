// cover-frame.v1 — vision ranking of a reel's own frames for COVER potential.
//
// WHY THIS EXISTS. The cover's hero frame was picked by one line: `first scene with isHero && an image,
// else the first scene with an image`. The planner flags THREE scenes as hero (its `tier === 'video'`
// picks) and this read the first of them — and those flags mean "worth animating", which is not the same
// question as "works as a cover". Measured consequence: Crossroads scored 0 of 28 marks in the treatment
// review because its cover was a bland empty office, chosen blind out of 42 available frames. The last
// lap's own conclusion was that cover quality tracked the FRAME, not the typography.
//
// The frames are already generated and already paid for, so ranking them is the cheapest quality lever
// available: no new image generation, just judgment over what the reel already owns.
//
// DELIBERATELY NOT GENRE-AWARE. An earlier draft of these criteria asked for "a face with a clear
// emotion", which is a real convention on some channels and actively wrong on others — a folklore
// landscape, an informational diagram, a product shot. Prescribing it would have made every channel look
// like one genre. The criteria below are the durable fundamentals that survived the founder's own
// 28-candidate review — focal isolation, contrast, readability at size — and the model decides what
// satisfies them for THIS reel. No quotas, no required subject type.

import { z } from 'zod'

export const COVER_FRAME_V1_VERSION = 'cover-frame.v1.1'

// Reasons are TRUNCATED, not rejected, and textSpace is NORMALISED rather than required to be exact.
// v1 enforced `reason` at max 160 chars and a strict enum, and the first live run failed both: the model
// wrote 170-200 char reasons and answered "top or bottom" for a frame with space in both places. Neither is
// a real defect — the ranking was good — but a strict schema turned them into a hard failure that burned a
// repair round and 6c. The repo's own lesson applies: soft prose guidance gets satisficed, so the mechanical
// half belongs in code. The prompt still ASKS for a short clause; the schema now guarantees one.
const reasonField = z
  .string()
  .min(1)
  .transform((s) => {
    const t = s.trim()
    return t.length <= 160 ? t : `${t.slice(0, 157).trimEnd()}…`
  })

// textSpace stays a plain string ON THE WIRE and is normalised into the strict domain enum by
// normalizeTextSpace below. Two reasons: llmCall's `schema: z.ZodType<T>` requires a schema whose input and
// output types agree, which a coercing z.preprocess breaks; and the split is the right shape anyway — the
// model contract is lenient about phrasing, the value we PERSIST is strict.
const TEXT_SPACES = ['top', 'bottom', 'left', 'right', 'none'] as const
export type TextSpace = (typeof TEXT_SPACES)[number]

/** "top or bottom" / "bottom-left" / "TOP" → the first named region mentioned; 'none' if unrecognisable. */
export function normalizeTextSpace(v: string): TextSpace {
  const lower = v.toLowerCase()
  return TEXT_SPACES.find((s) => lower.includes(s)) ?? 'none'
}

export const CoverFrameRankingSchema = z.object({
  // Ranked best-first. One entry per frame shown, so a caller can present a shortlist AND explain it.
  ranked: z
    .array(
      z.object({
        // Index into the candidate list AS PRESENTED, not the scene index — the caller samples frames and
        // maps back. Asking the model for scene numbers invites it to invent ones it wasn't shown.
        candidate: z.number().int().nonnegative(),
        score: z.number().min(0).max(10),
        // One short clause, shown to the creator beside the frame. This is why the shortlist is a
        // recommendation the creator can disagree with rather than an opaque pick.
        reason: reasonField,
        // Where type could sit without covering the subject. Recorded now because it is nearly free to ask
        // while the model is already looking, and it is the input a per-frame text placement would need.
        // Nothing consumes it yet — see the note in the step. Normalise with normalizeTextSpace().
        textSpace: z.string(),
      }),
    )
    .min(1),
})
export type CoverFrameRanking = z.infer<typeof CoverFrameRankingSchema>

export function buildCoverFramePrompt(input: {
  candidateCount: number
  overlay: string // the words that will be burned on, so placement advice is about the real text
  title: string // the platform title — the frame should not contradict what the title promises
}): { system: string; userMessage: string } {
  const system = `You rank still frames from one short video by how well each would work as its COVER — the single image a viewer sees before deciding whether to watch. You are choosing among frames that already exist; you are not describing an ideal frame. Judge what is actually in each image.`

  const userMessage = `This video's title is: "${input.title}"
The cover will have these words burned onto it: "${input.overlay}"

You will see ${input.candidateCount} frames from the video, in order, labelled by their candidate number starting at 0.

Rank ALL of them best-first for cover potential, judging only what you can see:

- FOCAL SUBJECT. Is there one clear thing the eye lands on, and is it large enough in frame to read? A wide establishing shot where the subject is small or absent ranks low, however pretty it is. An empty room, an empty desk, or scenery with nothing happening is the weakest kind of cover.
- READS AT SMALL SIZE. A cover is judged as a small rectangle on a phone. Strong separation between subject and background, and enough tonal contrast that it does not turn to mush when shrunk. Busy, low-contrast, or evenly-lit-everywhere frames rank low.
- ROOM FOR THE WORDS. There should be an area of relatively plain, uncluttered image where the burned words can sit WITHOUT covering the subject. Report where that area is in textSpace, or "none" if the frame is full edge to edge.
- IMPLIES THE STORY. The frame should be consistent with what the title promises and should raise a question rather than answer it. A frame that gives away the ending, or that has nothing to do with the title, ranks low.
- TECHNICAL SOUNDNESS. Rank down visible defects you can actually see: a hard seam or discontinuity across the image, a garbled or malformed subject, obvious duplication, text-like marks that are not real text, limbs or faces that read as wrong.

Do NOT reward drama, darkness, brightness, faces, or any particular subject matter for its own sake. Different videos are carried by different kinds of image — a person, a place, an object, a diagram. Judge each frame on the criteria above, as they apply to THIS video, and let the frame that best serves this specific story win.

score is 0-10: 8+ means you would ship it as the cover, 5-7 usable, below 5 weak. Scores may repeat.

reason must be AT MOST 15 WORDS — a clause, not a paragraph. There are many frames to get through and the creator reads these at a glance beside each one.
textSpace must be exactly ONE of: top, bottom, left, right, none. Pick the best single region even if more than one would work.

Return JSON only: { "ranked": [ { "candidate": 0, "score": 8.5, "reason": "short clause", "textSpace": "bottom" }, ... ] } with every candidate present exactly once, ordered best first.`

  return { system, userMessage }
}
