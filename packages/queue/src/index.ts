// @reels/queue — the pipeline job PRODUCER, shared by the web API (the 3 kicks) and the worker
// (auto-chaining). bullmq is otherwise a worker-only dep, so the web routes couldn't enqueue; this
// package is the single source of truth for the queue connection, the step chain, and enqueueing.
// (The worker keeps the CONSUMER side — makeWorker — in apps/worker.)

import { Queue } from 'bullmq'
import { getDb, scenes } from '@reels/db'
import { and, eq } from 'drizzle-orm'

// BullMQ bundles its own ioredis; pass the URL string (not a Redis instance) to avoid the
// dual-ioredis type conflict.
export function getConnection() {
  const url = process.env['REDIS_URL']
  if (!url) throw new Error('REDIS_URL is not set')
  return { url, maxRetriesPerRequest: null as unknown as undefined }
}

export const QUEUE = {
  PIPELINE: 'pipeline',
  RENDER: 'render',       // heavy Remotion+ffmpeg step, on its own queue/worker so it can't starve generation
  SCHEDULER: 'scheduler', // the auto-produce tick (consistency engine) — see apps/worker/src/scheduler.ts
  LLM: 'llm',
  FAL_IMAGE: 'fal-image',
  FAL_VIDEO: 'fal-video',
  ELEVENLABS_TTS: 'elevenlabs-tts',
  ELEVENLABS_SFX: 'elevenlabs-sfx',
} as const
export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeQueue(name: QueueName): Queue<any> {
  return new Queue(name, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  })
}

export interface PipelineJobData {
  reelId: string
  stepName: string
  channelId?: string
  language?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queueSingletons: Partial<Record<QueueName, Queue<any>>> = {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getQueue(name: QueueName): Queue<any> {
  return (queueSingletons[name] ??= makeQueue(name))
}

// The heavy render step runs on its own queue/worker so a multi-minute render can't hold a slot that
// generation needs. Everything else (incl. the cheap render_qa) stays on the pipeline queue.
const RENDER_STEPS = new Set(['render'])
export function queueForStep(stepName: string): QueueName {
  return RENDER_STEPS.has(stepName) ? QUEUE.RENDER : QUEUE.PIPELINE
}

// Enqueue one pipeline step. The deterministic jobId dedupes BullMQ retries of the *enqueuing* job
// so a retried step can't double-enqueue its successor (which would fork the chain). Resume after a
// hard failure is done by retrying the failed job in Bull Board (re-runs the same job), not here.
export async function enqueueStep(data: PipelineJobData): Promise<void> {
  // jobId can't contain ':' (BullMQ reserves it), so use '__' as the separator.
  const jobId = `${data.reelId}__${data.stepName}`
  const q = getQueue(queueForStep(data.stepName))
  const existing = await q.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    // A finished job (completed/failed) must not block a fresh run of the same step — e.g. re-running
    // the chain after a code fix, or a downstream step rebuilt from new inputs. Clear it so the jobId
    // is free. An IN-FLIGHT job (waiting/active/delayed) still dedupes, so a retried enqueuer can't
    // fork the chain.
    if (state === 'completed' || state === 'failed') {
      await existing.remove()
    } else {
      return
    }
  }
  await q.add(data.stepName, data, { jobId })
}

// Step → next step to auto-enqueue, or null to STOP (a human gate or terminal-before-human).
export const PIPELINE_CHAIN: Record<string, string | null> = {
  generate_story: null,                  // → story_review (human approves)
  analyze_story: 'generate_post_meta',   // after story approval: build the Story Bible…
  generate_post_meta: 'breakdown_scenes', // …package the post (title/hook/caption/hashtags), then break down
  breakdown_scenes: 'generate_images',
  generate_images: null,                 // → storyboard (human edits + picks voice + triggers render)
  generate_tts: 'annotate_audio_script',
  annotate_audio_script: 'compute_timings',
  compute_timings: 'generate_sfx',
  generate_sfx: 'generate_music',        // resolveNextStep reroutes to animate_scenes if any video-tier scene
  animate_scenes: 'generate_music',
  generate_music: 'mix_audio',           // per-reel AI bed (no-op for non-AI channels), then mix
  mix_audio: 'render',
  render: 'render_qa',
  render_qa: null,                       // → spot_check (human spot-check)
}

// The next step after `stepName` for `reelId`, applying the one dynamic branch: after SFX, animate
// only if a scene is video-tier (all-stills reels skip straight to the mix).
export async function resolveNextStep(stepName: string, reelId: string): Promise<string | null> {
  if (stepName === 'generate_sfx') {
    const hasVideo = await getDb().query.scenes.findFirst({
      where: and(eq(scenes.reelId, reelId), eq(scenes.tier, 'video')),
      columns: { id: true },
    })
    return hasVideo ? 'animate_scenes' : 'generate_music'
  }
  return PIPELINE_CHAIN[stepName] ?? null
}
