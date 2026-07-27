import { describe, it, expect } from 'vitest'
import { attachSpend, spendFromError, ProviderError, ProviderRateLimitError } from './types.js'

// These two guard real money: a provider that pays for a call and THEN throws has no return value to put
// the cost in, so it rides on the error and the worker harness reads it back off the caught error.

describe('attachSpend / spendFromError', () => {
  it('round-trips spend through an error', () => {
    const err = attachSpend(new ProviderError('openai', 'schema failed'), 42)
    expect(spendFromError(err)).toBe(42)
  })

  it('accumulates when a call attaches more than once', () => {
    const err = new ProviderError('elevenlabs', 'chunk 3 failed')
    attachSpend(err, 10)
    attachSpend(err, 5)
    expect(spendFromError(err)).toBe(15)
  })

  it('returns the error itself so it can be thrown inline', () => {
    const err = new ProviderRateLimitError('elevenlabs')
    expect(attachSpend(err, 7)).toBe(err)
  })

  it('reports 0 for an error carrying no spend', () => {
    expect(spendFromError(new Error('boom'))).toBe(0)
    expect(spendFromError(new ProviderError('fal', 'nope'))).toBe(0)
  })

  it('reports 0 for non-errors and junk values', () => {
    expect(spendFromError(null)).toBe(0)
    expect(spendFromError(undefined)).toBe(0)
    expect(spendFromError('not an error')).toBe(0)
    expect(spendFromError({ costCents: 'lots' })).toBe(0)
    expect(spendFromError({ costCents: NaN })).toBe(0)
    expect(spendFromError({ costCents: -5 })).toBe(0)
  })

  it('ignores a non-positive attach and leaves the error unmarked', () => {
    expect(spendFromError(attachSpend(new Error('x'), 0))).toBe(0)
    expect(spendFromError(attachSpend(new Error('x'), -3))).toBe(0)
  })

  it('rounds fractional cents up so spend is never under-counted', () => {
    expect(spendFromError(attachSpend(new Error('x'), 1.2))).toBe(2)
  })
})
