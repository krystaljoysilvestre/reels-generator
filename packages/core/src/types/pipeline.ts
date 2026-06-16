import { z } from 'zod'

// Canonical ordered pipeline step names (docs/02 §4).
// Dashboard derives n/N from this array — no hardcoded counts elsewhere.
export const PIPELINE_STEPS = [
  'generate_story',
  'review_story',
  'annotate_audio_script',
  'breakdown_scenes',
  'generate_images',
  'generate_tts',
  'compute_timings',
  'generate_sfx',
  'animate_scenes',
  'mix_audio',
  'render',
  'render_qa',
  'spot_check',
] as const

export type PipelineStepName = (typeof PIPELINE_STEPS)[number]

export const PIPELINE_STEP_COUNT = PIPELINE_STEPS.length // 13

// Provider call return contract (docs — E2.1): clients write nothing, workers persist.
export const ProviderResultSchema = z.object({
  asset: z.object({
    storageKey: z.string(),
    meta: z.record(z.string(), z.unknown()).default({}),
  }),
  costCents: z.number().int().nonnegative(),
  providerJobId: z.string().optional(),
})
export type ProviderResult = z.infer<typeof ProviderResultSchema>
