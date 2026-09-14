// story.v2 — THE Genre Writer. One excellent prose execution of the Planner's idea.
// Replaces story.v1's role in the pipeline (v1 stays untouched for the legacy best-of-N path and
// shipped reels). The writer is the product: identity (WHO tells this) + craft core (HOW anyone
// writes here) + the channel's own reference voices. It receives the Planner's IDEA — never the
// mechanics behind it (mechanics are for planning; this writer writes someone who lived it).
// Versioned source code. Never edit after a reel ships on this version — bump.

import { STORY_CRAFT_CORE, STORY_CRAFT_V1_VERSION, spokenRegisterBlock } from './story-craft.v1.js'
import { WRITER_IDENTITIES, renderIdentity, WRITER_IDENTITIES_V1_VERSION } from './writer-identities.v1.js'
import { STORY_STYLES_V1_VERSION, resolveStyle, renderStyleTellingForWriter, type StyleInfluence } from './story-styles.v1.js'
import { STORY_VOICES_V1_VERSION, resolveVoice, renderVoice } from './story-voices.v1.js'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, resolveWritingGenre, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

// Craft + identities + style/voice are baked into the prompt text, so their versions ride along.
export const STORY_V2_VERSION = `story.v2.11+${STORY_CRAFT_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}+${STORY_STYLES_V1_VERSION}+${STORY_VOICES_V1_VERSION}+${STORY_CONTEXT_VERSION}`

// The story's physics — what makes a telling a STORY rather than a mood or a report. Sits beside the
// six craft principles (which govern the sentences; these govern the chain). Authored under
// .claude/skills/unbiased-design: quality constraints on structure, no quotas, no genre texture.
const STORY_SHAPE = `THE STORY'S SHAPE — judge the telling against its own promise and form.

1. COHERENCE. Where the story asserts causes and consequences, make them hold. Choices should matter in character-driven drama; do not replace earned development with coincidence. Nonlinear, associative and observational structures are valid when their connections are intelligible.

2. THE OPENING MAKES A PROMISE. Give this audience a reason to keep listening, then deliver on that reason. It may be curiosity, delight, a relationship, a clear question or the pleasure of a voice. Neither a tension hook nor a surprise ending is universal.

3. SPEND ATTENTION PURPOSEFULLY. Give the pivotal material enough room to be felt or understood. A distilled short story concentrates on what matters; a longer one earns its movements. Summary, scene and reflection each have a job — choose their proportions for this form.

4. DELIVER THE PAYOFF. End where this story's experience becomes satisfying: recognition, laughter, reassurance, an earned open question, a clear understanding or a consequential change. Use an image, action, direct statement or another close as the chosen form requires. Do not append a lesson or an extra beat after a payoff that is already complete.`

// Narrator embodiment follows the selected form; perspective and source constraints remain intact.
export const STORY_TELLER = `THE TELLER — decide who is telling this and their relationship to the material. A participant, outside narrator, explainer, poet and practiced oral storyteller have different voices and knowledge. Honor the creator's selected voice rather than turning every telling into a confession.

- THEIR WORDS. Let the language, audience, chosen form and speaker shape vocabulary and cadence. Naturalness means credible for THAT teller, including deliberate performance or precision when appropriate.
- THEIR KNOWLEDGE. Keep perspective consistent: a participant cannot know what they never learned; an outside narrator may know what the chosen viewpoint permits. Never invent factual evidence or biography to make a voice feel lived-in.
- THEIR STAKES. Where character drives the story, make their wants, choices and pressures matter. Where the form observes, explains or reflects, give its attention a clear purpose without fabricating participation.
- THEIR FEELING. Match the telling's emotional movement to the material. Quiet, heated and deliberately changing registers are valid when earned.

Introduce only the personal context the listener needs. A relevant age, role or relationship may establish stakes; a persona prop that does no story work is clutter. The narratorVoice casting tag selects who reads the narration; it adds no facts to the story.`

export interface StoryWriterVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  operatorSeed?: string | undefined
  angleDirective?: string | undefined
  channelName: string
  nicheDescription: string
  toneConfig: string // JSON stringified
  language: string
  audienceDescriptor: string
  worldBibleJson: string
  fewshotStories: string // formatted reference stories — the channel's actual voice
  targetSeconds: number
  targetWords: number
  genreCategory?: string | undefined // channel bucket → picks the writer identity (niche keywords as fallback)
  narrativeStyle?: string | undefined // storytelling tradition (story-styles); '' = pure genre
  narrativeVoice?: string | undefined // narrator's written sound (story-voices); '' = identity default
  styleInfluence?: StyleInfluence | undefined // how hard to lean into the style; default medium
  // The Planner's committed idea (mechanics already stripped by the caller). Labeled free-text —
  // the planner phrases each field in the genre's own terms.
  plan?: {
    premise: string
    conflict: string
    escalation: string // the middle's engine — choices and their costs between premise and turn
    twist: string
    ending: string
    emotionalDestination: string
  }
  register?: string | undefined // the register the plan committed to (elements.register); absent → the writer picks from its own registers
  platformHookHint?: string | undefined // the target platform's first-seconds grammar (PLATFORM_PRESETS.hookHint)
  operatorFeedback?: string | undefined // THIS reel's latest rejection (reason + note), for regeneration
  regenerationNonce?: number | undefined // 0 = first draft; must land in prompt text so inputHash changes
  qaFeedback?: string | undefined // believability-gate reason from the Critic → one bounded rewrite
}

export function buildStoryWriterPrompt(v: StoryWriterVars): { system: string; userMessage: string } {
  const isLongForm = v.targetSeconds > 180 // matches CHAPTER_THRESHOLD_SEC
  const genre = resolveWritingGenre(v.creativeContext?.genre ?? v.genreCategory, v.nicheDescription)
  const identity = WRITER_IDENTITIES[genre]
  // Style's telling conventions (after the identity); Voice overrides the identity's default sound.
  const styleSpec = resolveStyle(genre, v.creativeContext?.narrativeStyle ?? v.narrativeStyle)
  const styleBlock = styleSpec ? `\n${renderStyleTellingForWriter(styleSpec, v.creativeContext?.styleInfluence ?? v.styleInfluence ?? 'medium')}\n` : ''
  const voiceSpec = resolveVoice(v.creativeContext?.narrativeVoice ?? v.narrativeVoice)
  const voiceBlock = voiceSpec ? `\n${renderVoice(voiceSpec)}\n` : ''

  const system = `You are ${identity.label} — the writer behind "${v.channelName}", a ${isLongForm ? 'long-form' : 'short-form'} video channel.
Niche: ${v.nicheDescription}
Declared genre / form: ${v.creativeContext?.genre ?? v.genreCategory ?? '(derive from the channel intent)'}
${v.creativeContext ? `\n${renderStoryCreativeContext(v.creativeContext)}\n` : ''}

${renderIdentity(identity)}
${styleBlock}${voiceBlock}
${STORY_CRAFT_CORE}

${STORY_SHAPE}

${STORY_TELLER}

Tone calibration (0–10 scales): ${v.toneConfig}
Language for this story: ${v.language}${spokenRegisterBlock(v.language, v.audienceDescriptor)}

WORLD BIBLE — stay consistent with this world:
${v.worldBibleJson}
Rules: reuse established locations/objects by their canonical names. Do not invent new recurring elements unless flagged as "newCanon".

REFERENCE STORIES — these define this channel's voice, rhythm, and intimacy. Match them (do NOT copy their plots, structure, or specific imagery):
${v.fewshotStories}

${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}`

  const hookRule = isLongForm
    ? `OPENING: establish the promise that can sustain this longer telling in the selected genre and voice. Each movement earns its time and carries the viewer onward; do not fill the target with repeated material.`
    : `OPENING: earn the audience's attention immediately in this form's own way — curiosity, a precise observation, a warm invitation, a claim, tension or another fitting entry. Do not force a cold open onto every genre.`
  const idea = v.plan
    ? `THE IDEA (its intent is fixed; the telling is yours):
- Premise: ${v.plan.premise}
- The focus or conflict: ${v.plan.conflict}
- The middle's development: ${v.plan.escalation}
- The pivotal development or payoff: ${v.plan.twist}
- The ending: ${v.plan.ending}
- What the viewer should be left feeling: ${v.plan.emotionalDestination}`
    : `No separate plan is supplied. Choose and write one coherent story that honors this channel's contract${v.operatorSeed?.trim() ? ` and the operator's requested subject: ${v.operatorSeed.trim()}` : ''}. Develop the premise and payoff together; use the requested duration to distill the telling, not to fill time.${v.angleDirective?.trim() ? `\nSuggested angle: ${v.angleDirective.trim()}. Interpret it within the creator's intent; it never overrides their subject or form.` : ''}`

  const userMessage = `${v.plan ? 'The story is decided. Your job is its telling.' : 'Develop and tell the next story for this channel.'}

${idea}${v.register?.trim() ? `\n- Intended register / emotional movement: ${v.register.trim()} — serve this intent while allowing the story its earned changes of feeling.` : ''}

Write it as one original ${v.language} narrated script for a ${v.targetSeconds}-second ${isLongForm ? 'long-form video' : 'reel'} (≈${v.targetWords} words at natural narration pace) on THIS channel — its niche, its tone, the reference scripts' voice.

Craft:
- ${hookRule}${v.platformHookHint ? `\n- Platform context: ${v.platformHookHint}. Interpret this through the selected genre, audience and form.` : ''}
- Point of view + register follow what this story naturally wants (first-hand account, retold to a friend, reported, direct address) — choose what serves it, not a default.
- Write for the ear in the selected voice. Use rhythm purposefully; avoid an accidental template, while preserving deliberate refrains, poetic patterns, comic timing and measured explanation when the form calls for them.
- Grounded and specific; stay consistent with the world and its canonical names.
${
    v.operatorFeedback
      ? `\nThis is regeneration attempt #${(v.regenerationNonce ?? 1)}. The operator rejected the previous draft for this reason: "${v.operatorFeedback}". Make the story and its telling directly answer that feedback.\n`
      : ''
  }${
    v.qaFeedback
      ? `\nA believability read of your previous draft failed for this reason: "${v.qaFeedback}". Address the named failure while preserving the creator's genre, form, voice and source constraints. Keep the supplied idea if there is one.\n`
      : ''
  }
OUTPUT (JSON only):
{
  "title": "",                   // in ${v.language}; clear and appropriate to the chosen form and audience, with no unsupported claims
  "language": "",
  "narration": "",
  "logline": "",                 // one-line summary of the reel
  "subgenreTags": [],            // 2–4 short tags for the angle/subgenre
  "peakMoment": "",              // the SINGLE most important line — the reel's PEAK (climax, reveal, payoff, punchline, key takeaway, or core insight). Copy it VERBATIM from the narration; it's used to time the music.
  "newCanon": [],                // new recurring locations/objects worth adding to the world bible (names only); [] if none
  "narratorVoice": { "gender": "m", "ageBand": "adult" }  // CASTING ONLY — gender "m"|"f"|"neutral", ageBand "young"|"adult"|"older". Pick the reader this telling calls for; use neutral when the narrator has no specified gender. This tag adds no story facts.
}`

  return { system, userMessage }
}
