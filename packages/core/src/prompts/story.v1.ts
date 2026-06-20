// story.v1 — story generation template (docs/04 §2.1)
// Versioned source code. Never edit after a reel ships on this version — bump to v2.

export const STORY_V1_VERSION = 'story.v1'

export interface StoryPromptVars {
  channelName: string
  nicheDescription: string
  toneConfig: string          // JSON stringified
  language: string            // any pipeline-supported language (see web languages.ts)
  audienceDescriptor: string
  worldBibleJson: string
  fewshotStories: string      // formatted reference stories
  targetSeconds: number
  targetWords: number
  rejectionAvoidList: string  // derived from recent CHANNEL-WIDE rejections (≥3 in 14 days)
  operatorFeedback?: string | undefined   // THIS reel's own latest rejection (reason + note), for regeneration
  regenerationNonce?: number | undefined   // 0 = first draft; increments per regenerate. MUST land in the prompt text
                              // so the inputHash changes and the LLM actually re-runs (else it caches).
}

export function buildStoryPrompt(v: StoryPromptVars): { system: string; userMessage: string } {
  const system = `You are the head writer for "${v.channelName}", a short-form video channel.
Niche: ${v.nicheDescription}

Tone calibration (0–10 scales): ${v.toneConfig}
Language for this story: ${v.language}${
    v.language.toLowerCase() === 'taglish'
      ? `\nIf taglish: code-switch the way a real ${v.audienceDescriptor} speaks — Tagalog as the emotional base, English for emphasis and modern objects. Never translate idioms literally; use them natively.`
      : ''
  }

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

  const userMessage = `Write one original ${v.language} narrated reel script for a ${v.targetSeconds}-second reel (≈${v.targetWords} words at natural narration pace). Make it feel like a real reel on THIS channel — match the niche, tone, and the reference scripts' voice.

Shape it to the niche — do NOT force a fiction twist onto a channel that isn't narrative:
- Narrative / story niches: HOOK, then a grounded, sensory, specific build (real textures of daily life before anything unusual), escalation or development, and a satisfying ending that pays off something established earlier — a twist, a punchline, a moral, or an emotional turn, whatever the niche wants. Not a flat stop.
- Informational niches: HOOK, then 2–4 vivid concrete points, end on a satisfying payoff.
- Persuasive / monologue niches: HOOK, develop one sharp idea with a concrete example, close on a memorable line.

Craft:
- HOOK = the first 1–2 sentences (≤3 seconds spoken): open mid-tension or on a curiosity gap / unresolvable detail. Never open with setting description or a greeting.
- Point of view + register follow what the niche naturally wants (first-hand account, retold legend, reported, explainer, direct second-person address) — do NOT default to a first-person confession.
- Write it the way it is SPOKEN — short lines, roughly one beat per line — for natural narration cadence.
- Grounded and specific; stay consistent with the world and its canonical names.

Avoid (anti-patterns from rejected reels): ${v.rejectionAvoidList || 'none yet'}
${
    v.operatorFeedback
      ? `\nThis is regeneration attempt #${(v.regenerationNonce ?? 1)}. The operator rejected the previous draft for this reason: "${v.operatorFeedback}". Write a DISTINCTLY DIFFERENT story that directly fixes this — change the premise/approach, not just the wording. Do not repeat the prior draft's plot or hook.\n`
      : ''
  }
OUTPUT (JSON only):
{
  "title": "",
  "language": "",
  "narration": "",
  "logline": "",                 // one-line summary of the reel
  "subgenreTags": [],            // 2–4 short tags for the angle/subgenre
  "peakMoment": "",              // the SINGLE most important line — the reel's PEAK (climax, reveal, payoff, punchline, key takeaway, or core insight). Copy it VERBATIM from the narration; it's used to time the music.
  "newCanon": []                 // new recurring locations/objects worth adding to the world bible (names only); [] if none
}`

  return { system, userMessage }
}
