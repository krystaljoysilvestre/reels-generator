import { z } from 'zod'

// Follow-up questions for a channel pitch the creator wrote THEMSELVES, fetched while they're still
// on step 1 (blur / typing lull). Genre-tile picks never call this — they ship curated questions
// (see the wizard's niche-presets.ts). This is deliberately NOT the full channel derivation: it runs
// pre-derive on a possibly-unfinished pitch, so it must be small, fast and cheap. The full derive
// (channel.v1) keeps its own clarifyingQuestions as the fallback for text that never came through here.
//
// Same output shape as channel.v1's clarifyingQuestions, so the wizard renders both identically and
// answers append to the pitch under `prefix` either way.

export const CHANNEL_CLARIFY_V1_VERSION = 'channel-clarify.v1'

export const ChannelClarifySchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(), // plain and friendly, ONE missing dimension each
        examples: z.string(), // 2–4 short example answers, comma-separated
        prefix: z.string(), // declarative lead-in the answer is appended under ("Stories live in:")
      }),
    )
    .max(2)
    .default([]),
})
export type ChannelClarify = z.infer<typeof ChannelClarifySchema>

export function buildChannelClarifyPrompt(v: { nicheDescription: string; language: string }): {
  system: string
  userMessage: string
} {
  const system = `You review a creator's pitch for a video channel before anything is produced.

Your ONLY job: spot the dimensions the pitch leaves genuinely open that would change how every video gets made — the lane or subject ("facts about WHAT?"), the audience, the setting or era, the format, the narrator's stance. Ask about at most 2, and only the ones that genuinely help.

An empty list is common and correct: a specific pitch needs no questions, and a question the text already answers is a defect. The pitch may be mid-draft — if it reads unfinished, prefer no questions over guessing at what's coming. Never ask about production choices decided later in setup (narration voice, music, captions, visual style), and never ask for a rewrite — each question fills ONE gap.

Earlier answers may already appear at the end of the pitch as short "Label: answer" lines — treat those as settled facts and never re-ask them.

Write the questions in the language the pitch itself is written in — never any other language. If the pitch is too short to tell, use the channel's narration language given with it.`

  const userMessage = `THE PITCH (the channel will narrate in ${v.language}):
${v.nicheDescription}

Produce JSON with exactly this shape:
{
  "questions": [ // 0–2, ONLY for dimensions the pitch leaves genuinely open. Each: a plain, friendly question (one missing dimension each); 2–4 comma-separated example answers; and a short declarative prefix the answer will be appended under so it reads as clean channel DNA (question "Which corner of life do your stories live in?" → prefix "Stories live in:").
    { "question": "", "examples": "", "prefix": "" }
  ]
}

Output JSON only. No prose, no code fences.`

  return { system, userMessage }
}
