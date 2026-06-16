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
  rejectionAvoidList: string  // derived from recent rejections
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
Rules: reuse established locations/objects by their canonical names. Do not invent new recurring elements unless flagged as "new_canon".

REFERENCE STORIES — match their voice, rhythm, and intimacy (do NOT copy plots, twists, or specific imagery):
${v.fewshotStories}

GUARDS:
- Fictionalize all specific real places: invented barangay/street names, real region allowed (e.g., "somewhere in Quezon province").
- No real persons. No gore described anatomically — fear lives in implication, sound, and what is almost seen.
- Nothing involving harm to children as content of the horror.
- Original work only: no retelling of known creepypastas or films.`

  const userMessage = `Write one original story for a ${v.targetSeconds}-second narrated reel (≈${v.targetWords} words at natural narration pace).

Structural requirements:
1. HOOK (first 1–2 sentences, ≤3 seconds spoken): open mid-tension or with an unresolvable detail. Never open with setting description or greeting.
2. SLOW BUILD: grounded, sensory, specific. Real textures of daily life before anything unusual. The mundane detail is what makes it believable.
3. ESCALATION: one impossible thing, then doubt, then confirmation.
4. TWIST/STING (final 1–3 sentences): recontextualize, don't just shock. The best ending makes the viewer re-hear an earlier line differently.
5. First person, past tense, confessional register — told to a friend at 2 AM, not performed to an audience.

Avoid (anti-patterns from rejected reels): ${v.rejectionAvoidList || 'none yet'}

OUTPUT (JSON only):
{
  "title": "",
  "language": "",
  "narration": "",
  "logline": "",
  "subgenreTags": [],
  "twistAnchor": "",
  "newCanon": []
}`

  return { system, userMessage }
}
