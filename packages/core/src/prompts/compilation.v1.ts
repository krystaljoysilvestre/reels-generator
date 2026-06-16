// compilation.v1 — long-form connective tissue (docs/04 §5)

export const COMPILATION_V1_VERSION = 'compilation.v1'

export interface CompilationPromptVars {
  channelName: string
  storyEntries: Array<{ title: string; logline: string; subgenreTags: string[] }>
  theme: string
}

export function buildCompilationPrompt(v: CompilationPromptVars): { system: string; userMessage: string } {
  const titles = v.storyEntries.map((s, i) => `${i + 1}. "${s.title}" — ${s.logline}`).join('\n')

  const system = `You are a content producer for "${v.channelName}", a Filipino horror narration channel. You write connective tissue for long-form YouTube compilations.`

  const userMessage = `You are assembling a YouTube compilation with this theme: "${v.theme}".

The compilation will contain these stories in order:
${titles}

Write the connective tissue that wraps them. Rules:
- Total connective tissue MUST be ≤90 seconds of spoken text.
- The STORIES are the product — the wrapper should be minimal and atmospheric.
- Maintain the channel's confessional, 2AM Tagalog narration voice.
- intro_script: 20–40 seconds — theme the collection, persona greeting, "tatlong totoong kwento ngayong gabi…"
- transitions: one 5–10 second bridge per story boundary; reflect briefly on the last, tease the next without spoiling.
- outro_script: 15–25 seconds — recap + "May kwento ka rin ba? I-comment mo sa baba" UGC CTA + subscribe ask.
- chapter_titles: short, intriguing YT chapter names (non-spoiler).

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
