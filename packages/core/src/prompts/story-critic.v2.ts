// story-critic.v2 — the editorial gate: should this ship? Reads the FINAL script once and answers
// pass/fail with one line of reason. No ranking, no scoring axes, no candidates (that was v1's
// best-of-N job; v1 stays untouched for the legacy path). A fail buys exactly ONE Writer rewrite,
// then the runtime enforces bounded retry and review policy.
//
// Per-genre DEFAULT rubrics replace v1's single horror-specific fallback. This is the documented
// unbiased-design exception: deliberate owner-set defaults used only when a channel hasn't mined
// its own tasteRubric — and every line is CHECKABLE against the text, never a creative quota.
// Versioned source code. Bump on any prompt-affecting edit.

import { z } from 'zod'
import type { SourcePolicy } from '../types/source-policy.js'
import { type GenreModule } from './scenes.v1.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, resolveWritingGenre, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'
import { isFilipinoRegister } from './story-craft.v1.js'

// Back to v2.18 content and version: the v2.19 ending criteria (per-genre LANDING checks + the universal
// DELETION TEST) are reverted per decision-log 2026-08-06-003. A blind read found no text-level ending
// defect the founder can see, and these were GATE criteria — a rejection re-rolls the whole chain, so a
// standard we cannot defend costs real spend and replaces good stories rather than fixing them.
export const STORY_CRITIC_V2_VERSION = `story-critic.v2.20+${STORY_CONTEXT_VERSION}`

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
  // The recurring Customer Zero failure was not bad wording; it was a script that named events without
  // carrying enough of their meaning for a first-time listener. Keep that judgment explicit so a model
  // cannot return pass=true while quietly admitting that the story has no intelligible whole.
  essence: z.object({
    pass: z.boolean(),
    reason: z.string().min(1),
  }),
})
export type StoryGateVerdict = z.infer<typeof StoryGateSchema>

/**
 * The top-level verdict and the structured essence check are a conjunction. Models occasionally emit a
 * contradictory top-level `pass`; normalize it in code so the structured evidence, not schema luck,
 * decides whether the story advances. The essence reason is also the useful steering instruction.
 */
export function enforceStoryGateEssence(verdict: StoryGateVerdict): StoryGateVerdict {
  if (verdict.essence.pass) return verdict
  return { ...verdict, pass: false, reason: verdict.essence.reason }
}

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
- Reads as SPOKEN confession, not written prose: hesitations and self-corrections, in the VARIED rhythm of real speech — never a uniform one-beat-per-line / all-fragments cadence (a templated rhythm is its own AI tell).
- The emotional movement is intentional — quiet dread, coiled suspense, kinetic shock and earned transitions can all work. Fail an accidental blend that weakens fear, not a purposeful change of temperature. Loud is legitimate when earned; gore never is.

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
- One clear, supported position a stranger could repeat. A direct take can state it early; a selected personal essay may earn it by the end, and satire may make its target clear through the bit.

BASIS
- At least one concrete, checkable example carries the argument; assertion alone never does.
- When the argument engages an opposing position, it addresses that position fairly rather than a strawman.

VOICE
- Sounds like a person who actually holds this opinion — heat where it's earned, no manufactured outrage.

ENDING
- Closes on a line worth quoting back, not a wind-down summary.

NEVER
- Hedging that dissolves the stance ("both sides have a point" as a conclusion).
- Volume substituting for basis.`,

  reddit_story: `THE CORE TEST — does this sound like a believable post in the selected form? Moral-jury posts need a genuine dilemma; revenge needs its payoff; a confession, discovery or creepy encounter earns disclosure, recognition or unease. An argument in the comments is not required of every form.

HOOK
- Opens on a plain PROBLEM or dilemma the viewer will follow within the first breath — a wrong done, a mess the narrator caused, a mystery, a secret. Not slow scene-setting.

BELIEVABILITY (disqualifying if failed)
- Reads as a REAL post: mundane, over-specific detail no one would invent (names, ages, amounts, how long), seams and small tangents, a narrator who incriminates themselves a little.
- Nothing winks at the audience; nothing sounds polished, structured, or literary — the instant it reads as written, it fails.

STAKES
- A situation that matters to this teller and gives the chosen post a reason to exist. A moral-jury post invites sides; other forms need not. Scale may be trivial or life-altering.

ENDING — the test is AUTHENTICITY, not open-vs-closed. End the way a REAL poster of THIS kind of story would:
- A revenge / malicious-compliance / TIFU story lands its payoff (the comeuppance, the backfire, the damage).
- An "am I wrong?" throws the verdict question to the viewer.
- A confession / creepy encounter / still-unfolding situation may just STOP, unresolved — that is authentic and fine.
- What FAILS is a SCRIPTED ending: a tidy moral, a lesson stapled on, a lyrical drama fade, or a conflict resolved neatly offscreen.

NEVER
- Sounding authored — the spell of realness is the entire product.
- A post whose promised dilemma, revelation, confession or payoff never arrives.
- Contrived details or self-presentation that break credibility; an unearned moral. A sympathetic narrator does not need invented faults.`,

  comedy: `SETUP
- An expectation is genuinely built before it's broken; the setup hides in plain sight.

PUNCH
- The payoff earns the intended laugh: a surprise should fit in hindsight, while observational comedy may land through precise recognition. Preserve the timing and word placement that make THIS joke work; surprise and a final funny word are not universal requirements.
- Escalation follows its own strict logic — absurd, never random.

VOICE
- Played straight; the narrator never laughs at their own joke or signals one is coming.

NEVER
- Explaining a punchline; general wackiness where a specific truth would be funnier.`,

  informational: `HOOK
- Opens on the surprise or the question — never background first.

SUBSTANCE
- One idea made concrete through a vivid example or felt-scale comparison; "a lot"/"huge" never does the work.
- The viewer's actual question or gap in understanding is addressed. Correct a misconception when relevant; do not invent one to justify explaining something.

PAYOFF
- Ends with the idea in a carryable shape — the viewer could re-explain it.

NEVER
- Covering everything and landing nothing; claims the story hasn't made believable.`,

  lifestyle: `HOOK
- Establishes why this experience is worth following. Payoff-first can work; a selected day-in-the-life or process form may build toward it.

SUBSTANCE
- Specific sensory or practical detail makes the experience credible; do not demand insider detail the narrator could not know.
- Attainable: a viewer can see their own first step.

NEVER
- Glossy perfection without texture; a feature list instead of a moment.`,

  childrens: `GOAL
- A clear focus and level of complexity appropriate to the channel's stated child audience. A young child may need one simple goal; do not impose preschool limits on older children.
- The problem feels BIG to a child even if small to an adult (a lost sock, the dark, a first day) — taken seriously, never belittled.

DELIGHT & WONDER
- A genuine spark of wonder or delight a child would light up at — ideally an ordinary thing turned marvelous-but-safe.
- The tone stays warm and playful throughout — never sarcastic, grim, or cynical.

HERO
- A small hero (a child or a friendly creature) a child can root for, who DOES a small brave or kind thing themselves.

SAFETY (disqualifying if failed)
- Age-appropriate throughout; any scare or problem is gentle and quickly made safe.
- The ending leaves the child SAFE, warm, and reassured — never frightened, grieving, or left hanging.

HEART (the storybook close)
- A gentle truth the child carries away, SHOWN through what the hero does AND named warmly in a simple closing line — the way storybooks end ("…and she learned that even the smallest light can lead you home"). This warm, named takeaway is on-register and welcome, NOT a flaw.
- What fails is PREACHINESS: a moral the story didn't earn, or a lecture ("you should always be kind") instead of a warm, felt line that grows out of what the hero just did. An ending with NO gentle takeaway at all also misses the register.

VOICE
- Simple, musical, read-aloud rhythm with a refrain a child could chant along with; vary the line length naturally — not every line a fragment.
- Concrete and picturable — a child can SEE every beat ("ribbons danced like butterflies", not "she was happy"). Gentle, inclusive humor welcome; never mean.
- AUDIENCE-APPROPRIATE LANGUAGE: vocabulary and comparisons must be understandable to the stated child audience. Native and borrowed words are judged by familiarity and accuracy, not origin. An unfamiliar word or idea can be introduced clearly; do not require prior knowledge or impose a five-year-old standard on older children.
- SENTENCE STRUCTURE stays childlike — short, clear sentences, one simple thought at a time. The variety wanted here is childlike (a short line, a slightly longer warm one, a refrain), never adult winding run-ons or stacked introspection.
- PICTURABLE WORLD: let the intended child audience understand the things that matter. Familiar objects and clearly introduced new wonders both work; novelty alone is not a failure.
- OPENER & CLOSE: a warm storybook opener that invites the child in, and a cozy closing frame that lets the tale settle — in the SPIRIT of "once upon a time…" / "…happily ever after", never the literal cliché.

NEVER
- Real cruelty, peril, or loss left unresolved; an adult, bittersweet, or sad-without-comfort ending.
- A lesson so preachy the story disappears.
- "Show, don't tell" pushed so hard that the warmth and the refrain get stripped out.`,

  fairytale: `MORAL SPINE
- ONE clear moral truth at the core, and every major beat reinforces it (kindness over cruelty, humility over pride, keeping a promise, love over fear). A tale with no moral center is just fantasy — fail it.

SYMBOLIC MAGIC
- The central magic MEANS something human (a wilting rose = a life running out; an endless winter = grief; a mirror = self-acceptance). Magic that is pure decoration or spectacle, signifying nothing, is a fail.
- Magic follows a rule with a felt cost or consequence; magic that solves the problem for free, with no choice or price, is a fail.

HERO
- An ordinary hero defined by CHARACTER, not power, and never "chosen/special". They EARN the wonder through a virtuous act (a kindness, a kept promise, a spared creature) BEFORE magic rewards them. If the magic would come regardless of what the hero did, fail it.

TRIAL & TURN (disqualifying if failed)
- At the darkest moment the hero prevails through their own character, not a bigger spell; the climax is a MORAL choice (revenge or forgiveness, power or love). Show the turn as a felt moment, never summarized.
- The ending RESTORES — the world healed, not merely saved (the forest blooms, spring returns, the family reunites). A merely-saved or unresolved ending is a fail.

VOICE
- SIMPLE, FAMILIAR words carrying deep feeling ("simple words, felt deeply"), in a timeless told-aloud cadence. A listener — even a child — should understand every word; obscure or literary vocabulary is a fail. If a magical being appears, use a familiar name from the story's own tradition (a fairy, a spirit) OR make plain what it is in the same breath — an obscure being-name the listener must already know is a fail unless the story instantly makes clear what it is.
- The DEPTH is all-ages — real trials, a bittersweet cost, a moral choice — but the WORDS stay simple; never sand the meaning down to a toddler story, and never dress it up in fancy vocabulary. Concrete, archetypal images anyone across generations could picture.

NEVER
- A hero rewarded for being special instead of virtuous; magic with no rule or cost; obscure or literary words that lose a child; modern sarcasm or self-aware irony that breaks the timeless tone (unless deliberately fractured/comic); a grimdark or gory tale with no thread of hope; a world left merely saved, not healed.`,

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
  return DEFAULT_TASTE_RUBRICS[resolveWritingGenre(genreCategory, niche)]
}

// The ONE seam that resolves what the gate judges against. Two channel fields feed it and they mean
// different things, which is the whole reason this function exists:
//
//   · tasteRubric        — an operator-authored rubric that REPLACES the built-in one wholesale.
//                          Long-standing behaviour; a human who writes a full rubric means it.
//   · editorialPrinciples — the channel's own rules, COMPILED from the creator's channel idea
//                          (channel.v1). These COMPOSE ONTO whichever base rubric applies.
//
// Composing rather than replacing is load-bearing. A compiled principles block is a handful of house
// rules ("no cheap jump scares", "always cite sources"); the base rubric is ~25 lines of genre craft.
// Letting the former replace the latter would quietly make the gate *weaker* for exactly the channels
// that bothered to state a bar — the opposite of the point. Principles go last so they read as the
// channel's additional word on top of the craft standard.
export function composeTasteRubric(
  opts: {
    tasteRubric?: string | null | undefined
    editorialPrinciples?: string | null | undefined
    genreCategory?: string | null | undefined
    niche: string
  },
): string {
  const operatorRubric = opts.tasteRubric?.trim()
  const base = operatorRubric
    ? `OPERATOR-AUTHORED FULL RUBRIC — replaces the built-in genre rubric. These explicit criteria remain binding; do not dismiss them as optional genre defaults. Source fidelity and safety constraints still take precedence.\n${operatorRubric}`
    : `BUILT-IN GENRE DEFAULTS — apply these where compatible with the creator's declared form, voice, audience and style influence. A deliberate departure from a default technique is not a failure.\n${defaultTasteRubric(opts.genreCategory, opts.niche)}`
  const principles = opts.editorialPrinciples?.trim()
  if (!principles) return base
  return `${base}\n\nTHIS CHANNEL'S OWN RULES — set by the creator, and binding on top of everything above:\n${principles}`
}

export interface StoryGateVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
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
${v.creativeContext ? `\n${renderStoryCreativeContext(v.creativeContext)}\n` : ''}
${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}

A finished ${v.language} narration script is about to ship. You answer ONE question: should this ship — yes or no?

How you judge:
- THE CREDIBILITY TEST: does the telling work as the chosen voice and form for this audience? Reject accidental mechanical or incoherent language. A practiced storyteller, poet, precise documentary narrator or casual confessor can each be credible; do not require spontaneous conversation from every form.
- LANGUAGE NATURALNESS (any language) is a hard fail: any line that reads like a sentence translated word-for-word from another language, any garbled or grammatically-wrong phrase, or a title in the wrong language, = FAIL — name the exact line in your reason so the rewrite can fix it.${isFilipinoRegister(v.language) ? '\n- For this Filipino channel specifically: judge Filipino against the selected audience and voice. Broken phrasing and forced code-switching fail; formal, literary or monolingual Filipino can be intentional and valid.' : ''}
- RHYTHM: reject monotonous or templated pacing that weakens the intended experience. Preserve purposeful meter, parallelism, refrains, measured precision and comic timing. Sentence length or repeated shape alone does not prove a failure.
- STORY DEVELOPMENT — apply these in the creator's genre and form:
  · INVOLVEMENT: when characters drive the story, do their wants, choices and pressures matter, or are they interchangeable spectators? Do not demand that an outside narrator personally caused the events, or invent agency for a factual subject.
  · COHERENCE: do asserted causes and consequences hold? An intentional nonlinear, associative or observational structure is valid when its purpose is intelligible; coincidence that substitutes for an earned payoff is not.
  · PROMISE: does the story deliver the experience or question its opening invites? An earned recognition, explanation, reassurance, joke or open question can pay it off without a surprise or changed belief.
  · PROGRESSION: does the middle develop that experience rather than repeat or compress away what matters? Judge a confession, moral-jury post, discovery, poem or argument in its own form; an unresolved situation may end honestly when its promised experience has landed.
- ESSENCE — make this separate verdict before the overall decision. A first-time listener, without relying on the title, source dossier, or prior knowledge, must be able to say what the story is centrally about, what changed or was decided, and why that consequence matters. Include the context needed to understand the causal spine; a sequence of names/events, a compressed outline, or a short script that merely gestures at its significance fails. Do NOT reward background for its own sake, demand a minimum duration or beat count, or require the script to state a theme. Judge whether THIS story's own promise is intelligible and felt.
- EARN THE PIVOTAL MOMENT — give the development the story rides on enough clarity and weight to land. In drama that may require a felt scene; in an explainer it may be a clear account of why something follows. Do not reward an announced transformation that the telling never earns, and do not demand invented dialogue or emotions from nonfiction. Direct warmth and an earned named takeaway can belong to the form.
- Then the rubric below, interpreted through the creator's contract. The creator's explicit rules remain binding; built-in genre defaults apply only where compatible with the selected form, voice and audience. Reject a concrete failure of the intended experience, not an intentional departure from a default technique. Factual truth requires external evidence; do not invent factual corrections from your own confidence.
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
  "rewriteCanFix": true,  // FAIL only: can a rewrite of this SAME idea fix it? idea/premise-level failure ⇒ false; when unsure, true
  "essence": {
    "pass": true,
    "reason": ""          // concrete evidence that the whole is intelligible, or what context/causal meaning is missing
  }
}`

  return { system, userMessage }
}
