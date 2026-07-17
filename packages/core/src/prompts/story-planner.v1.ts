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
import { STORY_STYLES_V1_VERSION, resolveStyle, renderStyleForPlanner, type StyleInfluence } from './story-styles.v1.js'
import { WRITER_IDENTITIES } from './writer-identities.v1.js'
import { asGenreModule, classifyGenre, type GenreModule } from './scenes.v1.js'

export const STORY_PLANNER_V1_VERSION = `planner.v1.4+${STORY_MECHANICS_V1_VERSION}+${STORY_ELEMENTS_V1_VERSION}+${STORY_STYLES_V1_VERSION}`

// The committed idea. `mechanics` + `elements` are planner METADATA — the caller STRIPS them before
// the Writer sees the plan (INVARIANT 1: the Writer writes from the idea, never from labels).
// `elements` describes the committed idea's composition (for variety + analytics), never dictates it.
export const StoryPlanSchema = z.object({
  premise: z.string().min(1),
  conflict: z.string().min(1), // who wants what, and what's in the way — a want colliding with the world, in the genre's own terms
  escalation: z.string().min(1), // the middle's engine: how it tightens from premise to turn, each step caused by the last
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
  operatorSeed?: string | undefined // the operator's topic request for THIS reel; the idea must honor it
  avoidList: string // recent stories' loglines/titles — the premise-repetition guard; '' if none
  rejectionAvoidList: string // channel-wide rejection anti-patterns; '' if none
  operatorFeedback?: string | undefined // THIS reel's latest rejection → re-plan, not re-word
  regenerationNonce?: number | undefined // must land in prompt text so the inputHash changes
  recentElements?: StoryElements[] | undefined // last ~15 stories' element labels → structural avoid
  narrativeStyle?: string | undefined // the channel's storytelling tradition (story-styles); '' = pure genre
  styleInfluence?: StyleInfluence | undefined // how hard to lean into the style; default medium
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
  // Style layer: biases the plan's element/mechanic choices (never owns them). '' → pure genre.
  const styleSpec = resolveStyle(genre, v.narrativeStyle)
  const styleBlock = styleSpec ? `\n${renderStyleForPlanner(styleSpec, v.styleInfluence ?? 'medium')}\n` : ''
  // The writer's registers: the idea commits to ONE temperature at planning time (per-story judgment,
  // owner decision 2026-07-17) — recorded in elements.register, handed to the Writer, and read by the
  // voice-delivery envelope downstream.
  const registersBlock = identity.registers?.length
    ? `\nTHE WRITER'S REGISTERS — every idea has a temperature; commit yours to the ONE register it wants (record it in elements.register). Candidates, not a rotation — but a long streak in one register is its own sameness:\n${identity.registers.map((r) => `- ${r}`).join('\n')}\n`
    : ''

  const system = `You are the story planner for "${v.channelName}" — the creative subconscious of ${identity.label}.
Niche: ${v.nicheDescription}
Tone calibration (0–10 scales): ${v.toneConfig}

You do not write prose. You decide WHAT story deserves to exist next on this channel. The writer who executes your idea is always asking: ${identity.questionsAsked.join(' ')} Plan ideas that give those questions great answers.
${mechanics ? `\n${mechanics}\n` : ''}${styleBlock}${registersBlock}
WORLD BIBLE — ideas must fit this world (reuse canonical names; don't invent recurring elements):
${v.worldBibleJson}

HOW YOU WORK — explore, reject, commit:
Privately consider several genuinely DIFFERENT premises (different settings, different engines, different emotional shapes) — the way a writer mutters "nah… too predictable… we've already done that… what if—". Reject the predictable, the already-done, and the merely decent. Then COMMIT to the single freshest one and develop only it. Never output the discards; output ONE idea.

${elementPalette}

You will also DESCRIBE your committed idea along those dimensions (see the output). Describe the story you chose — don't reverse-engineer a story to hit labels. But quality comes first: if the strongest idea happens to share a dimension or two with recent ones, keep the stronger idea and vary elsewhere — never bend a story into something weaker just to be different.

GUARDS: fictionalize specific real places (invented street/business names; a real region/era is fine); no real, identifiable people; no graphic gore or sexual content; never harm to minors as subject matter; original work only — no retellings of known films, books, or copypastas.`

  const userMessage = `Plan the next story for this channel — a ~${v.targetSeconds}-second telling.
${
    v.operatorSeed?.trim()
      ? `\nOPERATOR REQUEST — this reel must be about: "${v.operatorSeed.trim()}"
Honor it. Explore several genuinely different treatments OF this subject and commit to the freshest one — the request decides WHAT the story is about; you still decide the angle, shape, and turn that make it worth telling.\n`
      : ''
  }
STRUCTURAL SEED for this round (interpret it in this niche's own terms; it shapes the idea's angle, not its content${v.operatorSeed?.trim() ? '; where it conflicts with the operator request, the request wins' : ''}): ${v.angleDirective}

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
STORY PHYSICS — the committed idea must hold together as drama, not as atmosphere. Apply these in THIS channel's own terms: a lived story has a protagonist; an explainer or argument answers the same physics with a question that tightens, facts that force each other, and an understanding that changes:
- CONFLICT IS A WANT. Someone wants something (even tiny — finish the shift, get home, be believed) and something is in the way. In an explainer: the viewer's assumption colliding with how it actually works. "A creepy feeling grows" is a mood, not a conflict.
- THE MIDDLE IS CHOICES. In a lived story the protagonist DECIDES things, and each decision costs — ignoring it has a price, checking has a price, telling someone has a price; things happening TO a passive narrator is not escalation. In an explainer, each revelation forces the next question.
- CAUSE, NEVER SEQUENCE. The beats chain with "therefore" and "but", never "and then". If your logline reads "this happened, and then this happened", reject the idea and tighten it.

OUTPUT (JSON only) — the ONE committed idea:
{
  "premise": "the situation, concrete and specific — who, where, what starts it",
  "conflict": "who wants what, and what stands in the way — a want colliding with the world, in this genre's own terms",
  "escalation": "the middle's engine: the few turns between premise and the turn, chained by therefore/but — in a lived story, each caused by a choice that costs more than the last; in an explainer/argument, each revelation forcing the next question",
  "twist": "the turn — what the viewer learns/feels that reframes everything",
  "ending": "how it lands — the final beat, one breath past the turn: what is DIFFERENT now",
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
    "tensionCurve": "the pacing shape only",
    "register": "the ONE register this idea commits to (from the writer's registers, in its own words); omit if the genre has none"
  }
}`

  return { system, userMessage }
}
