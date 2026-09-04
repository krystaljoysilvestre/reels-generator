import { describe, expect, it } from 'vitest'
import { buildSceneDepictionDoctorPrompt } from './scene-depiction-doctor.v1.js'

describe('scene depiction doctor', () => {
  it('may remove an unsourced archival-only person when their action cannot be shown truthfully', () => {
    const prompt = buildSceneDepictionDoctorPrompt({
      nicheDescription: 'space history',
      genreCategory: 'informational',
      bibleEntities: [{
        id: 'john-aaron',
        kind: 'character',
        depiction: { depictionMode: 'archival_only' },
      }],
      scenes: [{
        idx: 1,
        narrationText: 'John Aaron recognized the telemetry pattern and recommended SCE to AUX.',
        imagePrompt: 'John Aaron studies a console and speaks into a headset.',
        reason: 'A generated depiction substitutes invented imagery for an unsourced archival-only person.',
        primaryEntity: 'john-aaron',
        depictionBasis: 'reconstruction',
        sourcePresentationEntity: null,
      }],
    })

    expect(prompt.system).toContain('RESTRICTED REAL-PERSON ESCAPE HATCH')
    expect(prompt.system).toContain('remove that person from primaryEntity, supportingEntities, appearanceByEntity, and imagePrompt')
    expect(prompt.system).toContain('This exception is allowed to change primaryEntity or set it null')
  })
})
