import { describe, expect, it } from 'vitest'
import { reviewSceneBreakdown } from './scene-qa.js'
import { StoryBibleSchema } from '../types/story-bible.js'

const narration = 'Lola sat beside me. When she was young, she crossed the river.'
const bible = StoryBibleSchema.parse({
  entities: [{
    id: 'grandmother',
    kind: 'character',
    description: 'an elderly woman with silver hair',
    appearances: [{ id: 'remembered-youth', description: 'a young girl with long black hair' }],
  }],
  continuity: {
    narratorPerspective: 'third_person',
    narratorEntityId: null,
    timeline: [],
    journey: [
      { span: 'Lola sat beside me.', locationLabel: 'home', locationEntityId: null, present: ['grandmother'], visible: ['grandmother'], appearanceByEntity: {} },
      { span: 'When she was young, she crossed the river.', locationLabel: 'river', locationEntityId: null, present: ['grandmother'], visible: ['grandmother'], appearanceByEntity: { grandmother: 'remembered-youth' } },
    ],
  },
})

describe('scene QA — appearance boundaries', () => {
  it('rejects a scene that merges the present-day frame and remembered youth', () => {
    const result = reviewSceneBreakdown({
      narration,
      peakMoment: '',
      minScenes: 1,
      maxScenes: 3,
      bibleEntities: bible.entities,
      journey: bible.continuity.journey,
      scenes: [{
        narrationText: narration,
        imagePrompt: 'the grandmother turns toward the river while speaking to her grandchild',
        tier: 'still',
        location: 'home',
        primaryEntity: 'grandmother',
        supportingEntities: [],
      }],
    })
    expect(result.errors).toContain("Scene 1 crosses a journey boundary where a character's time-bound appearance changes — cut the scene at that boundary so one frame resolves to exactly one appearance.")
  })

  it('accepts scenes cut on the appearance transition', () => {
    const result = reviewSceneBreakdown({
      narration,
      peakMoment: '',
      minScenes: 2,
      maxScenes: 3,
      bibleEntities: bible.entities,
      journey: bible.continuity.journey,
      scenes: [
        { narrationText: 'Lola sat beside me.', imagePrompt: 'the grandmother turns toward her grandchild', tier: 'still', location: 'home', primaryEntity: 'grandmother', supportingEntities: [] },
        { narrationText: 'When she was young, she crossed the river.', imagePrompt: 'the girl steps through the shallow river', tier: 'video', location: 'river', primaryEntity: 'grandmother', supportingEntities: [] },
      ],
    })
    expect(result.errors.some((issue) => issue.includes('time-bound appearance changes'))).toBe(false)
  })

  it('allows an explicit framing shot to stay on elderly Lola across remembered narration', () => {
    const result = reviewSceneBreakdown({
      narration,
      peakMoment: '',
      minScenes: 1,
      maxScenes: 3,
      bibleEntities: bible.entities,
      journey: bible.continuity.journey,
      scenes: [{
        narrationText: narration,
        imagePrompt: 'the elderly grandmother continues telling her grandchild the remembered story',
        tier: 'still',
        location: 'home',
        primaryEntity: 'grandmother',
        supportingEntities: [],
        appearanceByEntity: {},
      }],
    })
    expect(result.errors.some((issue) => issue.includes('time-bound appearance changes'))).toBe(false)
  })

  it('rejects an invented scene-level appearance', () => {
    const result = reviewSceneBreakdown({
      narration,
      peakMoment: '',
      minScenes: 1,
      maxScenes: 3,
      bibleEntities: bible.entities,
      journey: bible.continuity.journey,
      scenes: [{
        narrationText: narration,
        imagePrompt: 'the grandmother continues the story',
        tier: 'still',
        location: 'home',
        primaryEntity: 'grandmother',
        supportingEntities: [],
        appearanceByEntity: { grandmother: 'middle-aged' },
      }],
    })
    expect(result.errors).toContain('Scene 1 binds "grandmother" to unknown appearance "middle-aged".')
  })
})
