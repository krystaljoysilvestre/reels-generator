// Pipeline dispatcher — the BullMQ processor for the PIPELINE queue.
// Routes jobs to the correct step function based on job.data.stepName.
// Each job is idempotent; the harness handles resume logic.

import type { Job } from 'bullmq'
import { UnrecoverableError } from 'bullmq'
import { eq } from 'drizzle-orm'
import { getDb, reels } from '@reels/db'
import { resolveNextStep, enqueueStep } from '@reels/queue'
import { captureException } from '../monitoring/sentry.js'
import { isTerminalError } from './error-policy.js'
import { autoCrossGate } from './auto-gate.js'
import {
  generateStory,
  annotateAudioScript,
  analyzeStory,
  generatePostMeta,
  breakdownScenes,
  generateTts,
  runComputeTimings,
  generateSfx,
  generateImages,
  animateScenes,
  generateMusicStep,
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
  // Elapsed per step. pipeline_steps already stores started_at/finished_at, but nothing reads them as a
  // DURATION — so "which step is slow" needed a hand-written SQL query. Logging it makes the next
  // optimisation measurable from the worker output alone, at the cost of one timestamp per job.
  const startedAtMs = Date.now()
  const logElapsed = (outcome: 'done' | 'failed') =>
    console.log(`[pipeline] ${stepName} ${outcome} in ${((Date.now() - startedAtMs) / 1000).toFixed(1)}s reelId=${reelId}`)

  // A reel the boot reaper marked 'failed' must not be dragged back through the pipeline by an orphaned
  // job that BullMQ stalled-recovery later re-activates. A legitimate retry (retry-reel) resets the reel
  // to a transient status BEFORE re-enqueueing, so seeing 'failed' here means this job is stale — no-op it
  // (completing cleanly clears the orphan) instead of re-running the step and bouncing the reel out of failed.
  const current = await getDb().query.reels.findFirst({ where: eq(reels.id, reelId), columns: { status: true } })
  if (current?.status === 'failed') {
    console.warn(`[pipeline] skip ${stepName} (${reelId.slice(0, 8)}): reel is failed — stale/orphaned job`)
    return
  }

  try {
    switch (stepName) {
      case 'generate_story':
        // channelId is required only for this first step (later steps resolve it from the reel row).
        // Guard loudly: without it, generateStory fails deep with an opaque "UNDEFINED_VALUE" that
        // burns all 3 retries before the reel is marked failed.
        if (!channelId) throw new Error(`generate_story requires channelId in job data (reelId=${reelId})`)
        await generateStory(reelId, channelId, language)
        break
      case 'annotate_audio_script':
        await annotateAudioScript(reelId)
        break
      case 'analyze_story':
        await analyzeStory(reelId)
        break
      case 'generate_post_meta':
        await generatePostMeta(reelId)
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
      case 'generate_music':
        // Per-reel AI bed (musicMode='ai' only; no-ops otherwise). Runs before the mix.
        await generateMusicStep(reelId)
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

    logElapsed('done')

    // Auto-advance the pipeline: enqueue the next step, unless this one stops at a human gate
    // (story_review / storyboard / spot_check) — resolveNextStep returns null there. Runs only on
    // success; the deterministic jobId means a BullMQ retry of THIS job won't double-enqueue.
    const next = await resolveNextStep(stepName, reelId)
    if (next) {
      await enqueueStep({ reelId, stepName: next })
      console.log(`[pipeline] ${stepName} → enqueued ${next} reelId=${reelId}`)
    } else {
      // No next step → a human gate (story_review / storyboard / spot_check). In 'auto' generation
      // mode the channel crosses it automatically; in 'review' mode this is a no-op and we wait.
      await autoCrossGate(stepName, reelId)
    }
  } catch (err) {
    logElapsed('failed')
    captureException(err, { reelId, stepName })
    // Terminal failures (over-budget, deterministic provider 4xx) can't be fixed by retrying and would
    // just re-bill the step — fail fast so the worker's 'failed' handler marks the reel failed. Everything
    // else (429s, 5xx, network) rethrows so BullMQ retries with backoff. See error-policy.ts.
    if (isTerminalError(err)) {
      throw new UnrecoverableError(err instanceof Error ? err.message : String(err))
    }
    throw err
  }
}
