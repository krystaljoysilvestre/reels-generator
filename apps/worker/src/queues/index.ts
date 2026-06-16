import { Queue, Worker, QueueEvents, type Processor, type RateLimiterOptions } from 'bullmq'

// BullMQ bundles its own ioredis; pass the connection URL string rather than
// a Redis instance to avoid the dual-ioredis version type conflict.
function getConnection() {
  const url = process.env['REDIS_URL']
  if (!url) throw new Error('REDIS_URL is not set')
  return { url, maxRetriesPerRequest: null as unknown as undefined }
}

export const QUEUE = {
  PIPELINE:        'pipeline',
  LLM:             'llm',
  FAL_IMAGE:       'fal-image',
  FAL_VIDEO:       'fal-video',
  ELEVENLABS_TTS:  'elevenlabs-tts',
  ELEVENLABS_SFX:  'elevenlabs-sfx',
} as const

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

// Rate-limit configs per provider (E2.5).
const RATE_LIMITS: Record<QueueName, RateLimiterOptions> = {
  [QUEUE.PIPELINE]:        { max: 50, duration: 60_000 },
  [QUEUE.LLM]:             { max: 40, duration: 60_000 },
  [QUEUE.FAL_IMAGE]:       { max: 30, duration: 60_000 },
  [QUEUE.FAL_VIDEO]:       { max: 5,  duration: 60_000 },
  [QUEUE.ELEVENLABS_TTS]:  { max: 20, duration: 60_000 },
  [QUEUE.ELEVENLABS_SFX]:  { max: 20, duration: 60_000 },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeQueue(name: QueueName): Queue<any> {
  return new Queue(name, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail:     { count: 200 },
    },
    // Note: BullMQ v5+ rate limiting is on the Worker, not the Queue.
  })
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
