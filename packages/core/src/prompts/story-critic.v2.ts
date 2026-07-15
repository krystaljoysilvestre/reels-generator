// story-critic.v2 — the editorial gate: should this ship? Reads the FINAL script once and answers
// pass/fail with one line of reason. No ranking, no scoring axes, no candidates (that was v1's
// best-of-N job; v1 stays untouched for the legacy path). A fail buys exactly ONE Writer rewrite,
// then the story passes through regardless — the story_review human gate is the backstop.
//
// Per-genre DEFAULT rubrics replace v1's single horror-specific fallback. This is the documented
// unbiased-design exception: deliberate owner-set defaults used only when a channel hasn't mined
// its own tasteRubric — and every line is CHECKABLE against the text, never a creative quota.
// Versioned source code. Bump on any prompt-affecting edit.

import { z } from 'zod'
import { asGenreModule, classifyGenre, type GenreModule } from './scenes.v1.js'

export const STORY_CRITIC_V2_VERSION = 'story-critic.v2.0'

export const StoryGateSchema = z.object({
  pass: z.boolean(),
  // One blunt sentence. On fail it steers the Writer's single retry, so it names the failure in
  // the text ("the narrator explains the scare after it lands"), not a vibe ("not scary enough").
  reason: z.string().min(1),
})
export type StoryGateVerdict = z.infer<typeof StoryGateSchema>

// Fallback rubrics when the channel has no operator-edited tasteRubric. Terse and checkable on
// purpose — vague virtues ("engaging", "well-paced") are useless to a gate. The horror entry is
// carried over from story-critic.v1's shipped rubric (proven; prose-craft lines kept because this
// gate reads final prose).
export const DEFAULT_TASTE_RUBRICS: Record<GenreModule, string> = {
  horror: `HOOK
- The first spoken line opens a curiosity gap or lands mid-tension; it names something concrete, not a mood.
- A viewer who hears only the first 3 seconds must need the answer to a question.
- Never opens with setting description, time-of-day, or a greeting.

BUILD
- Escalation happens through specific sensory details (a sound, an object out of place, a wrong reflection) — never through adjectives ("creepy", "terrifying").
- Ordinary life is textured and believable before anything unusual happens.
- Each beat raises the cost of ignoring the wrongness; no beat repeats the previous one at the same intensity.

PAYOFF
- The peak recontextualizes something planted earlier — a detail the viewer heard but misread.
- The ending lands within seconds of the peak; no epilogue that bleeds tension.
- Predictable-twist patterns are disqualifying: narrator-was-the-creature, it-was-a-dream, it-was-just-the-wind.

VOICE
- Reads as SPOKEN confession, not written prose: short lines, hesitations, one beat per line.
- Intimate 2AM register — telling a close friend, not narrating a documentary.

WORLD
- Grounded in believable local texture (places, habits, objects people actually have); nothing generic-western pasted in.

NEVER
- A hook that could open any story ("Something strange happened to me").
- Explaining the scare after it lands.
- More than two beats of setup before the first wrong detail.`,

  drama: `HOOK
- Opens inside the relationship or the wound — never with biography or scene-setting.

BUILD
- Emotion is carried by objects, actions, and what characters fail to say — never announced ("I was devastated").
- The viewer can feel what's unsaid before any character names it.

PAYOFF
- The turn changes what an earlier moment MEANT, not just what happens next.
- The ending leaves a mark — no clean bow, no moral spelled out.

VOICE
- Spoken, personal, specific; restraint at the biggest moment (the peak told smallest).

NEVER
- Tragedy the story didn't earn; grief as decoration.
- A character conveniently articulating the theme.`,

  commentary: `STANCE
- One clear claim, stated early, that a stranger could repeat in one sentence — and that someone could genuinely disagree with.

BASIS
- At least one concrete, checkable example carries the argument; assertion alone never does.
- The other side's strongest point is met, not a strawman.

VOICE
- Sounds like a person who actually holds this opinion — heat where it's earned, no manufactured outrage.

ENDING
- Closes on a line worth quoting back, not a wind-down summary.

NEVER
- Hedging that dissolves the stance ("both sides have a point" as a conclusion).
- Volume substituting for basis.`,

  reddit_story: `BELIEVABILITY (disqualifying if failed)
- Reads as a REAL post: mundane specifics no one would invent, seams and small tangents, a narrator who incriminates themselves a little.
- Nothing winks at the audience; nothing is too well-structured.

STAKES
- Small, real stakes a commenter would take sides over.

ENDING
- Stops the way real posts stop — on the unresolved question or the update, never a bow.

NEVER
- Colorful-instead-of-mundane details; a purely sympathetic narrator; a tidy moral.`,

  comedy: `SETUP
- An expectation is genuinely built before it's broken; the setup hides in plain sight.

PUNCH
- The turn is unexpected AND retroactively obvious; the funny word lands last.
- Escalation follows its own strict logic — absurd, never random.

VOICE
- Played straight; the narrator never laughs at their own joke or signals one is coming.

NEVER
- Explaining a punchline; general wackiness where a specific truth would be funnier.`,

  informational: `HOOK
- Opens on the surprise or the question — never background first.

SUBSTANCE
- One idea made concrete through a vivid example or felt-scale comparison; "a lot"/"huge" never does the work.
- The viewer's likely misconception is engaged, not ignored.

PAYOFF
- Ends with the idea in a carryable shape — the viewer could re-explain it.

NEVER
- Covering everything and landing nothing; claims the story hasn't made believable.`,

  lifestyle: `HOOK
- Leads with the payoff moment — the thing the viewer will want.

SUBSTANCE
- One real sensory anchor and one insider detail only a practitioner would know.
- Attainable: a viewer can see their own first step.

NEVER
- Glossy perfection without texture; a feature list instead of a moment.`,

  general: `HOOK
- The first spoken line earns the next ten seconds: a question opened, a tension entered, a promise made — never scene-setting or a greeting.

BUILD
- Concrete and specific throughout; abstractions never carry a beat.
- Every sentence earns its place — no filler connecting better lines.

PAYOFF
- The ending pays off something planted earlier; the story knows why it was told.

VOICE
- Sounds like a real person talking — spoken rhythm, natural variation, a genuine point of view.

NEVER
- An opening that could start any story; a summary line where a person would just stop.`,
}

export function defaultTasteRubric(genreCategory: string | null | undefined, niche: string): string {
  return DEFAULT_TASTE_RUBRICS[asGenreModule(genreCategory ?? null) ?? classifyGenre(niche)]
}

export interface StoryGateVars {
  channelName: string
  nicheDescription: string
  language: string
  tasteRubric: string // channel.tasteRubric ?? defaultTasteRubric(...)
  narration: string
  title: string
  logline: string
  operatorFeedback?: string | undefined // this reel's latest rejection — the same flaw cannot pass
}

export function buildStoryGatePrompt(v: StoryGateVars): { system: string; userMessage: string } {
  const system = `You are the final editorial gate for "${v.channelName}".
Niche: ${v.nicheDescription}

A finished ${v.language} narration script is about to ship. You answer ONE question: should this ship — yes or no?

How you judge:
- THE CREDIBILITY TEST comes first: read it as a skeptical listener who instantly smells over-polished, constructed, or AI-flavored writing. If you would not believe a real person said this out loud${v.language.toLowerCase() === 'taglish' ? ' — including whether the Taglish is how people actually talk, not textbook code-switching' : ''}, it fails.
- Then the channel's rubric below. A clear violation of a rubric line fails; judge against the rubric, not your personal taste.
- You do not rewrite, rank, or score. Pass or fail, with ONE blunt sentence of reason. On fail, the reason must point at the text (what fails and where), because it steers exactly one rewrite.
- Bar check: a good-enough story passes. This gate exists to catch real failures, not to chase perfection — most competent scripts should pass.`

  const userMessage = `RUBRIC — this channel's bar:
${v.tasteRubric}
${
    v.operatorFeedback
      ? `\nOPERATOR FEEDBACK — the previous draft for this exact reel was rejected: "${v.operatorFeedback}". A script exhibiting the same flaw CANNOT pass.\n`
      : ''
  }
SCRIPT — "${v.title}" (${v.logline}):
${v.narration}

OUTPUT (JSON only):
{
  "pass": true,
  "reason": ""   // one blunt sentence: why it ships, or exactly what fails and where
}`

  return { system, userMessage }
}
