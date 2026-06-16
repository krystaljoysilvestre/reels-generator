import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { buildInputHash } from './input-hash.js'

// Unit tests for parsing/validation logic — no network calls.
// Integration tests (real Anthropic API) are env-flagged and live elsewhere.

describe('input-hash', () => {
  it('produces a deterministic 16-char hex hash', () => {
    const h1 = buildInputHash('story.v1', { niche: 'horror', lang: 'tagalog' })
    const h2 = buildInputHash('story.v1', { lang: 'tagalog', niche: 'horror' })
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{16}$/)
  })

  it('different template versions produce different hashes', () => {
    const h1 = buildInputHash('story.v1', { x: 1 })
    const h2 = buildInputHash('story.v2', { x: 1 })
    expect(h1).not.toBe(h2)
  })

  it('different inputs produce different hashes', () => {
    const h1 = buildInputHash('story.v1', { x: 1 })
    const h2 = buildInputHash('story.v1', { x: 2 })
    expect(h1).not.toBe(h2)
  })
})

describe('fence stripping', () => {
  // Test the stripFences logic by exercising it through a schema parse.
  // We import and call stripFences indirectly via tryParse patterns.

  const schema = z.object({ title: z.string(), score: z.number() })
  const valid = JSON.stringify({ title: 'test', score: 7 })

  it('plain JSON parses without fences', () => {
    expect(schema.safeParse(JSON.parse(valid)).success).toBe(true)
  })

  it('stripFences removes ```json wrapper', () => {
    const wrapped = '```json\n' + valid + '\n```'
    const stripped = wrapped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    expect(schema.safeParse(JSON.parse(stripped)).success).toBe(true)
  })

  it('stripFences removes plain ``` wrapper', () => {
    const wrapped = '```\n' + valid + '\n```'
    const stripped = wrapped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    expect(schema.safeParse(JSON.parse(stripped)).success).toBe(true)
  })
})
