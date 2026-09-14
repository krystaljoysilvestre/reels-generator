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
import { type SourcePolicy } from '../types/source-policy.js'
import { STORY_MECHANICS_V1_VERSION, renderMechanics } from './story-mechanics.v1.js'
import { STORY_ELEMENTS_V1_VERSION, StoryElementsSchema, renderElementPalette, formatRecentElements, type StoryElements } from './story-elements.v1.js'
import { STORY_STYLES_V1_VERSION, resolveStyle, renderStyleForPlanner, type StyleInfluence } from './story-styles.v1.js'
import { WRITER_IDENTITIES, WRITER_IDENTITIES_V1_VERSION } from './writer-identities.v1.js'
import { type GenreModule } from './scenes.v1.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, resolveWritingGenre, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

// Includes WRITER_IDENTITIES_V1_VERSION because the planner renders identity fields (questionsAsked,
// taboos, registers, selectionLens) — so an identity edit must bust the planner's inputHash explicitly,
// not rely solely on the step's full-text hashing of plannerSystem/plannerUser (review nit, 2026-07-18).
export const STORY_PLANNER_V1_VERSION = `planner.v1.9+${STORY_MECHANICS_V1_VERSION}+${STORY_ELEMENTS_V1_VERSION}+${STORY_STYLES_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}+${STORY_CONTEXT_VERSION}`

// The committed idea. `mechanics` + `elements` are planner METADATA — the caller STRIPS them before
// the Writer sees the plan (INVARIANT 1: the Writer writes from the idea, never from labels).
// `elements` describes the committed idea's composition (for variety + analytics), never dictates it.
export const StoryPlanSchema = z.object({
  premise: z.string().min(1),
  conflict: z.string().min(1), // who wants what, and what's in the way — a want colliding with the world, in the genre's own terms
  // ── The story's contract with the viewer (2026-08-06) ──────────────────────────────────────────
  // A story doesn't end when the narration ends; it ends when the viewer's mental model has changed.
  // These two fields make that contract explicit BEFORE the middle is planned, so the journey is built
  // to earn a destination instead of the ending being whatever the story happens to arrive at.
  // `emotionalDestination` below already carried the FEEL, so it stays as the third leg rather than
  // being duplicated — the contract is: promise → transformation → feel.
  hookPromise: z.string().min(1), // what the opening implicitly promises to change ("I will change how you see elevators")
  viewerTransformation: z.object({
    before: z.string().min(1), // the viewer's starting feeling, understanding or expectation
    after: z.string().min(1),  // the intended change in feeling, understanding, expectation, or action
  }),
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
  creativeContext?: StoryCreativeContext | undefined
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
  // What this channel may treat as REAL (resolveChannelPolicy). Omitted → the historical default:
  // fictionalize everything, which is what every channel did before this dimension existed.
  sourcePolicy?: SourcePolicy | undefined
}

export function resolvePlannerGenre(genreCategory: string | null | undefined, niche: string): GenreModule {
  return resolveWritingGenre(genreCategory, niche)
}

// Source-policy guards are shared with every downstream authoring pass so permission cannot drift.
export function buildStoryPlannerPrompt(v: StoryPlannerVars): { system: string; userMessage: string } {
  const genre = resolvePlannerGenre(v.creativeContext?.genre ?? v.genreCategory, v.nicheDescription)
  const identity = WRITER_IDENTITIES[genre]
  const mechanics = renderMechanics(genre)
  const elementPalette = renderElementPalette(genre)
  const recentEls = v.recentElements ?? []
  // Style layer: biases the plan's element/mechanic choices (never owns them). '' → pure genre.
  const styleSpec = resolveStyle(genre, v.creativeContext?.narrativeStyle ?? v.narrativeStyle)
  const styleBlock = styleSpec ? `\n${renderStyleForPlanner(styleSpec, v.creativeContext?.styleInfluence ?? v.styleInfluence ?? 'medium')}\n` : ''
  // The writer's registers: the idea commits to ONE temperature at planning time (per-story judgment,
  // owner decision 2026-07-17) — recorded in elements.register, handed to the Writer, and read by the
  // voice-delivery envelope downstream.
  const registersBlock = identity.registers?.length
    ? `\nTHE WRITER'S REGISTERS — candidates for this story's dominant register, not a rotation. Name your own or combine them when the intended emotional journey calls for it; record the choice in elements.register:\n${identity.registers.map((r) => `- ${r}`).join('\n')}\n`
    : ''
  // Selection lens: genre-specific guidance on WHICH ideas deserve to exist (not how to tell them).
  // TESTS the planner reasons with, never a beat template. Where present, it OUTRANKS the generic
  // "pick the freshest premise" instinct below (e.g. reddit: relatable postable conflict > novelty).
  const selectionBlock = identity.selectionLens?.length
    ? `\nHOW YOU CHOOSE — this channel's selection lens. These are TESTS for whether an idea deserves to exist, NOT a formula or a beat sheet: the situation, the people, and how it ends are always yours to invent, and range across many different situations is required. Where these conflict with the general "pick the freshest premise" instinct below, THESE WIN:\n${identity.selectionLens.map((s) => `- ${s}`).join('\n')}\n`
    : ''

  const system = `You are the story planner for "${v.channelName}" — the creative subconscious of ${identity.label}.
Niche: ${v.nicheDescription}
Declared genre / form: ${v.creativeContext?.genre ?? v.genreCategory ?? '(derive from the channel intent)'}
Tone calibration (0–10 scales): ${v.toneConfig}
${v.creativeContext ? `\n${renderStoryCreativeContext(v.creativeContext)}\n` : ''}

You do not write prose. You decide WHAT story deserves to exist next on this channel. The writer who executes your idea is always asking: ${identity.questionsAsked.join(' ')} Plan ideas that give those questions great answers.
Genre defaults, where compatible with the creator's declared intent: ${identity.taboos.join(' ')} These do not overrule a selected form, audience or deliberate departure. A custom genre uses its own promise, not the default identity's preferred story shape.
${mechanics ? `\n${mechanics}\n` : ''}${styleBlock}${registersBlock}${selectionBlock}
WORLD BIBLE — ideas must fit this world (reuse canonical names; don't invent recurring elements):
${v.worldBibleJson}

HOW YOU WORK — explore, reject, commit:
Privately consider several genuinely DIFFERENT premises (different settings, different engines, different emotional shapes) — the way a writer mutters "nah… too predictable… we've already done that… what if—". Reject the predictable, the already-done, and the merely decent. Then COMMIT to the single freshest one and develop only it. Never output the discards; output ONE idea.

${elementPalette}

You will also DESCRIBE your committed idea along those dimensions (see the output). Describe the story you chose — don't reverse-engineer a story to hit labels. But quality comes first: if the strongest idea happens to share a dimension or two with recent ones, keep the stronger idea and vary elsewhere — never bend a story into something weaker just to be different.

${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}`

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
VARIETY CHECK: avoid repeating the same dramatic mechanism with different surface details. Recurring characters, roles and a channel's chosen form can stay; seek meaningful freshness within them. Quality and the creator's contract outrank label diversity. Do not change structure or discard the strongest idea merely to differ in a fixed number of dimensions.

Anti-patterns from rejected reels: ${v.rejectionAvoidList || 'none yet'}
${
    v.operatorFeedback
      ? `\nThis is regeneration attempt #${(v.regenerationNonce ?? 1)}. The operator rejected the previous story: "${v.operatorFeedback}". Re-plan — a DIFFERENT premise/approach that directly answers this, not the same idea reworded.\n`
      : ''
  }
STORY DEVELOPMENT — apply these tests in the declared genre and form's own terms:
- FOCUS: identify the want, question, relationship, experience or argument that gives the audience a reason to stay. A mood alone cannot substitute for the development this particular story promises.
- PROGRESSION: make the middle matter. In a character-driven story, choices, pressures and consequences should reveal the people rather than leave them interchangeable spectators. An explainer develops understanding; a reflective or observational form earns its discoveries. Do not invent a protagonist, dilemma or costly decision to satisfy another form's grammar.
- COHERENCE: causes and consequences must hold where asserted. Avoid coincidence that substitutes for an earned turn; presentation order can be associative or nonlinear when the listener can follow its purpose.
- DESTINATION: decide the audience effect this story is meant to earn, then develop toward it. The outcome may be laughter, reassurance, recognition, suspense, understanding, an open question or changed belief. Do not manufacture a lesson, surprise or belief change for a story that promises something else.

OUTPUT (JSON only) — the ONE committed idea:
{
  "premise": "the situation, concrete and specific — who, where, what starts it",
  "conflict": "who wants what, and what stands in the way — a want colliding with the world, in this genre's own terms",
  "hookPromise": "the experience, question or emotional promise that makes this opening worth following; the story must deliver on its own promise",
  "viewerTransformation": {
    "before": "the viewer's starting feeling, understanding or expectation",
    "after": "the intended audience effect by the end, appropriate to this genre and form; learning, recognition, laughter, reassurance or an earned open question are valid"
  },
  "escalation": "how the middle develops toward the promised payoff, with the connections and changes that make each part matter",
  "twist": "the pivotal development or payoff: a reversal, recognition, discovery, resolution or another form-native turn; no surprise is required",
  "ending": "how this story delivers its promised audience effect and comes to its appropriate stopping point; the form may call for an image, action, question, clear explanation or an earned direct takeaway",
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
    "register": "the chosen dominant register or intentional emotional movement, in your own words; omit if not useful"
  }
}`

  return { system, userMessage }
}
