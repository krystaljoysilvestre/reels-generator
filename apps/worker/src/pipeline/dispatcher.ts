// Pipeline dispatcher — the BullMQ processor for the PIPELINE queue.
// Routes jobs to the correct step function based on job.data.stepName.
// Each job is idempotent; the harness handles resume logic.

import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import { resolveNextStep, enqueueStep } from '@reels/queue'
import { BudgetExceededError } from '@reels/core'
import { captureException } from '../monitoring/sentry.js'
import {
  generateStory,
  annotateAudioScript,
  breakdownScenes,
  generateTts,
  runComputeTimings,
  generateSfx,
  generateImages,
  animateScenes,
  mixAudioStep,
  renderStep,
  renderQaStep,
  generateChannelBeds,
} from './index.js'

export interface PipelineJobData {
  reelId: string
  stepName: string
  channelId?: string
  language?: string
}

export async function dispatchPipelineJob(job: Job<PipelineJobData>): Promise<void> {
  const { reelId, stepName, channelId, language } = job.data

  console.log(`[pipeline] ${stepName} reelId=${reelId}`)

  try {
    switch (stepName) {
      case 'generate_story':
        await generateStory(reelId, channelId!, language)
        break
      case 'annotate_audio_script':
        await annotateAudioScript(reelId)
        break
      case 'breakdown_scenes':
        await breakdownScenes(reelId)
        break
      case 'generate_tts':
        await generateTts(reelId)
        break
      case 'compute_timings':
        await runComputeTimings(reelId)
        break
      case 'generate_sfx':
        await generateSfx(reelId)
        break
      case 'generate_images':
        await generateImages(reelId)
        break
      case 'animate_scenes':
        await animateScenes(reelId)
        break
      case 'mix_audio':
        await mixAudioStep(reelId)
        break
      case 'render':
        await renderStep(reelId)
        break
      case 'render_qa':
        await renderQaStep(reelId)
        break
      case 'generate_channel_beds':
        // Channel-scoped (carries channelId, no reel). Generates the bespoke AI-music pool once.
        await generateChannelBeds(channelId!)
        break
      default:
        throw new Error(`Unknown pipeline step: ${stepName}`)
    }

    // Auto-advance the pipeline: enqueue the next step, unless this one stops at a human gate
    // (story_review / storyboard / spot_check) — resolveNextStep returns null there. Runs only on
    // success; the deterministic jobId means a BullMQ retry of THIS job won't double-enqueue.
    const next = await resolveNextStep(stepName, reelId)
    if (next) {
      await enqueueStep({ reelId, stepName: next })
      console.log(`[pipeline] ${stepName} → enqueued ${next} reelId=${reelId}`)
    }
  } catch (err) {
    captureException(err, { reelId, stepName })
    // Over-budget is PERMANENT — retrying can't help. Fail fast (no wasted retries); the worker's
    // 'failed' handler still marks the reel failed (it treats UnrecoverableError as terminal).
    if (err instanceof BudgetExceededError) throw new UnrecoverableError(err.message)
    throw err  // transient errors: rethrow so BullMQ retries with backoff
  }
}
