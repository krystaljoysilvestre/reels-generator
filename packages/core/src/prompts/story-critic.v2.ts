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

export const STORY_CRITIC_V2_VERSION = 'story-critic.v2.10'

export const StoryGateSchema = z.object({
  pass: z.boolean(),
  // One blunt sentence. On fail it steers the Writer's single retry, so it names the failure in
  // the text ("the narrator explains the scare after it lands"), not a vibe ("not scary enough").
  reason: z.string().min(1),
  // On a FAIL only: could a rewrite of the SAME idea plausibly fix this? Prose/voice/ending
  // execution → true. A failure baked into the idea/premise/structure (no dilemma to argue, wrong
  // genre grammar, nothing at stake) → false, so the pipeline skips a retry that would re-run the
  // whole chain and fail again. Optional + safe default: absent or true ⇒ retry (status quo);
  // only an explicit false skips it. Ignored on a pass.
  rewriteCanFix: z.boolean().optional(),
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
- Committed to ONE register — intimate 2AM dread, coiled suspense, or kinetic shock all pass; a story that blends registers into mush fails. Loud is legitimate when the story earns it; gore never is.

WORLD
- Grounded in the believable texture of this channel's own world (places, habits, objects its people actually have); nothing pasted in from another culture's stock imagery.

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
- Spoken, personal, specific. The peak is CONTROLLED for its register: a quiet-ache story tells it smallest; a confrontation says it out loud and pays for it — either passes; melodrama (emotion announced, not carried) fails in both.

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

  reddit_story: `THE CORE TEST — does it read like a real person's real experience you're overhearing ("did this actually happen?"), and would strangers argue in the comments (who's right, who's lying, is this even real)? If there's nothing to argue about, or it sounds authored, it fails no matter how well-written.

HOOK
- Opens on a plain PROBLEM or dilemma the viewer will follow within the first breath — a wrong done, a mess the narrator caused, a mystery, a secret. Not slow scene-setting.

BELIEVABILITY (disqualifying if failed)
- Reads as a REAL post: mundane, over-specific detail no one would invent (names, ages, amounts, how long), seams and small tangents, a narrator who incriminates themselves a little.
- Nothing winks at the audience; nothing sounds polished, structured, or literary — the instant it reads as written, it fails.

STAKES
- A real situation a commenter would take a side over. Scale is open: trivial (a stolen lunch) OR life-altering (a betrayal, a life's savings) both pass — never judge "big enough" or "small enough".

ENDING — the test is AUTHENTICITY, not open-vs-closed. End the way a REAL poster of THIS kind of story would:
- A revenge / malicious-compliance / TIFU story lands its payoff (the comeuppance, the backfire, the damage).
- An "am I wrong?" throws the verdict question to the viewer.
- A confession / creepy encounter / still-unfolding situation may just STOP, unresolved — that is authentic and fine.
- What FAILS is a SCRIPTED ending: a tidy moral, a lesson stapled on, a lyrical drama fade, or a conflict resolved neatly offscreen.

NEVER
- Sounding authored — the spell of realness is the entire product.
- A quiet, plotless literary vignette with nothing to argue over (that's a drama story, not a Reddit post).
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

  childrens: `GOAL
- ONE simple, clear thing the little hero wants, easy for a small child to follow — no subplots, no two threads to track.
- The problem feels BIG to a child even if small to an adult (a lost sock, the dark, a first day) — taken seriously, never belittled.

DELIGHT & WONDER
- A genuine spark of wonder or delight a child would light up at — ideally an ordinary thing turned marvelous-but-safe.
- The tone stays warm and playful throughout — never sarcastic, grim, or cynical.

HERO
- A small hero (a child or a friendly creature) a child can root for, who DOES a small brave or kind thing themselves.

SAFETY (disqualifying if failed)
- Age-appropriate throughout; any scare or problem is gentle and quickly made safe.
- The ending leaves the child SAFE, warm, and reassured — never frightened, grieving, or left hanging.

HEART
- A gentle truth or kindness the child carries away — carried by what the HERO DOES, not lectured. Warm FEELING said plainly is on-register (a directly-kind line, a refrain); a stapled-on MORAL is not.

VOICE
- Simple, musical, read-aloud rhythm; short lines; a refrain a child could chant along with.
- Concrete and picturable — a child can SEE every beat ("ribbons danced like butterflies", not "she was happy"). Gentle, inclusive humor welcome; never mean.

NEVER
- Real cruelty, peril, or loss left unresolved; an adult, bittersweet, or sad-without-comfort ending.
- A lesson so preachy the story disappears.
- "Show, don't tell" pushed so hard that the warmth and the refrain get stripped out.`,

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
- THE CREDIBILITY TEST comes first: read it as a skeptical listener who instantly smells over-polished, constructed, or AI-flavored writing. If you would not believe a real person said this out loud, it fails.
- LANGUAGE NATURALNESS (any language) is a hard fail: any line that reads like a sentence translated word-for-word from another language, any garbled or grammatically-wrong phrase, or a title in the wrong language, = FAIL — name the exact line in your reason so the rewrite can fix it.${v.language.toLowerCase() === 'taglish' ? '\n- For this Taglish channel specifically: textbook/literary Tagalog or forced, perfectly-balanced code-switching also fails — it should read as natural, contemporary spoken Taglish.' : ''}
- STORY PHYSICS — where this script tells a story (someone lived something), four script-doctor checks. A clear miss on any is a fail worth naming:
  · AGENCY: does the narrator DECIDE anything, or do things merely happen to a passive witness?
  · CAUSALITY: do the beats force each other ("therefore/but"), or just follow each other ("and then")?
  · THE DEBT: does the ending answer the question the opening planted — or twist from nowhere?
  · THE CHANGE: is anything different at the end (in the narrator, their world, or the viewer's understanding) — or does it just stop?
  (An explainer or argument answers these in its own terms: a claim advanced, a question paid off, an understanding changed. A Reddit post answers them in ITS terms: AGENCY = the narrator or their target DID something, not just felt something; THE CHANGE = the payoff landed — revenge taken, rule backfired, disaster arrived — OR, for an "am I wrong?" post, the verdict question thrown hard to the viewer. An open verdict is a real ending; a revenge or disaster story that just trails off is not.)
- Then the channel's rubric below. A clear violation of a rubric line fails; judge against the rubric, not your personal taste.
- You do not rewrite, rank, or score. Pass or fail, with ONE blunt sentence of reason. On fail, the reason must point at the text (what fails and where), because it steers exactly one rewrite.
- On a FAIL, also judge rewriteCanFix: could a better TELLING of this SAME idea plausibly pass — a prose/voice problem, an announced feeling, a translated line, a fumbled ending's execution? Then true. Or is the failure in the IDEA itself — the premise has no dilemma to argue, it's the wrong grammar for this genre, nothing is at stake, a structure a rewrite of the same plan cannot repair? Then false (a rewrite would just re-run and fail again). When unsure, true. On a pass, ignore it.
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
  "reason": "",           // one blunt sentence: why it ships, or exactly what fails and where
  "rewriteCanFix": true   // FAIL only: can a rewrite of this SAME idea fix it? idea/premise-level failure ⇒ false; when unsure, true
}`

  return { system, userMessage }
}
