import { describe, expect, it } from 'vitest'
import { buildIdentityStateCriticPrompt } from './identity-state-critic.v1.js'

describe('identity state critic prompt', () => {
  it('treats state continuity as correctness while leaving shot taste alone', () => {
    const prompt = buildIdentityStateCriticPrompt({
      narration: 'The artifact was upright and unmarked. Then it was rotated and signed.',
      bibleJson: '{"entities":[]}',
    })
    expect(prompt.system).toContain('SAME specific identity')
    expect(prompt.system).toContain('preserving stable identity/geometry')
    expect(prompt.system).toContain('Do not demand states for camera angle, lighting, mood')
  })
})
