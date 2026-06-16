import { z } from 'zod'

// Mirrors story.v1 output schema (docs/04 §2.1).
export const StoryOutputSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(1), // any pipeline-supported language (see web languages.ts)
  narration: z.string().min(1),
  logline: z.string().min(1),
  subgenreTags: z.array(z.string()),
  twistAnchor: z.string().min(1),
  newCanon: z.array(z.string()).default([]),
})
export type StoryOutput = z.infer<typeof StoryOutputSchema>

// Mirrors scenes.v1 output schema (docs/04 §4 — updated per [M9]: full narration substring).
export const SceneOutputSchema = z.object({
  idx: z.number().int().positive(),
  narrationText: z.string().min(1),  // full contiguous substring of narration [M9]
  imagePrompt: z.string().min(1),    // content only; style injected server-side [CLAUDE.md rule 2]
  motionPrompt: z.string().min(1),
  tier: z.enum(['still', 'video']),
  mood: z.array(z.string()).min(1).max(3),
})
export type SceneOutput = z.infer<typeof SceneOutputSchema>

export const ScenesOutputSchema = z.object({
  scenes: z.array(SceneOutputSchema).min(6).max(10),
})
export type ScenesOutput = z.infer<typeof ScenesOutputSchema>
