import { z } from 'zod'

// Every provider call returns this shape and writes nothing.
// Workers are responsible for persisting to DB + R2.

export const AssetPayloadSchema = z.object({
  storageKey: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).default({}),
})
export type AssetPayload = z.infer<typeof AssetPayloadSchema>

export const ProviderResultSchema = z.object({
  asset: AssetPayloadSchema,
  costCents: z.number().int().nonnegative(),
  providerJobId: z.string().optional(),
})
export type ProviderResult = z.infer<typeof ProviderResultSchema>

// Content-filter rejection — distinct from generic failures so rephrase retry can branch correctly [H7]
export class ContentFilterError extends Error {
  constructor(
    public readonly prompt: string,
    public readonly providerMessage: string,
  ) {
    super(`Content filter rejection: ${providerMessage}`)
    this.name = 'ContentFilterError'
  }
}

// Provider rate-limit / quota error — triggers backoff, not rephrase
export class ProviderRateLimitError extends Error {
  constructor(
    public readonly provider: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`Rate limit from ${provider}`)
    this.name = 'ProviderRateLimitError'
  }
}

// Generic provider failure (5xx, network, etc.)
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'ProviderError'
  }
}

// ── Spend already incurred when a call throws ────────────────────────────────
// Some provider calls pay for one or more transports and THEN fail: llmCall's schema-repair path bills two
// completions before giving up, and the TTS chunk loop bills chunks 1..N-1 before chunk N errors. That money
// left the account, so it has to reach the reel — but a throw carries no return value to put it in. The
// provider attaches it to the error; the worker harness reads it back off the caught error and records it
// alongside the cost sink. Without this the reel under-counts real spend and the budget gates under-enforce.
export function attachSpend<E>(err: E, costCents: number): E {
  if (costCents > 0 && err && typeof err === 'object') {
    const e = err as { costCents?: number }
    e.costCents = (e.costCents ?? 0) + costCents
  }
  return err
}

// Cents already spent on a failed provider call, or 0 when the error carries none.
export function spendFromError(err: unknown): number {
  if (!err || typeof err !== 'object') return 0
  const c = (err as { costCents?: unknown }).costCents
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? Math.ceil(c) : 0
}
