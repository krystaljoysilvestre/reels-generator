// story-planner.v1 — the Writer's creative subconscious. ONE call that internally explores many
// premises and COMMITS to a single idea; the discards are never emitted. Output is an IDEA, not a
// beat sheet — professional writers receive an idea, and the Writer breathes.
//
// ⚠ HYPOTHESIS UNDER TEST: this single-planner exploration replaces the legacy best-of-6 prose
// sampling. The legacy path stays selectable (STORY_PLANNING_MODE in generate-story) until the
// blind premise A/B (scripts/ab-premises.ts) decides. Don't delete best-of-N before that.
//
// Versioned source code. Mechanics are baked into the prompt text, so their version rides along.

import { z } from 'zod'
import { STORY_MECHANICS_V1_VERSION, renderMechanics } from './story-mechanics.v1.js'
import { STORY_ELEMENTS_V1_VERSION, StoryElementsSchema, renderElementPalette, formatRecentElements, type StoryElements } from './story-elements.v1.js'
import { WRITER_IDENTITIES } from './writer-identities.v1.js'
import { asGenreModule, classifyGenre, type GenreModule } from './scenes.v1.js'

export const STORY_PLANNER_V1_VERSION = `planner.v1.1+${STORY_MECHANICS_V1_VERSION}+${STORY_ELEMENTS_V1_VERSION}`

// The committed idea. `mechanics` + `elements` are planner METADATA — the caller STRIPS them before
// the Writer sees the plan (INVARIANT 1: the Writer writes from the idea, never from labels).
// `elements` describes the committed idea's composition (for variety + analytics), never dictates it.
export const StoryPlanSchema = z.object({
  premise: z.string().min(1),
  conflict: z.string().min(1), // the tension at the story's heart, in the genre's own terms
  twist: z.string().min(1), // the turn — reveal, reversal, punchline, flip; genre decides
  ending: z.string().min(1),
  emotionalDestination: z.string().min(1), // what the viewer is left feeling
  logline: z.string().min(1), // one line — becomes the avoid-list entry future plans see
  whyThisStory: z.string().min(1), // the originality justification — why this over the discards
  mechanics: z.array(z.string()).default([]), // stable mechanic ids drawn on (audit only)
  elements: StoryElementsSchema, // story-composition labels for THIS idea (variety + analytics)
})
export type StoryPlan = z.infer<typeof StoryPlanSchema>

export interface StoryPlannerVars {
  channelName: string
  nicheDescription: string
  toneConfig: string // JSON stringified
  worldBibleJson: string
  genreCategory?: string | undefined
  targetSeconds: number
  angleDirective: string // rotated structural seed (story-angles) — cheap diversity across reels
  avoidList: string // recent stories' loglines/titles — the premise-repetition guard; '' if none
  rejectionAvoidList: string // channel-wide rejection anti-patterns; '' if none
  operatorFeedback?: string | undefined // THIS reel's latest rejection → re-plan, not re-word
  regenerationNonce?: number | undefined // must land in prompt text so the inputHash changes
  recentElements?: StoryElements[] | undefined // last ~15 stories' element labels → structural avoid
}

export function resolvePlannerGenre(genreCategory: string | null | undefined, niche: string): GenreModule {
  return asGenreModule(genreCategory ?? null) ?? classifyGenre(niche)
}

export function buildStoryPlannerPrompt(v: StoryPlannerVars): { system: string; userMessage: string } {
  const genre = resolvePlannerGenre(v.genreCategory, v.nicheDescription)
  const identity = WRITER_IDENTITIES[genre]
  const mechanics = renderMechanics(genre)
  const elementPalette = renderElementPalette(genre)
  const recentEls = v.recentElements ?? []

  const system = `You are the story planner for "${v.channelName}" — the creative subconscious of ${identity.label}.
Niche: ${v.nicheDescription}
Tone calibration (0–10 scales): ${v.toneConfig}

You do not write prose. You decide WHAT story deserves to exist next on this channel. The writer who executes your idea is always asking: ${identity.questionsAsked.join(' ')} Plan ideas that give those questions great answers.
${mechanics ? `\n${mechanics}\n` : ''}
WORLD BIBLE — ideas must fit this world (reuse canonical names; don't invent recurring elements):
${v.worldBibleJson}

HOW YOU WORK — explore, reject, commit:
Privately consider several genuinely DIFFERENT premises (different settings, different engines, different emotional shapes) — the way a writer mutters "nah… too predictable… we've already done that… what if—". Reject the predictable, the already-done, and the merely decent. Then COMMIT to the single freshest one and develop only it. Never output the discards; output ONE idea.

${elementPalette}

You will also DESCRIBE your committed idea along those dimensions (see the output). Describe the story you chose — don't reverse-engineer a story to hit labels. But quality comes first: if the strongest idea happens to share a dimension or two with recent ones, keep the stronger idea and vary elsewhere — never bend a story into something weaker just to be different.

GUARDS: fictionalize specific real places (invented street/business names; a real region/era is fine); no real, identifiable people; no graphic gore or sexual content; never harm to minors as subject matter; original work only — no retellings of known films, books, or copypastas.`

  const userMessage = `Plan the next story for this channel — a ~${v.targetSeconds}-second telling.

STRUCTURAL SEED for this round (interpret it in this niche's own terms; it shapes the idea's angle, not its content): ${v.angleDirective}

ALREADY TOLD ON THIS CHANNEL (premises) — don't reuse these:
${v.avoidList || '(nothing yet — the catalog is young; freshness still wins)'}

ALREADY USED ON THIS CHANNEL (story shape) — the real anti-sameness guard, because a different premise with the same shape still FEELS like the same story:
${formatRecentElements(recentEls)}
VARIETY RULE: your committed idea must differ from the recent stories on \`structure\` AND at least two other dimensions. Never reuse a recent (setting + trigger + turn) combination, a recent \`role\`, or (for horror) a recent \`anchor\`. A new noise in the same room happening to the same kind of person is NOT a new story.

Anti-patterns from rejected reels: ${v.rejectionAvoidList || 'none yet'}
${
    v.operatorFeedback
      ? `\nThis is regeneration attempt #${(v.regenerationNonce ?? 1)}. The operator rejected the previous story: "${v.operatorFeedback}". Re-plan — a DIFFERENT premise/approach that directly answers this, not the same idea reworded.\n`
      : ''
  }
OUTPUT (JSON only) — the ONE committed idea:
{
  "premise": "the situation, concrete and specific — who, where, what starts it",
  "conflict": "the tension at its heart, in this genre's own terms",
  "twist": "the turn — what the viewer learns/feels that reframes everything",
  "ending": "how it lands — the final beat",
  "emotionalDestination": "what the viewer is left feeling after the last line",
  "logline": "one sentence a stranger could repeat",
  "whyThisStory": "one sentence: why THIS deserves to exist over everything you rejected — what makes it fresh for this exact channel. If you can't justify it, it's generic: go back and commit to a better one.",
  "mechanics": ["stable ids of any library mechanics this idea draws on; [] if none"],
  "elements": {
    "structure": "which build archetype (see the palette)",
    "pov": "narrative vantage; omit if your structure already implies one",
    "role": "the protagonist's role in life",
    "setting": "the micro-location it happens in",
    "anchor": "the ordinary thing/routine it contaminates or hangs on; omit if none",
    "trigger": "the inciting detail",
    "turn": "the reveal/reversal type",
    "aftereffect": "what the viewer carries away",
    "tensionCurve": "the pacing shape only"
  }
}`

  return { system, userMessage }
}
