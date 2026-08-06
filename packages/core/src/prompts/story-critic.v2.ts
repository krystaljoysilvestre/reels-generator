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
import { isFilipinoRegister } from './story-craft.v1.js'

// v2.19 — TERMINAL EXPOSITION, all genres. The gate now rejects endings that name their own meaning
// instead of placing the last concrete thing. Two observed cases (2026-08-05) shared one mechanism: an
// explainer closed on an aphorism ("that's all it takes to remind us we're not standing on solid
// ground"), and a fairytale glossed its own closing image ("like it was saying, I see what this cost
// you"). Both passed, because ending coverage was wildly uneven: lifestyle had NO ending test at all,
// comedy tested only the punchline, commentary's "worth quoting" is unfalsifiable, informational's
// "carryable shape" is aced by an aphorism, and drama's "leaves a mark" was a vibe. Horror, reddit_story
// and childrens were already concrete and are left near-untouched.
//
// The lever is judge-side on purpose. The Writer's shape law 4 already demands the change be SHOWN
// ("show the change still living"), so the standard existed and the judge was blind to it; adding another
// generative mandate is how the sentence-rhythm monoculture was manufactured. Every genre gets its OWN
// wording (a comedy button and a fairytale restoration are not the same landing), and the universal
// STORY PHYSICS check gains the DELETION TEST so the failure is mechanical rather than tasteful.
//
// Deliberately NOT tightened: childrens — a warmly named moral IS its register ("and they lived happily
// ever after" is not a flaw there); the fairytale line targets glossing an IMAGE, not naming a moral.
// Falsifier to watch: if closing-kind diversity collapses (see apps/worker/scripts/endings-audit.ts —
// the landingKind histogram), we traded one AI tell for another and these criteria come back out.
export const STORY_CRITIC_V2_VERSION = 'story-critic.v2.19'

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
- The LAST thing is a thing SEEN or DONE, never a thing understood — the story ends on the image, and the fear outlives it. A closing line that interprets the dread ("and I've never felt safe since") trades the scare for a summary.
- Predictable-twist patterns are disqualifying: narrator-was-the-creature, it-was-a-dream, it-was-just-the-wind.

VOICE
- Reads as SPOKEN confession, not written prose: hesitations and self-corrections, in the VARIED rhythm of real speech — never a uniform one-beat-per-line / all-fragments cadence (a templated rhythm is its own AI tell).
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
- Concretely: the last beat answers the story's emotional question through an ACTION or an IMAGE — often the opening echoed back, changed — and it is small, because everything has already happened emotionally. A closing line that explains the feeling instead of showing it fails.

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
- That line COMMITS — it is the argument's sharpest statement of where the speaker stands, not a restatement of the opening claim in softer words.
- Test by DELETION: cut the closing lines. If nothing is lost, the piece stopped arguing before it ended.

NEVER
- Hedging that dissolves the stance ("both sides have a point" as a conclusion).
- Volume substituting for basis.
- Closing by naming the story's own significance instead of taking the last position ("it just goes to show…", "and that says a lot about…").`,

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

LANDING
- The story STOPS on the punch — or on one dry tag after it that makes the punch land twice. Nothing follows that.
- Any line after the punch/tag that explains, softens, summarizes, or winds down is a fail: it gives the audience their laugh back.

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

LANDING
- The closing lines put the idea somewhere concrete — an object, a place, a moment, or the viewer's own surroundings — so the ending hands over a thing, not a phrase.
- Test by DELETION: cut the closing lines. Does the viewer lose any information? If nothing is lost, the ending is decoration on a payoff that already happened earlier — fail it.

NEVER
- Covering everything and landing nothing; claims the story hasn't made believable.
- Closing by naming the story's own significance — "that's all it takes to remind us…", "shows us that…", "we're all just…". The viewer already has the idea; an aphorism takes the place of the last concrete thing they could have carried.`,

  lifestyle: `HOOK
- Leads with the payoff moment — the thing the viewer will want.

SUBSTANCE
- One real sensory anchor and one insider detail only a practitioner would know.
- Attainable: a viewer can see their own first step.

LANDING
- Ends by putting the FIRST STEP in the viewer's hands — small, specific, and doable now (a thing they could start before their coffee goes cold), not a general encouragement to try someday.
- Test by DELETION: cut the closing lines. Does the viewer lose anything? If nothing is lost, the reel trailed off instead of landing.

NEVER
- Glossy perfection without texture; a feature list instead of a moment.
- Ending on a wind-down or a vague invitation ("give it a try", "hope you enjoyed") — the reel should stop on the doable thing, not on politeness.`,

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

HEART (the storybook close)
- A gentle truth the child carries away, SHOWN through what the hero does AND named warmly in a simple closing line — the way storybooks end ("…and she learned that even the smallest light can lead you home"). This warm, named takeaway is on-register and welcome, NOT a flaw.
- What fails is PREACHINESS: a moral the story didn't earn, or a lecture ("you should always be kind") instead of a warm, felt line that grows out of what the hero just did. An ending with NO gentle takeaway at all also misses the register.

VOICE
- Simple, musical, read-aloud rhythm with a refrain a child could chant along with; vary the line length naturally — not every line a fragment.
- Concrete and picturable — a child can SEE every beat ("ribbons danced like butterflies", not "she was happy"). Gentle, inclusive humor welcome; never mean.
- SIMPLE ENOUGH FOR A SMALL CHILD: everyday words a young child actually knows. Literary, poetic, or grown-up vocabulary is a fail. Prefer the plain everyday NATIVE word over a fancy synonym or a borrowed/imported word when a common native word exists — a child uses the ordinary word, not the elevated or loaned one. Abstract or introspective grown-up phrasing and similes a child cannot picture ("a question you can't quite name", "the kind of sadness that isn't anger, just heavy") are a fail. If a five-year-old wouldn't understand or picture it, it doesn't belong.
- SENTENCE STRUCTURE stays childlike — short, clear sentences, one simple thought at a time. The variety wanted here is childlike (a short line, a slightly longer warm one, a refrain), never adult winding run-ons or stacked introspection.
- FAMILIAR OBJECTS: the things in the story are common, everyday objects a child instantly knows (a blanket, a toy, a slipper, a pet, the moon, a lamp, a firefly). An unusual or unfamiliar object a small child wouldn't recognize (an odd instrument, an exotic or made-up thing) is a fail.
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
- A hero rewarded for being special instead of virtuous; magic with no rule or cost; obscure or literary words that lose a child; modern sarcasm or self-aware irony that breaks the timeless tone (unless deliberately fractured/comic); a grimdark or gory tale with no thread of hope; a world left merely saved, not healed.
- Explaining the symbol as it lands — glossing the closing image with what it means ("like it was saying, I see what this cost you"). The tale may NAME its moral; it must never INTERPRET its own picture. If the closing image needs a gloss, extend the image instead.`,

  general: `HOOK
- The first spoken line earns the next ten seconds: a question opened, a tension entered, a promise made — never scene-setting or a greeting.

BUILD
- Concrete and specific throughout; abstractions never carry a beat.
- Every sentence earns its place — no filler connecting better lines.

PAYOFF
- The ending pays off something planted earlier; the story knows why it was told.
- Test by DELETION: cut the closing lines. Does the viewer lose any information, image, or consequence? If nothing is lost, the real payoff happened earlier and the ending is decoration.

VOICE
- Sounds like a real person talking — spoken rhythm, natural variation, a genuine point of view.

NEVER
- An opening that could start any story; a summary line where a person would just stop.
- Closing by naming what the story means instead of placing the last concrete thing.`,
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
- LANGUAGE NATURALNESS (any language) is a hard fail: any line that reads like a sentence translated word-for-word from another language, any garbled or grammatically-wrong phrase, or a title in the wrong language, = FAIL — name the exact line in your reason so the rewrite can fix it.${isFilipinoRegister(v.language) ? '\n- For this Filipino channel specifically: textbook/literary Tagalog or forced, perfectly-balanced code-switching also fails — it should read as natural, contemporary spoken Filipino, code-switched the way people actually talk.' : ''}
- SENTENCE-RHYTHM VARIETY: real speech is bursty — sentences of varied length. A uniform, templated cadence — nearly every beat a short fragment or one-beat-per-line, the same em-dash-aside → short-punch shape repeated, mechanical one/two-word punch lines — is an AI tell and fails, even when each line is individually fine. (Intentional refrains are welcome; a monotonous rhythm is not.)
- STORY PHYSICS — where this script tells a story (someone lived something), four script-doctor checks. A clear miss on any is a fail worth naming:
  · AGENCY: does the narrator DECIDE anything, or do things merely happen to a passive witness?
  · CAUSALITY: do the beats force each other ("therefore/but"), or just follow each other ("and then")?
  · THE DEBT: does the ending answer the question the opening planted — or twist from nowhere? The opening writes a check; the ending must cash THAT one, not a different, easier one.
  · THE ARRIVAL: is anything different at the end (in the narrator, their world, or the viewer's understanding) — or does it just stop? And is the difference DELIVERED rather than announced: the closing lines place a concrete thing (an image, an action, an object, the viewer's own surroundings) instead of naming what the story means. Deletion test — cut the closing lines: if the viewer loses nothing, the real payoff happened earlier and the ending is decoration on top of it.
  (An explainer or argument answers these in its own terms: a claim advanced, a question paid off, an understanding changed. A Reddit post answers them in ITS terms: AGENCY = the narrator or their target DID something, not just felt something; THE CHANGE = the payoff landed — revenge taken, rule backfired, disaster arrived — OR, for an "am I wrong?" post, the verdict question thrown hard to the viewer. An open verdict is a real ending; a revenge or disaster story that just trails off is not.)
- SHOW THE TURN — the beat the whole story turns on (the decision, the reversal, the near-failure, the moment of doubt that EARNS the ending) must be dramatized as a concrete, felt moment, not collapsed into a bald summary ("tapos wala", "gusto niyang sumuko", "and everything changed", "napagtanto niya"). Where the payoff depends on a low or doubting beat first, that beat must be FELT (the breath that catches then the light that dies, the trembling voice) so the turn is earned, not asserted. A hollow or summarized turn fails. This is NOT a ban on plainness or warm, directly-stated feeling — only on flattening the one beat the whole story rides on.
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
