import { describe, expect, it } from 'vitest'
import { buildStoryGatePrompt, enforceStoryGateEssence, StoryGateSchema } from './story-critic.v2.js'

describe('story-critic.v2 — essence contract', () => {
  it('deterministically rejects a contradictory top-level pass when essence failed', () => {
    const verdict = StoryGateSchema.parse({
      pass: true,
      reason: 'The prose is clean.',
      rewriteCanFix: true,
      essence: {
        pass: false,
        reason: 'The script names the rejection but never makes its consequence intelligible.',
      },
    })

    expect(enforceStoryGateEssence(verdict)).toMatchObject({
      pass: false,
      reason: 'The script names the rejection but never makes its consequence intelligible.',
    })
  })

  it('judges sufficiency relative to the story instead of prescribing length or beat counts', () => {
    const prompt = buildStoryGatePrompt({
      channelName: 'Crossroads',
      nicheDescription: 'Stories about consequential cultural turning points',
      language: 'English',
      tasteRubric: 'SUBSTANCE\n- Make the central consequence understandable.',
      title: 'Fountain',
      logline: 'An object rejected by one exhibition changes what art can be.',
      narration: 'They promised to accept every work. Then they rejected this one.',
    })

    expect(prompt.system).toContain('ESSENCE')
    expect(prompt.system).toContain('what changed or was decided')
    expect(prompt.system).toContain('Do NOT reward background for its own sake')
    expect(prompt.system).toContain('minimum duration or beat count')
    expect(prompt.userMessage).toContain('"essence"')
  })
})
