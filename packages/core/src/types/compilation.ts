import { z } from 'zod'

// Output schema for compilation.v1 (docs/04 §5)
export const CompilationScriptSchema = z.object({
  intro_script: z.string().min(1),
  transitions: z.array(z.object({
    from_title: z.string(),
    to_title: z.string(),
    script: z.string().min(1),
  })),
  outro_script: z.string().min(1),
  chapter_titles: z.array(z.string()),
})
export type CompilationScript = z.infer<typeof CompilationScriptSchema>

// Total spoken words guard: ≤90s ≈ ≤225 words
export function assertConnectiveTissueLength(script: CompilationScript): void {
  const allText = [
    script.intro_script,
    ...script.transitions.map((t) => t.script),
    script.outro_script,
  ].join(' ')
  const wordCount = allText.trim().split(/\s+/).length
  if (wordCount > 250) {
    throw new Error(`Connective tissue too long: ${wordCount} words > 250 (≈90s). Trim the scripts.`)
  }
}
