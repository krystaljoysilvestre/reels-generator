// story-finishing-judge.v1 — the FINISHING QA judge. Reads the finished narration as a first-time
// listener and returns a per-story PUNCH-LIST of finishing-craft problems (naturalness, orientation,
// turn-landing, announced-theme, rhythm). It is a DETECTION layer, not a fixer and not a gate: its job
// is to make human review at story_review FAST and TARGETED ("fix these 3 lines") instead of reading
// cold. Validated as a probe (probe-finishing-judge.v0): as a DETECTOR it reproduces a native speaker's
// read (it independently flagged "gawa-kamay"→"sulat-kamay" and a never-established death). The matching
// auto-FIXER is deliberately NOT shipped — it introduced garbles and didn't converge; prose fixing stays
// human-in-the-loop for now.
//
// Scope note: these are UNIVERSAL finishing-craft axes (does it read naturally, can a listener follow it,
// does the pivotal beat land, is the meaning shown not stated, is the rhythm varied). It deliberately does
// NOT judge AGENCY — that is a plan-level, culturally-loaded concern owned by the plan gate/doctor (see the
// universal-vs-cultural craft line), and flagging "not agentic enough" here would mis-fire on endurance-form
// stories. Versioned source; bump on any prompt-affecting edit.
import { z } from 'zod'
import { isFilipinoRegister } from './story-craft.v1.js'

// Back to v1.1: the `ending` axis added 2026-08-06 is reverted (decision-log 2026-08-06-003) — it scored
// against the same unvalidated standard as the gate's DELETION TEST.
export const STORY_FINISHING_JUDGE_V1_VERSION = 'story-finishing-judge.v1.1'

export const FinishingIssueSchema = z.object({
  // Which finishing-craft axis the problem is on (for grouping/telemetry in the review UI).
  axis: z.enum(['naturalness', 'orientation', 'turn', 'announced_theme', 'rhythm']),
  // One sentence: what's wrong + the offending line, so the reviewer can go straight to it.
  problem: z.string().min(1),
})
export const FinishingJudgeSchema = z.object({
  issues: z.array(FinishingIssueSchema), // empty ⇒ nothing flagged, ships as-is
  summary: z.string(), // one-line overall read
})
export type FinishingIssue = z.infer<typeof FinishingIssueSchema>
export type FinishingJudgeVerdict = z.infer<typeof FinishingJudgeSchema>

export interface FinishingJudgeVars {
  channelName: string
  nicheDescription: string
  language: string
  narration: string
  title: string
  logline: string
}

export function buildStoryFinishingJudgePrompt(v: FinishingJudgeVars): { system: string; userMessage: string } {
  // The Filipino register gets the extra native-idiom clause (the probe caught word-for-word-translated
  // Tagalog). Grouped by isFilipinoRegister so 'Filipino'/'Tagalog' channels get it too — before, only a
  // literal 'taglish' did, and Taglish is no longer offered in the picker.
  const naturalness =
    isFilipinoRegister(v.language)
      ? `does every line sound like a real Filipino actually talking? Flag word-for-word-translated, bookish/literary, or garbled Tagalog and wrong word choices (quote the phrase; e.g. handwriting is "sulat-kamay", not "gawa-kamay").`
      : `does every line sound like a real person actually talking (in ${v.language})? Flag stilted, bookish, translated-sounding, or garbled phrasing and wrong word choices (quote the phrase).`

  const system = `You are the FINISHING QA judge for the channel "${v.channelName}". Niche: ${v.nicheDescription}.
Read this finished short first-person story as a FIRST-TIME LISTENER who hears it ONCE, cannot pause, and knows nothing going in. Return a punch-list: one issue per REAL problem, each with the offending line quoted. If an axis is fine, say nothing about it. Axes:
- naturalness: ${naturalness}
- orientation: by the time each emotional beat arrives, does the listener already know WHO these people are, WHERE we are, and WHY it matters? Flag essential context that lands too late or never (e.g. that this is a departed grandmother's house being cleared, or a relationship the story depends on).
- turn: is the pivotal beat (the decision/reversal/confession the story rides on) DRAMATIZED — concrete action, real words, room to land — or COLLAPSED into summary/announcement ("Doon ko narealize…", "tapos wala")?
- announced_theme: does the narrator ever SPELL OUT the meaning/feeling/moral instead of letting it land through image and action?
- rhythm: is the sentence rhythm varied, or a monotonous string of near-identical short fragments?
Be honest and specific; do NOT invent problems; warm, plain feeling is GOOD, not a problem. Do NOT judge whether the character is "active enough" — that is not your job here. An empty issues list means it reads clean.`

  const userMessage = `TITLE: ${v.title}\nLOGLINE: ${v.logline}\n\nNARRATION:\n${v.narration}\n\nOUTPUT (JSON only):\n{ "issues": [ { "axis": "orientation", "problem": "" } ], "summary": "" }`

  return { system, userMessage }
}
