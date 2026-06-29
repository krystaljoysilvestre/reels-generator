// compilation.v1 — long-form connective tissue for YouTube compilations.

export const COMPILATION_V1_VERSION = 'compilation.v1'

export interface CompilationPromptVars {
  channelName: string
  nicheDescription: string
  genreCategory: string // horror | informational | lifestyle | general — shapes the wrapper's voice
  language: string // the channel's narration language (the wrapper is written in it)
  storyEntries: Array<{ title: string; logline: string; subgenreTags: string[] }>
  theme: string
}

export function buildCompilationPrompt(v: CompilationPromptVars): { system: string; userMessage: string } {
  const titles = v.storyEntries.map((s, i) => `${i + 1}. "${s.title}" — ${s.logline}`).join('\n')

  const system = `You are a content producer for "${v.channelName}", a ${v.nicheDescription} channel (genre: ${v.genreCategory}). You write connective tissue for long-form YouTube compilations.
Write ALL spoken text in ${v.language}, in this channel's own narration voice — match its niche, tone, and the way it addresses its audience. Do NOT impose another genre's persona.`

  const userMessage = `You are assembling a YouTube compilation with this theme: "${v.theme}".

The compilation will contain these segments in order:
${titles}

Write the connective tissue that wraps them. Rules:
- Total connective tissue MUST be ≤90 seconds of spoken text. Write it in ${v.language}.
- The SEGMENTS are the product — the wrapper should be minimal and in-voice, never overshadow them.
- intro_script: 20–40 seconds — greet the audience in the channel's voice and theme the collection (e.g. "here are the N stories/tips/cases for today" — phrased the way THIS niche would).
- transitions: one 5–10 second bridge per segment boundary; reflect briefly on the last, tease the next without spoiling.
- outro_script: 15–25 seconds — recap + an audience CTA that fits the niche (invite a comment / their own story or take) + a subscribe ask.
- chapter_titles: short, intriguing YouTube chapter names (non-spoiler).

OUTPUT (JSON only):
{
  "intro_script": "",
  "transitions": [
    { "from_title": "", "to_title": "", "script": "" }
  ],
  "outro_script": "",
  "chapter_titles": []
}`

  return { system, userMessage }
}
