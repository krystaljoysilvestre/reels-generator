import { describe, expect, it } from 'vitest'
import { buildImageQAPrompt } from './image-qa.v1.js'

describe('buildImageQAPrompt — time-bound appearance', () => {
  it('adds a life-stage check only when the scene selected an appearance variant', () => {
    const base = buildImageQAPrompt('the woman crosses the river')
    expect(base.userMessage).not.toContain('CHARACTER LIFE STAGE')

    const memory = buildImageQAPrompt(
      'the woman crosses the river',
      'grandmother: a young girl with long black hair and a red ribbon',
    )
    expect(memory.userMessage).toContain('EXPECTED TIME-BOUND CHARACTER APPEARANCE')
    expect(memory.userMessage).toContain('CHARACTER LIFE STAGE')
    expect(memory.userMessage).toContain('a young girl')
  })
})
