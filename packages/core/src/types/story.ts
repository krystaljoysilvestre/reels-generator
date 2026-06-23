import { z } from 'zod'
import { CAMERA_MOVE_KEYS } from '../motion/motion.js'

// Mirrors story.v1 output schema (docs/04 §2.1).
export const StoryOutputSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(1), // any pipeline-supported language (see web languages.ts)
  narration: z.string().min(1),
  logline: z.string().min(1),
  subgenreTags: z.array(z.string()),
  peakMoment: z.string().min(1), // the reel's peak line (verbatim substring of narration) — drives music timing
  newCanon: z.array(z.string()).default([]),
})
export type StoryOutput = z.infer<typeof StoryOutputSchema>

// Mirrors scenes.v1 output schema (docs/04 §4 — updated per [M9]: full narration substring).
export const SceneOutputSchema = z.object({
  idx: z.number().int().positive(),
  narrationText: z.string().min(1),  // full contiguous substring of narration [M9]
  imagePrompt: z.string().min(1),    // content only; style injected server-side [CLAUDE.md rule 2]
  // The LLM picks the best-fitting camera move per scene (friendly preset key); we resolve it to the
  // animator's motion text at breakdown. An invalid value trips the schema's repair loop; cameraMovePrompt
  // also falls back to a slow drift if anything unexpected slips through.
  cameraMove: z.enum(CAMERA_MOVE_KEYS),
  tier: z.enum(['still', 'video']),
  mood: z.array(z.string()).min(1).max(3),
  location: z.string().min(1), // canonical place label; same label across scenes = same place (drives i2i continuity)
})
export type SceneOutput = z.infer<typeof SceneOutputSchema>

export const ScenesOutputSchema = z.object({
  scenes: z.array(SceneOutputSchema).min(3).max(16),
})
export type ScenesOutput = z.infer<typeof ScenesOutputSchema>
