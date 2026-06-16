import { z } from 'zod'

// Every provider call returns this shape and writes nothing.
// Workers are responsible for persisting to DB + R2. (CLAUDE.md non-negotiable rule)

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
