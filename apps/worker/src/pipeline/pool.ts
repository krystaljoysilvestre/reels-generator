// Bounded-concurrency fan-out for pipeline steps.
//
// Most per-item work in a step (a scene image, an i2v clip, an SFX cue) is a WAIT on an external provider,
// not local CPU — so running items one at a time leaves the step's wall clock as the SUM of every provider
// round trip. A rolling pool overlaps those waits.
//
// The per-provider semaphore in @reels/providers is the real backstop on how many calls reach a provider at
// once; the concurrency passed here only decides how many items this step is willing to have in flight, and
// should be sized at or below that semaphore so items queue in the pool rather than inside the limiter.

// Run `worker` over `items` with a rolling pool of `concurrency` runners — each runner takes the next item as
// it frees, so one slow item never blocks the ones behind it (unlike chunked Promise.all batches).
//
// Per-item errors are COLLECTED, not fatal: every item still gets its turn and the successful ones persist
// their work. If any failed, we throw once at the end, so the caller's runStep retry resumes only the items
// still outstanding. `unit` names the item in that error message — the operator's first clue on a failure.
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  unit = 'item',
): Promise<void> {
  const failures: string[] = []
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const i = next++
      try {
        await worker(items[i]!)
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner))
  if (failures.length > 0) {
    throw new Error(`${failures.length}/${items.length} ${unit}(s) failed: ${failures.join(' | ')}`)
  }
}
