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
      ? `\nTAGLISH — sound like a real ${v.audienceDescriptor} talking to a close friend, not a textbook or a news anchor. Don't "write Taglish" as a rule — just say it the way this person would actually say it out loud.
- Use whatever mix of Tagalog and English is natural for this narrator and moment, and NEVER force either. Some lines come out almost pure Tagalog, some mostly English, most a natural mix — let it fall where it falls; don't balance it sentence by sentence.
- Modern things stay in English the way people really say them (phone, text, CR, parking, signal, Messenger, screenshot).
- Don't reach for an English word when the Tagalog one is what someone would actually say, and don't translate a phrase just because it's English. Nobody says "labis akong natakot," "may something sa likod," or "walang trace" — they say "grabe, kinabahan ako," "may kakaiba sa likod," "walang bakas."
- Write for the EAR, not the page: short lines, hesitations, self-corrections, a thought that trails off.
Good: "Akala ko hangin lang." / "Paglingon ko, wala naman." / "Ewan ko ba, pero simula nun…" / "Nag-text yung kapatid ko nung mismong narinig ko 'yun." / "Promise, wala akong iniinom."
Avoid: deep/literary Tagalog ("Hindi ako makakilos sa aking kinatatayuan"); forced English inserts ("gusto magstay," "this summer"); perfectly balanced code-switching in every line.`
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
