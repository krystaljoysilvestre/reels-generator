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
import { asGenreModule, classifyGenre } from './scenes.v1.js'

// Craft + identities + style/voice are baked into the prompt text, so their versions ride along.
export const STORY_V2_VERSION = `story.v2.2+${STORY_CRAFT_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}+${STORY_STYLES_V1_VERSION}+${STORY_VOICES_V1_VERSION}`

export interface StoryWriterVars {
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
  plan: {
    premise: string
    conflict: string
    twist: string
    ending: string
    emotionalDestination: string
  }
  operatorFeedback?: string | undefined // THIS reel's latest rejection (reason + note), for regeneration
  regenerationNonce?: number | undefined // 0 = first draft; must land in prompt text so inputHash changes
  qaFeedback?: string | undefined // believability-gate reason from the Critic → one bounded rewrite
}

export function buildStoryWriterPrompt(v: StoryWriterVars): { system: string; userMessage: string } {
  const isLongForm = v.targetSeconds > 180 // matches CHAPTER_THRESHOLD_SEC
  const genre = asGenreModule(v.genreCategory ?? null) ?? classifyGenre(v.nicheDescription)
  const identity = WRITER_IDENTITIES[genre]
  // Style's telling conventions (after the identity); Voice overrides the identity's default sound.
  const styleSpec = resolveStyle(genre, v.narrativeStyle)
  const styleBlock = styleSpec ? `\n${renderStyleTellingForWriter(styleSpec, v.styleInfluence ?? 'medium')}\n` : ''
  const voiceSpec = resolveVoice(v.narrativeVoice)
  const voiceBlock = voiceSpec ? `\n${renderVoice(voiceSpec)}\n` : ''

  const system = `You are ${identity.label} — the writer behind "${v.channelName}", a ${isLongForm ? 'long-form' : 'short-form'} video channel.
Niche: ${v.nicheDescription}

${renderIdentity(identity)}
${styleBlock}${voiceBlock}
${STORY_CRAFT_CORE}

Tone calibration (0–10 scales): ${v.toneConfig}
Language for this story: ${v.language}${spokenRegisterBlock(v.language, v.audienceDescriptor)}

WORLD BIBLE — stay consistent with this world:
${v.worldBibleJson}
Rules: reuse established locations/objects by their canonical names. Do not invent new recurring elements unless flagged as "newCanon".

REFERENCE STORIES — these define this channel's voice, rhythm, and intimacy. Match them (do NOT copy their plots, structure, or specific imagery):
${v.fewshotStories}

GUARDS:
- Fictionalize specific real places: invented street/neighborhood/business names; a real region/era is fine (e.g., "a small coastal town in the late 1980s").
- No real, identifiable people.
- Keep it platform-safe: no graphic gore or sexual content, and never harm to minors as subject matter — imply intensity through restraint, not explicit detail.
- Original work only — do not retell known films, books, or copypastas.`

  const hookRule = isLongForm
    ? `COLD OPEN = the first few sentences (~15–30 seconds spoken): open mid-tension or on the story's central unresolvable question — the promise the whole video pays off. Never open with setting description or a greeting.
- A long video must EARN its length: let the story move in a few natural movements/chapters, and end each one pulling the viewer forward — a new question, a turn, a decision, a door literally or figuratively opening. If a stretch exists only to fill time, cut it; write the story the length IT wants within the target.`
    : `HOOK = the first 1–2 sentences (≤3 seconds spoken): open mid-tension or on a curiosity gap / unresolvable detail. Never open with setting description or a greeting.`

  const userMessage = `The story is decided. Your job is the telling — write it so a person lived it.

THE IDEA (from the planning room — its intent is fixed; every choice of scene, sensory detail, rhythm, and voice is yours):
- Premise: ${v.plan.premise}
- The tension at its heart: ${v.plan.conflict}
- The turn: ${v.plan.twist}
- The ending: ${v.plan.ending}
- What the viewer should be left feeling: ${v.plan.emotionalDestination}

Write it as one original ${v.language} narrated script for a ${v.targetSeconds}-second ${isLongForm ? 'long-form video' : 'reel'} (≈${v.targetWords} words at natural narration pace) on THIS channel — its niche, its tone, the reference scripts' voice.

Craft:
- ${hookRule}
- Point of view + register follow what this story naturally wants (first-hand account, retold to a friend, reported, direct address) — choose what serves it, not a default.
- Write it the way it is SPOKEN — short lines, roughly one beat per line — for natural narration cadence.
- Grounded and specific; stay consistent with the world and its canonical names.
${
    v.operatorFeedback
      ? `\nThis is regeneration attempt #${(v.regenerationNonce ?? 1)}. The operator rejected the previous draft for this reason: "${v.operatorFeedback}". The idea above was re-planned with that in mind — make the telling directly answer it too.\n`
      : ''
  }${
    v.qaFeedback
      ? `\nA believability read of your previous draft failed for this reason: "${v.qaFeedback}". Rewrite the telling so a skeptical listener would believe a real person said it — same idea, more truthfully told.\n`
      : ''
  }
OUTPUT (JSON only):
{
  "title": "",                   // in ${v.language} — short and casual, how a person would name this story to a friend ("Yung Katok", "May Kausap sa CR"), NEVER an English title on a non-English channel and NEVER a literary/translated title
  "language": "",
  "narration": "",
  "logline": "",                 // one-line summary of the reel
  "subgenreTags": [],            // 2–4 short tags for the angle/subgenre
  "peakMoment": "",              // the SINGLE most important line — the reel's PEAK (climax, reveal, payoff, punchline, key takeaway, or core insight). Copy it VERBATIM from the narration; it's used to time the music.
  "newCanon": []                 // new recurring locations/objects worth adding to the world bible (names only); [] if none
}`

  return { system, userMessage }
}
