import { z } from 'zod'

// Canonical ordered pipeline step names (docs/02 §4).
// Dashboard derives n/N from this array — no hardcoded counts elsewhere.
export const PIPELINE_STEPS = [
  'generate_story',
  'fact_check',            // opt-in (channels.factCheck): advisory Fact-Fidelity punch-list before story_review
  'review_story',
  'annotate_audio_script',
  'analyze_story',
  'generate_post_meta',
  'breakdown_scenes',
  'generate_images',
  'generate_tts',
  'compute_timings',
  'generate_sfx',
  'animate_scenes',
  'generate_music',
  'mix_audio',
  'render',
  'render_qa',
  'spot_check',
] as const

export type PipelineStepName = (typeof PIPELINE_STEPS)[number]

export const PIPELINE_STEP_COUNT = PIPELINE_STEPS.length // 17 (incl. opt-in fact_check)

// Fan-out steps (generate_images, animate_scenes) write ONE pipeline_steps row PER sub-unit, named
// `<step>:scene<idx>` (images) / `<step>:s<idx>v<v>` (animation variations), so their rows no longer
// collide on the unique (reelId, stepName) key — which previously corrupted the ledger (last-writer-wins
// on status) and made retry/liveness blind to a partially-failed fan-out. The canonical step name is
// everything before the first ':'. Non-fan-out step names have no ':' and pass through unchanged.
export function baseStepName(stepName: string): string {
  const i = stepName.indexOf(':')
  return i === -1 ? stepName : stepName.slice(0, i)
}

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
