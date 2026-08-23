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
