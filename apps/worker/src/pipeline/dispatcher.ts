// Pipeline dispatcher — the BullMQ processor for the PIPELINE queue.
// Routes jobs to the correct step function based on job.data.stepName.
// Each job is idempotent; the harness handles resume logic.

import type { Job } from 'bullmq'
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
      default:
        throw new Error(`Unknown pipeline step: ${stepName}`)
    }
  } catch (err) {
    captureException(err, { reelId, stepName })
    throw err  // rethrow so BullMQ marks the job failed + retries
  }
}
