import { BudgetExceededError, GlobalBudgetExceededError } from '@reels/core'
import { ProviderError } from '@reels/providers'

// Decides whether a pipeline-step failure is TERMINAL (retrying can't help and would just re-bill the
// paid provider calls in the step) or transient (let BullMQ retry with backoff). Kept in its own module,
// free of step imports, so it's unit-testable without pulling in modules that construct provider clients.
//
//  • BudgetExceededError / GlobalBudgetExceededError → terminal: over-budget won't clear on retry (the
//    global cap resets on its own daily window; retrying within the same window just re-trips it).
//  • ProviderError 4xx (except 429) → terminal: a deterministic client error (bad request, invalid param,
//    oversized payload) won't succeed on retry.
//  • ProviderError 429 / 5xx / no status, rate-limit errors, network blips, everything else → transient.
export function isTerminalError(err: unknown): boolean {
  if (err instanceof BudgetExceededError) return true
  if (err instanceof GlobalBudgetExceededError) return true
  if (
    err instanceof ProviderError &&
    err.statusCode != null &&
    err.statusCode >= 400 &&
    err.statusCode < 500 &&
    err.statusCode !== 429
  ) {
    return true
  }
  return false
}
