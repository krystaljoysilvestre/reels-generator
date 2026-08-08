// series-topics.v1 — replenish a series' seed queue without asking the creator to do data entry.
//
// A creator describes their channel once; the engine compiles it. Handing them an empty list and an
// "Add topic" button would put the work straight back on them, which is the configuration-shaped
// failure this product exists to avoid. So when a series runs out of subjects, we propose more.
//
// THE RISK THIS PROMPT IS BUILT AROUND: for a channel about REAL subjects — folklore, history, real
// places, real cases — a fabricated subject is not a harmless filler idea. It becomes a production
// topic, and a whole reel gets made about a legend that does not exist. That is the same fabrication
// class the destination and principles probes were built to catch, one layer earlier. So the prompt
// pushes hard on "real means already known", asks for FEWER rather than invented ones, and every
// generated topic is stored with origin:'generated' so it is distinguishable from what the creator
// actually asked for.
//
// Versioned source code. Bump on any prompt-affecting edit.

import { z } from 'zod'

export const SERIES_TOPICS_V1_VERSION = 'series-topics.v1'

export const SeriesTopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        subject: z.string().min(1),
        // Whether this names a real, already-documented thing (a real legend/place/event/case) or an
        // invented premise. The channel decides which is acceptable — a fiction channel wants invented,
        // a folklore/history channel must not have them.
        real: z.boolean(),
      }),
    )
    .max(12)
    .default([]),
})
export type SeriesTopics = z.infer<typeof SeriesTopicsSchema>

export interface SeriesTopicsVars {
  channelName: string
  nicheDescription: string
  seriesName: string
  /** Subjects already queued or used on this series — never propose these again. */
  existingSubjects: string[]
  /** How many to propose. */
  count: number
  /**
   * True when this channel's stories are about things that REALLY EXIST (folklore, history, real
   * places, real cases). Invented subjects are then a defect, not a shortfall.
   */
  requireReal: boolean
}

export function buildSeriesTopicsPrompt(v: SeriesTopicsVars): { system: string; userMessage: string } {
  const realityRule = v.requireReal
    ? `THIS CHANNEL COVERS REAL SUBJECTS. Every subject you propose must be a real, already-documented thing that a viewer could look up — a real legend, a real place, a real event, a real case. Do NOT invent one, do NOT blend two into a new name, and do NOT generalize a category into a fake specific ("The Haunted House of San Miguel" when no such story exists). If you can only think of ${Math.max(1, Math.floor(v.count / 2))} genuine ones, return ${Math.max(1, Math.floor(v.count / 2))} — a short honest list is the correct answer and a padded one is a defect, because each of these becomes a whole published video about something that does not exist. Mark "real": true only where you are confident the subject genuinely exists; anything you are unsure about, leave out entirely rather than flagging it false.`
    : `This channel's stories are invented, so propose original premises. Mark "real": false for anything you made up; use "real": true only if a subject genuinely refers to a real documented thing.`

  const system = `You propose the next subjects for one recurring SERIES on a video channel. You are filling a production queue: each subject you return becomes an actual video, so a bad one costs real money and a fabricated one publishes a falsehood.

${realityRule}

Also:
- Stay inside THIS series. A subject that belongs to a different series on the same channel is wrong here — a creature belongs in the creature series, a place in the places series, even when a legend touches both.
- The "already covered" list spans the WHOLE channel, not just this series. A subject that merely renames or relocates something on it ("the Balete tree in Quezon City" when "White Lady of Balete Drive" is listed) is a repeat and must not be proposed.
- Never repeat, rephrase or narrowly re-cut a subject already on the list you are given.
- Each subject is a SUBJECT, not a title, angle or hook — the writer decides how to tell it ("The Yamashita Treasure", not "The SHOCKING truth about the Yamashita Treasure").
- Keep them concrete and specific enough to build one video around.`

  const userMessage = `CHANNEL: ${v.channelName}
WHAT IT IS: ${v.nicheDescription.slice(0, 2000)}

SERIES: ${v.seriesName}

ALREADY COVERED OR QUEUED (never propose these again):
${v.existingSubjects.length ? v.existingSubjects.map((s) => `- ${s}`).join('\n') : '(nothing yet)'}

Propose up to ${v.count} further subjects for this series.

OUTPUT (JSON only): { "topics": [ { "subject": "", "real": true } ] }`

  return { system, userMessage }
}
