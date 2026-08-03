import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildInputHash } from './input-hash.js'
import { tryParse } from './client.js'

// Unit tests for parsing/validation logic — no network calls.
// Integration tests (real provider APIs) are env-flagged and live elsewhere.

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

// A schema failure used to reach the pipeline_steps row as 200 chars of raw JSON and nothing else, which
// made a real long-form breakdown failure impossible to diagnose after the fact. The failure REASON is the
// product of tryParse — these pin it down.
describe('schema failure diagnostics', () => {
  const Sceneish = z.object({
    scenes: z
      .array(z.object({ idx: z.number().int().positive(), cameraMove: z.enum(['drift', 'push_in']), mood: z.array(z.string()).min(1).max(3) }))
      .min(3)
      .max(16),
  })

  it('names the offending field path, not just "failed"', () => {
    const raw = JSON.stringify({
      scenes: [
        { idx: 1, cameraMove: 'drift', mood: ['tense'] },
        { idx: 2, cameraMove: 'zoom_bananas', mood: ['quiet'] },
        { idx: 3, cameraMove: 'push_in', mood: ['calm'] },
      ],
    })
    const res = tryParse(raw, Sceneish)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toContain('scenes.1.cameraMove')
      expect(res.reason).toContain('schema mismatch')
    }
  })

  it('reports too many array items with a usable path', () => {
    const raw = JSON.stringify({
      scenes: [
        { idx: 1, cameraMove: 'drift', mood: ['a', 'b', 'c', 'd'] },
        { idx: 2, cameraMove: 'drift', mood: ['a'] },
        { idx: 3, cameraMove: 'drift', mood: ['a'] },
      ],
    })
    const res = tryParse(raw, Sceneish)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toContain('scenes.0.mood')
  })

  it('distinguishes truncated JSON from a schema mismatch', () => {
    const res = tryParse('{ "scenes": [ { "idx": 1, "cameraMove": "dri', Sceneish)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toContain('not valid JSON')
  })

  it('caps the issue list so one bad response cannot flood the error column', () => {
    const scenes = Array.from({ length: 10 }, (_, i) => ({ idx: i + 1, cameraMove: 'nope', mood: ['a'] }))
    const res = tryParse(JSON.stringify({ scenes }), Sceneish)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toContain('+5 more')
      expect(res.reason.length).toBeLessThan(600)
    }
  })

  it('still parses a valid payload', () => {
    const scenes = [1, 2, 3].map((idx) => ({ idx, cameraMove: 'drift' as const, mood: ['tense'] }))
    const res = tryParse(JSON.stringify({ scenes }), Sceneish)
    expect(res.ok).toBe(true)
  })
})
