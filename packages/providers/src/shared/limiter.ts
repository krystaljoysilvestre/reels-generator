// Per-provider concurrency cap.
//
// The worker makes every provider call IN-PROCESS inside pipeline steps (nothing is enqueued to a
// per-provider BullMQ queue), so the BullMQ rate-limiters never see these calls. The ONLY throttle is
// this semaphore — and it must hold regardless of how high the pipeline worker's concurrency or a step's
// internal fan-out (e.g. IMAGE_CONCURRENCY) is set. Concurrency-based (not requests-per-minute): it caps
// simultaneous in-flight calls per provider, which is exactly what protects a provider from a concurrency
// or fan-out bump.
//
// Caps are sized at/above today's peak concurrency so current throughput is unchanged; they only bite if
// someone scales the worker up. Tune here.

export type LimitedProvider = 'openai' | 'anthropic' | 'elevenlabs' | 'fal'

const MAX_CONCURRENT: Record<LimitedProvider, number> = {
  openai: 8,      // images (worker concurrency × IMAGE_CONCURRENCY) + the occasional LLM/QA call
  anthropic: 4,   // QA only
  elevenlabs: 4,  // TTS + SFX (sequential within a step today)
  fal: 4,         // image→video
}

// Minimal FIFO counting semaphore — no external dependency (keeps the package's dep surface small).
class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      this.waiters.shift()?.() // wake exactly one waiter (invariant: active never exceeds max)
    }
  }
}

const semaphores: Record<LimitedProvider, Semaphore> = {
  openai: new Semaphore(MAX_CONCURRENT.openai),
  anthropic: new Semaphore(MAX_CONCURRENT.anthropic),
  elevenlabs: new Semaphore(MAX_CONCURRENT.elevenlabs),
  fal: new Semaphore(MAX_CONCURRENT.fal),
}

// Run `fn` under the provider's concurrency cap. Excess calls queue (FIFO) until a slot frees.
export function withProviderLimit<T>(provider: LimitedProvider, fn: () => Promise<T>): Promise<T> {
  return semaphores[provider].run(fn)
}
