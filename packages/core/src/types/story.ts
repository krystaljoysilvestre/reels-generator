import { z } from 'zod'
import { CAMERA_MOVE_KEYS } from '../motion/motion.js'

// The narrator's casting profile: the gender + apparent age band of the private person THE TELLER
// instantiated, surfaced ONLY to auto-select a matching TTS voice. It is never rendered into the
// narration (invisible embodiment stays intact). Defaults keep BYO/legacy/story.v1 output safe.
export const NarratorVoiceSchema = z.object({
  gender: z.enum(['m', 'f', 'neutral']),
  ageBand: z.enum(['young', 'adult', 'older']),
})
export type NarratorVoice = z.infer<typeof NarratorVoiceSchema>

// Mirrors story.v1 output schema (docs/04 §2.1).
export const StoryOutputSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(1), // any pipeline-supported language (see web languages.ts)
  narration: z.string().min(1),
  logline: z.string().min(1),
  subgenreTags: z.array(z.string()),
  peakMoment: z.string().min(1), // the reel's peak line (verbatim substring of narration) — drives music timing
  newCanon: z.array(z.string()).default([]),
  // Voice-casting only (see NarratorVoiceSchema). Optional: a writer that omits it, or any legacy
  // story.v1 output, simply carries no casting signal → the auto-picker uses the pool's default voice.
  narratorVoice: NarratorVoiceSchema.optional(),
})
export type StoryOutput = z.infer<typeof StoryOutputSchema>

// Mirrors scenes.v1 output schema (docs/04 §4 — updated per [M9]: full narration substring).
export const SceneOutputSchema = z.object({
  idx: z.number().int().positive(),
  narrationText: z.string().min(1),  // full contiguous substring of narration [M9]
  imagePrompt: z.string().min(1),    // content only; style injected server-side
  // The LLM picks the best-fitting camera move per scene (friendly preset key); we resolve it to the
  // animator's motion text at breakdown. An invalid value trips the schema's repair loop; cameraMovePrompt
  // also falls back to a slow drift if anything unexpected slips through.
  cameraMove: z.enum(CAMERA_MOVE_KEYS),
  // Optional SUBJECT motion for a VIDEO beat: what the subject/threat itself DOES in the shot (a horror
  // scare/reveal — the grin stretching wider, the figure looming closer, the head tilting). Empty for beats
  // where only the CAMERA moves (and for stills). Composed AHEAD of the camera move into the animator's
  // motion prompt at breakdown (see animatorMotionPrompt) — so the payoff animates the threat instead of freezing.
  subjectMotion: z.string().default(''),
  tier: z.enum(['still', 'video']),
  mood: z.array(z.string()).min(1).max(3),
  location: z.string().min(1), // canonical place label; same label across scenes = same place (drives i2i continuity)
  // Story Bible references (see specs/story-bible.md). The image assembler expands these into the bible's
  // frozen canonical descriptions so recurring elements don't paraphrase-drift across scenes.
  // primaryEntity = the ONE bible id the shot leads with (null when the subject is an un-canonical detail,
  // e.g. a shadow); supportingEntities = the other bible ids in frame; sceneIntent = what the audience
  // should notice first. These default empty so an empty/absent bible degrades to inline description.
  primaryEntity: z.string().nullable().default(null),
  supportingEntities: z.array(z.string()).default([]),
  // The render-facing identity state this shot chooses. Usually copied from the narration's journey leg;
  // an intentionally retained framing shot may omit the leg's variant and show the parent/default teller.
  // Optional (not defaulted) so legacy model output can be distinguished and deterministically backfilled.
  appearanceByEntity: z.record(z.string(), z.string()).optional(),
  sceneIntent: z.string().default(''),
})
export type SceneOutput = z.infer<typeof SceneOutputSchema>

export const ScenesOutputSchema = z.object({
  scenes: z.array(SceneOutputSchema).min(3).max(16),
})
export type ScenesOutput = z.infer<typeof ScenesOutputSchema>
