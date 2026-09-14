import { describe, expect, it } from 'vitest'
import { outroTailMs } from '../timings/compute-timings.js'
import { planNarrationPauses } from '../timings/narration-pauses.js'
import { moodToVoiceSettings } from '../voice/voice-settings.js'
import { presetsForGenre, sampleSceneForGenre, stylePresetThumbKey } from './style-presets.js'

describe('custom genres use safe production defaults', () => {
  const tone = { intensity: 5, warmth: 5, energy: 5, pacing: 5, humor: 3 }
  it.each(['cozy mystery', '詩と日常', 'constructor', '__proto__', 'toString', '../../private'])('handles %s without indexing inherited properties or asset paths', (genre) => {
    expect(outroTailMs(genre)).toBe(outroTailMs('general'))
    expect(planNarrationPauses('One. Two.', ['One.', 'Two.'], genre)).toEqual([])
    expect(moodToVoiceSettings([], tone, genre)).toEqual(moodToVoiceSettings([], tone, 'general'))
    expect(sampleSceneForGenre(genre)).toBe(sampleSceneForGenre('general'))
    expect(presetsForGenre(genre)).toEqual(presetsForGenre('general'))
    expect(stylePresetThumbKey('cinematic', genre)).toBe('style-presets/general/cinematic.webp')
  })

  it('preserves the calibrated known-genre values and asset keys', () => {
    expect(outroTailMs('comedy')).toBe(800)
    expect(outroTailMs('horror')).toBe(2200)
    expect(moodToVoiceSettings([], tone, 'horror').speed).toBeLessThanOrEqual(0.9)
    expect(stylePresetThumbKey('cinematic', 'horror')).toBe('style-presets/horror/cinematic.webp')
  })
})
