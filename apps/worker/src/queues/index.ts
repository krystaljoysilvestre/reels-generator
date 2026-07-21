import { Worker, QueueEvents, type Processor, type RateLimiterOptions } from 'bullmq'
import { QUEUE, getConnection, type QueueName } from '@reels/queue'

// Producer side (queue names, connection, makeQueue, enqueue, chain) lives in @reels/queue so the
// web API can enqueue too. Re-export it here so existing worker imports keep resolving; the worker
// owns only the CONSUMER side (makeWorker / makeQueueEvents) below.
export { QUEUE, makeQueue, getConnection, enqueueStep, resolveNextStep, PIPELINE_CHAIN } from '@reels/queue'
export type { QueueName, PipelineJobData } from '@reels/queue'

// BullMQ per-QUEUE limiters. NOTE: only the PIPELINE worker is instantiated (see worker/index.ts), and
// provider calls run in-process inside pipeline steps — they are never enqueued to the per-provider
// queues below, so those limiters are inert. The REAL per-provider throttle is the concurrency semaphore
// in @reels/providers (shared/limiter.ts). The PIPELINE entry below does bound how many pipeline jobs
// start per minute. Keep the provider entries only if/when those queues get their own workers.
const RATE_LIMITS: Record<QueueName, RateLimiterOptions> = {
  [QUEUE.PIPELINE]:        { max: 50, duration: 60_000 },
  [QUEUE.RENDER]:          { max: 20, duration: 60_000 }, // starts/min; true render cap is worker concurrency
  [QUEUE.SCHEDULER]:       { max: 4,  duration: 60_000 },
  [QUEUE.LLM]:             { max: 40, duration: 60_000 },
  [QUEUE.FAL_IMAGE]:       { max: 30, duration: 60_000 },
  [QUEUE.FAL_VIDEO]:       { max: 5,  duration: 60_000 },
  [QUEUE.ELEVENLABS_TTS]:  { max: 20, duration: 60_000 },
  [QUEUE.ELEVENLABS_SFX]:  { max: 20, duration: 60_000 },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeWorker(name: QueueName, processor: Processor<any>, concurrency = 2): Worker<any> {
  return new Worker(name, processor, {
    connection: getConnection(),
    concurrency,
    limiter: RATE_LIMITS[name],
  })
}

export function makeQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, { connection: getConnection() })
}
