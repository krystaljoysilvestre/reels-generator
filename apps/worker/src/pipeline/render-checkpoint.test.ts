import { describe, expect, it } from 'vitest'
import { visualCheckpointKey, visualCheckpointMatches, visualCheckpointMeta } from './render-checkpoint.js'

describe('render visual checkpoint', () => {
  it('uses a reel-owned private storage key', () => {
    expect(visualCheckpointKey('reel-1')).toBe('reels/reel-1/visual.mp4')
  })

  it('reuses only the exact rendered pixels and duration', () => {
    const meta = visualCheckpointMeta(60_000, 'visual-v1')

    expect(visualCheckpointMatches(meta, 60_000, 'visual-v1')).toBe(true)
    expect(visualCheckpointMatches(meta, 61_000, 'visual-v1')).toBe(false)
    expect(visualCheckpointMatches(meta, 60_000, 'visual-v2')).toBe(false)
  })
})
