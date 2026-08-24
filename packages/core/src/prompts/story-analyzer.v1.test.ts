import { describe, expect, it } from 'vitest'
import { buildStoryAnalyzerPrompt } from './story-analyzer.v1.js'

describe('story analyzer identity states', () => {
  it('requires a clause-level journey boundary for a visible transformation', () => {
    const prompt = buildStoryAnalyzerPrompt({
      narration: 'A maker acquired an artifact upright, then rotated and signed it.',
      channelCanon: [],
      nicheDescription: 'documented art history',
      era: '1917',
      regionDescriptor: 'New York',
    })
    expect(prompt.userMessage).toContain('split the journey at the exact')
    expect(prompt.userMessage).toContain('clause where the visible state changes')
    expect(prompt.userMessage).toContain('unsigned-upright')
    expect(prompt.userMessage).toContain('Never let the final state')
  })
})

describe('story analyzer visual entity boundary', () => {
  it('keeps organizations and historical events out of location identity', () => {
    const prompt = buildStoryAnalyzerPrompt({
      narration: 'The Society held its first exhibition and later voted to reject the work.',
      channelCanon: [],
      nicheDescription: 'art history',
      era: '1917',
      regionDescriptor: 'New York',
    })
    expect(prompt.userMessage).toContain('ORGANIZATIONS AND EVENTS ARE CONTEXT, NOT LOCATIONS')
    expect(prompt.userMessage).toContain('locationEntityId MUST be null')
    expect(prompt.userMessage).toContain('actual physical building/site/room')
  })

  it('retains a one-scene named factual subject so sourcing can anchor it', () => {
    const prompt = buildStoryAnalyzerPrompt({
      narration: 'The photograph ran in the May 1917 issue of The Blind Man.',
      channelCanon: [],
      nicheDescription: 'art history',
      era: '1917',
      regionDescriptor: 'New York',
    })
    expect(prompt.userMessage).toContain('ONE-SCENE FACTUAL IDENTITY EXCEPTION')
    expect(prompt.userMessage).toContain('dated publication issue or document')
    expect(prompt.userMessage).toContain('stage cannot anchor it')
  })
})
