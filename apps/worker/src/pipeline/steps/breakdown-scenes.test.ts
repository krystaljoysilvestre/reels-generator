import { describe, expect, it } from 'vitest'
import { sceneCountRange } from './breakdown-scenes.js'

describe('sceneCountRange', () => {
  it('leaves one editorial cut of slack for uneven narration beats', () => {
    expect(sceneCountRange(80)).toEqual({ minScenes: 5, maxScenes: 10 })
  })
})
