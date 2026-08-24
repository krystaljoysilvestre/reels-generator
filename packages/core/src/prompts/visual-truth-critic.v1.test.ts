import { describe, expect, it } from 'vitest'
import { buildVisualTruthCriticPrompt, VisualTruthVerdictSchema } from './visual-truth-critic.v1.js'

describe('final visual truth verifier', () => {
  it('forces venue and exact-source checks without asking for craft judgment', () => {
    const prompt = buildVisualTruthCriticPrompt({
      bibleEntities: [{ id: 'fountain', referenceOrigin: { sourceAssetKey: 'source.webp' } }],
      scenes: [{
        idx: 1,
        narrationText: 'He photographed Fountain.',
        imagePrompt: 'Two men pose beside it in a furnished studio.',
        depictionBasis: 'reconstruction',
        primaryEntity: 'fountain',
      }],
    })
    expect(prompt.system).toContain('final VISUAL TRUTH verifier')
    expect(prompt.system).toContain('Generic" invented venue detail is still unsupported')
    expect(prompt.system).toContain('matching exact sourceAssetKey')
    expect(prompt.system).toContain('Do not judge beauty, clarity, drama')
  })

  it('requires every factual dimension in structured output', () => {
    expect(VisualTruthVerdictSchema.safeParse({ scenes: [{ idx: 1, violations: [], reasons: [] }] }).success).toBe(false)
  })
})
