import { describe, it, expect } from 'vitest'
import { reviewSceneBreakdown, type SceneQAScene } from './scene-qa.js'

// A clean baseline that should raise NO errors and NO warnings.
const NARRATION =
  'Madalas akong magising bandang alas-tres ng madaling-araw. May naririnig akong yabag sa labas ng pinto. Hindi ko alam kung sino. Pero ngayong gabi, bumukas ang pinto.'

function scene(over: Partial<SceneQAScene>): SceneQAScene {
  return { narrationText: '', imagePrompt: 'a man lying awake in bed, close on his face', tier: 'still', location: 'rented bedroom', ...over }
}

describe('reviewSceneBreakdown', () => {
  it('passes a clean breakdown with no errors or warnings', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'Madalas akong magising bandang alas-tres ng madaling-araw.', tier: 'video', imagePrompt: 'a man jolting awake in bed, close on his face, lamp glow from the left' }),
      scene({ narrationText: ' May naririnig akong yabag sa labas ng pinto.', imagePrompt: 'his eyes fixed on a closed wooden door, shallow focus' }),
      scene({ narrationText: ' Hindi ko alam kung sino.', imagePrompt: 'his white-knuckled hand gripping the blanket edge' }),
      scene({ narrationText: ' Pero ngayong gabi, bumukas ang pinto.', imagePrompt: 'the wooden door swinging open into black, low angle from the bed' }),
    ]
    const r = reviewSceneBreakdown({ narration: NARRATION, peakMoment: 'Pero ngayong gabi, bumukas ang pinto.', minScenes: 3, maxScenes: 6, scenes })
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('errors when the peak line is split across scene boundaries', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'Madalas akong magising bandang alas-tres ng madaling-araw.', tier: 'video' }),
      scene({ narrationText: ' May naririnig akong yabag sa labas ng pinto. Hindi ko alam kung sino. Pero ngayong gabi,' }),
      scene({ narrationText: ' bumukas ang pinto.' }),
    ]
    // Peak spans the boundary between scene 2 and 3 → no single scene contains it.
    const r = reviewSceneBreakdown({ narration: NARRATION, peakMoment: 'Pero ngayong gabi, bumukas ang pinto.', minScenes: 3, maxScenes: 6, scenes })
    expect(r.errors.some((e) => e.includes('split across scene boundaries'))).toBe(true)
  })

  it('warns (not errors) when the peak is contained but buried in a long scene', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'Madalas akong magising bandang alas-tres ng madaling-araw. May naririnig akong yabag sa labas ng pinto. Hindi ko alam kung sino. Pero ngayong gabi, bumukas ang pinto.', tier: 'video' }),
      scene({ narrationText: ' ' }),
    ].slice(0, 1)
    const r = reviewSceneBreakdown({ narration: NARRATION, peakMoment: 'bumukas ang pinto.', minScenes: 1, maxScenes: 6, scenes })
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes('buried'))).toBe(true)
  })

  it('errors when more than 3 scenes are marked video', () => {
    const scenes: SceneQAScene[] = ['a', 'b', 'c', 'd'].map((t) => scene({ narrationText: t, tier: 'video' }))
    const r = reviewSceneBreakdown({ narration: 'a b c d', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.errors.some((e) => e.includes('marked "video"'))).toBe(true)
  })

  it('warns when the opening scene is not video', () => {
    const scenes: SceneQAScene[] = [scene({ narrationText: 'x', tier: 'still' }), scene({ narrationText: 'y', tier: 'video' }), scene({ narrationText: 'z', tier: 'still' })]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('opening scene is not'))).toBe(true)
  })

  it('warns on style/medium words leaking into the image prompt', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'x', tier: 'video', imagePrompt: 'a cinematic 4k photograph of a man in bed' }),
      scene({ narrationText: 'y', imagePrompt: 'his hand on the blanket' }),
      scene({ narrationText: 'z', imagePrompt: 'the door ajar' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('style/medium words') && w.includes('cinematic'))).toBe(true)
  })

  it('warns when an image prompt leads with the setting instead of the subject', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'x', tier: 'video', imagePrompt: 'an empty room with a bed in the corner' }),
      scene({ narrationText: 'y', imagePrompt: 'his hand on the blanket' }),
      scene({ narrationText: 'z', imagePrompt: 'the door ajar' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('lead with the setting'))).toBe(true)
  })

  it('warns when two location labels likely name the same place', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'x', tier: 'video', location: 'bedroom' }),
      scene({ narrationText: 'y', location: 'rented bedroom' }),
      scene({ narrationText: 'z', location: 'rented bedroom' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('same place'))).toBe(true)
  })

  it('does not flag distinct location labels', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'x', tier: 'video', location: 'rented bedroom' }),
      scene({ narrationText: 'y', location: 'rice field' }),
      scene({ narrationText: 'z', location: 'dirt road' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('same place'))).toBe(false)
  })

  it('warns when the scene count is below the suggested minimum', () => {
    const scenes: SceneQAScene[] = [scene({ narrationText: 'x', tier: 'video' }), scene({ narrationText: 'y' }), scene({ narrationText: 'z' })]
    const r = reviewSceneBreakdown({ narration: 'x y z', peakMoment: '', minScenes: 5, maxScenes: 8, scenes })
    expect(r.warnings.some((w) => w.includes('below the suggested minimum'))).toBe(true)
  })
})
