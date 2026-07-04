import { describe, it, expect } from 'vitest'
import { BudgetExceededError } from '@reels/core'
import { ProviderError, ProviderRateLimitError, ContentFilterError } from '@reels/providers'
import { isTerminalError } from './error-policy.js'

describe('isTerminalError', () => {
  it('treats over-budget as terminal', () => {
    expect(isTerminalError(new BudgetExceededError('reel-1', 500, 300))).toBe(true)
  })

  it('treats a deterministic provider 4xx as terminal', () => {
    expect(isTerminalError(new ProviderError('openai', '400 bad request', 400))).toBe(true)
    expect(isTerminalError(new ProviderError('fal', '422 unprocessable', 422))).toBe(true)
    expect(isTerminalError(new ProviderError('openai', '404 not found', 404))).toBe(true)
  })

  it('treats a 429 rate limit as transient (retryable with backoff)', () => {
    expect(isTerminalError(new ProviderError('openai', '429 slow down', 429))).toBe(false)
    expect(isTerminalError(new ProviderRateLimitError('elevenlabs'))).toBe(false)
  })

  it('treats provider 5xx / server errors as transient', () => {
    expect(isTerminalError(new ProviderError('fal', '500 server error', 500))).toBe(false)
    expect(isTerminalError(new ProviderError('openai', '529 overloaded', 529))).toBe(false)
  })

  it('treats a ProviderError with no status code as transient (unknown → retry)', () => {
    expect(isTerminalError(new ProviderError('fal', 'network blip'))).toBe(false)
  })

  it('does not classify content-filter errors as terminal (step-level rephrase handles them)', () => {
    expect(isTerminalError(new ContentFilterError('a scary prompt', 'blocked'))).toBe(false)
  })

  it('treats plain errors and non-errors as transient', () => {
    expect(isTerminalError(new Error('something odd'))).toBe(false)
    expect(isTerminalError('a string')).toBe(false)
    expect(isTerminalError(null)).toBe(false)
    expect(isTerminalError(undefined)).toBe(false)
  })
})
