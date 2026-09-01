import { describe, expect, it } from 'vitest'
import { visualTruthContractErrors } from './visual-truth.js'

describe('visualTruthContractErrors', () => {
  it('requires exact source presentation to be explicit and primary', () => {
    expect(visualTruthContractErrors({ depictionBasis: 'source', primaryEntity: 'fountain' })).toEqual([
      'source basis requires sourcePresentationEntity',
    ])
    expect(visualTruthContractErrors({
      depictionBasis: 'source',
      primaryEntity: 'duchamp',
      sourcePresentationEntity: 'fountain',
    })).toEqual(['sourcePresentationEntity must equal primaryEntity'])
  })

  it('forbids every generated basis from silently presenting source pixels', () => {
    for (const depictionBasis of ['reconstruction', 'representative', 'conceptual'] as const) {
      expect(visualTruthContractErrors({
        depictionBasis,
        primaryEntity: 'fountain',
        sourcePresentationEntity: 'fountain',
      })).toEqual([`${depictionBasis} basis cannot present source pixels`])
    }
  })

  it('accepts a mechanically valid source contract', () => {
    expect(visualTruthContractErrors({
      depictionBasis: 'source',
      primaryEntity: 'fountain',
      sourcePresentationEntity: 'fountain',
    })).toEqual([])
  })
})
