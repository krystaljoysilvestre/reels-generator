import { describe, it, expect } from 'vitest'
import { reviewSceneBreakdown, estimateNarrationSec, MAX_SCENE_SEC, type SceneQAScene } from './scene-qa.js'
import type { BibleEntity, JourneyLeg } from '../types/story-bible.js'

// A 44-word span ≈ 17.6s at 2.5 wps — just over the MAX_SCENE_SEC limit, so a single scene holding it
// should error (the undersplit failure: one still frozen ~18s reads as a dead frame).
const LONG_SPAN =
  'Naglakad ako papunta sa banyo dahil naiihi ako nang gabing iyon habang tulog ang lahat sa bahay at tanging ang malamig na hangin lamang ang kasama ko sa madilim na pasilyo na parang walang katapusan at patuloy na humahaba habang lumalakad ako patungo doon.'

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

  it('errors when the imagePrompt opens on a supporting entity but primaryEntity is a different one', () => {
    // The payoff bug: shot leads with the apparition (supporting) but tags the narrator primary, so the
    // bible splices the narrator's look as the subject → narrator renders instead of the threat.
    const scenes: SceneQAScene[] = [
      scene({
        narrationText: NARRATION,
        imagePrompt: 'the mirror-apparition looms in the glass, half-lit, a too-wide grin — identical to the narrator',
        primaryEntity: 'narrator',
        supportingEntities: ['mirror-apparition'],
      }),
    ]
    const r = reviewSceneBreakdown({ narration: NARRATION, peakMoment: '', minScenes: 1, maxScenes: 6, scenes })
    expect(r.errors.some((e) => e.includes('opens on "mirror-apparition"') && e.includes('primaryEntity is "narrator"'))).toBe(true)
  })

  it('does not flag primaryEntity when the imagePrompt uses natural labels (no ids in the lead)', () => {
    const scenes: SceneQAScene[] = [
      scene({
        narrationText: NARRATION,
        imagePrompt: 'a figure looms in the glass beyond her shoulder, half-lit, a too-wide grin baring too many teeth',
        primaryEntity: 'mirror-apparition',
        supportingEntities: ['narrator'],
      }),
    ]
    const r = reviewSceneBreakdown({ narration: NARRATION, peakMoment: '', minScenes: 1, maxScenes: 6, scenes })
    expect(r.errors).toEqual([])
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

  it('errors when a single scene covers more than the max duration (undersplit)', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: LONG_SPAN, tier: 'video' }),
      scene({ narrationText: ' Tapos may narinig ako.' }),
    ]
    const r = reviewSceneBreakdown({ narration: LONG_SPAN + ' Tapos may narinig ako.', peakMoment: '', minScenes: 1, maxScenes: 8, scenes })
    expect(r.errors.some((e) => e.includes('Scene 1') && e.includes(`${MAX_SCENE_SEC}s limit`))).toBe(true)
  })

  it('errors on an overlong scene even when the total scene count is healthy', () => {
    // The count check alone is fooled: a reel can hit its target count yet still bury one long monologue in
    // a single shot. The per-scene duration guard catches that where the count range cannot.
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'Maikli ito.', tier: 'video' }),
      scene({ narrationText: ' Maikli rin.' }),
      scene({ narrationText: ' ' + LONG_SPAN }), // the buried monologue
      scene({ narrationText: ' Wakas.' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'Maikli ito. Maikli rin. ' + LONG_SPAN + ' Wakas.', peakMoment: '', minScenes: 3, maxScenes: 6, scenes })
    expect(r.warnings.some((w) => w.includes('below the suggested minimum'))).toBe(false) // count is fine
    expect(r.errors.some((e) => e.includes('Scene 3') && e.includes('looks static'))).toBe(true)
  })

  it('does not flag scenes at or under the max duration', () => {
    const scenes: SceneQAScene[] = [
      scene({ narrationText: 'Isa dalawa tatlo apat lima anim pito walo siyam sampu.', tier: 'video' }), // 10 words ≈ 4s
      scene({ narrationText: ' Labing-isa labindalawa.' }),
    ]
    const r = reviewSceneBreakdown({ narration: 'x', peakMoment: '', minScenes: 1, maxScenes: 8, scenes })
    expect(r.errors.some((e) => e.includes('looks static'))).toBe(false)
  })
})

describe('estimateNarrationSec', () => {
  it('estimates spoken length from word count at 2.5 wps', () => {
    expect(estimateNarrationSec('isa dalawa tatlo apat lima')).toBeCloseTo(2, 5) // 5 words / 2.5
  })

  it('treats the LONG_SPAN sample as just over the limit', () => {
    expect(estimateNarrationSec(LONG_SPAN)).toBeGreaterThan(MAX_SCENE_SEC)
  })

  it('returns 0 for empty / whitespace text', () => {
    expect(estimateNarrationSec('   ')).toBe(0)
  })
})

describe('reviewSceneBreakdown — journey-grounded (Phase 2A)', () => {
  const NARR = 'Naglakad kami sa hallway. Pumasok ako sa CR. May babae sa tabi ko.'
  const BIBLE: BibleEntity[] = [
    { id: 'narrator', kind: 'character', description: 'a teenage girl in a school uniform' },
    { id: 'best-friend', kind: 'character', description: 'a teenage girl with a ponytail' },
    { id: 'the-figure', kind: 'character', role: 'threat', description: 'a pale ghostly figure' },
    { id: 'school-hallway', kind: 'location', description: 'a dim school hallway with lockers' },
    { id: 'school-restroom', kind: 'location', description: 'a tiled school restroom with sinks and mirrors' },
  ]
  const JOURNEY: JourneyLeg[] = [
    { span: 'Naglakad kami sa hallway.', locationLabel: 'school hallway', locationEntityId: 'school-hallway', present: ['narrator', 'best-friend'], visible: [], occupancyState: 'inside', isReflection: false },
    { span: 'Pumasok ako sa CR.', locationLabel: 'school restroom', locationEntityId: 'school-restroom', present: ['narrator'], visible: [], occupancyState: 'inside', isReflection: false },
    { span: 'May babae sa tabi ko.', locationLabel: 'school restroom', locationEntityId: 'school-restroom', present: ['narrator', 'the-figure'], visible: ['narrator', 'the-figure'], occupancyState: 'inside', isReflection: true },
  ]
  const base = (scenes: SceneQAScene[]) => ({ narration: NARR, peakMoment: 'May babae sa tabi ko.', minScenes: 1, maxScenes: 8, scenes, bibleEntities: BIBLE, narratorEntityId: 'narrator', journey: JOURNEY })

  it('errors when a scene tags a location the journey says it is NOT in', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Naglakad kami sa hallway.', location: 'school hallway', primaryEntity: 'narrator', supportingEntities: ['best-friend', 'school-restroom'], imagePrompt: 'the two friends walk down a hallway, reaching a corner' })]))
    expect(r.errors.some((e) => e.includes('tags location "school-restroom"'))).toBe(true)
  })

  it('errors on invented cast (a character the leg says is not present)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Pumasok ako sa CR.', location: 'school restroom', primaryEntity: 'narrator', supportingEntities: ['best-friend'], imagePrompt: 'the narrator steps into the restroom, pushing the door open' })]))
    expect(r.errors.some((e) => e.includes('character "best-friend"'))).toBe(true)
  })

  it('does NOT flag the narrator as invented cast (POV, always present)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Pumasok ako sa CR.', location: 'school restroom', primaryEntity: 'narrator', supportingEntities: ['narrator'], imagePrompt: 'over the shoulder, the narrator pushing the restroom door open' })]))
    expect(r.errors.some((e) => e.includes('character "narrator"'))).toBe(false)
  })

  it('reveal errors when the threat (present in the peak leg) is not primaryEntity', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'May babae sa tabi ko.', location: 'school restroom', tier: 'video', primaryEntity: 'narrator', supportingEntities: ['narrator'], subjectMotion: 'her smile widens', imagePrompt: 'the narrator stares into the mirror' })]))
    expect(r.errors.some((e) => e.includes('must OPEN on the threat'))).toBe(true)
  })

  it('reveal passes when the threat is primaryEntity (narrator splice handled at render, not required here)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'May babae sa tabi ko.', location: 'school restroom', tier: 'video', primaryEntity: 'the-figure', supportingEntities: [], subjectMotion: 'her smile slowly widens', imagePrompt: 'in the mirror, the pale figure reflected beside the narrator' })]))
    expect(r.errors.some((e) => e.includes('must OPEN on the threat'))).toBe(false)
  })

  it('errors when a video reveal beat has empty subjectMotion', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'May babae sa tabi ko.', location: 'school restroom', tier: 'video', primaryEntity: 'the-figure', supportingEntities: ['narrator'], subjectMotion: '', imagePrompt: 'in the mirror, the pale figure reflected beside the narrator' })]))
    expect(r.errors.some((e) => e.includes('subjectMotion is empty'))).toBe(true)
  })

  it('warns on a static, camera-facing person (no action/gaze verb)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Pumasok ako sa CR.', location: 'school restroom', primaryEntity: 'narrator', supportingEntities: ['narrator'], imagePrompt: 'a girl in the restroom' })]))
    expect(r.warnings.some((w) => w.includes('static, camera-facing'))).toBe(true)
  })

  it('errors (Check E) when a first-person beat draws the narrator as a standing figure', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Pumasok ako sa CR.', location: 'school restroom', primaryEntity: 'narrator', supportingEntities: ['narrator'], imagePrompt: 'The narrator stands in the restroom, facing forward, her posture tense' })]))
    expect(r.errors.some((e) => e.includes('FIRST-PERSON'))).toBe(true)
  })

  it('Check E does NOT fire on a POV hands beat (no figure of the narrator)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'Pumasok ako sa CR.', location: 'school restroom', primaryEntity: null, supportingEntities: [], imagePrompt: "close-up of the narrator's hands pushing the restroom door open, seen over her shoulder" })]))
    expect(r.errors.some((e) => e.includes('FIRST-PERSON'))).toBe(false)
  })

  it('Check E is exempt on a reflection beat (narrator legitimately shown + re-anchored)', () => {
    const r = reviewSceneBreakdown(base([scene({ narrationText: 'May babae sa tabi ko.', location: 'school restroom', tier: 'video', primaryEntity: 'the-figure', supportingEntities: [], subjectMotion: 'her grin widens', imagePrompt: 'in the mirror, the narrator stands reflected beside a pale figure' })]))
    expect(r.errors.some((e) => e.includes('FIRST-PERSON'))).toBe(false)
  })
})

describe('reviewSceneBreakdown — voiceover embodiment', () => {
  const VO_NARRATION =
    'May bagong mega-proyekto sa Pilipinas. Ayon sa gobyerno, malaki raw ang maidudulot nito. Pero may mga kritiko na nag-aalala.'
  const vo = (scenes: SceneQAScene[], over: Record<string, unknown> = {}) =>
    reviewSceneBreakdown({ narration: VO_NARRATION, peakMoment: '', minScenes: 3, maxScenes: 6, narratorPerspective: 'voiceover', scenes, ...over })

  const cleanScenes: SceneQAScene[] = [
    { narrationText: 'May bagong mega-proyekto sa Pilipinas.', imagePrompt: 'wide aerial of an industrial district concept rising on open plains at dusk, blueprint overlays marking it as a render', tier: 'video', location: 'project site' },
    { narrationText: ' Ayon sa gobyerno, malaki raw ang maidudulot nito.', imagePrompt: 'glowing ascending bar-graph forms of light over a night cityscape, abstract, no readable text', tier: 'still', location: 'economic dataviz' },
    { narrationText: ' Pero may mga kritiko na nag-aalala.', imagePrompt: 'massive cooling towers venting vapor beside high-voltage pylons, a reservoir in the foreground reflecting a dark sky', tier: 'still', location: 'cooling towers' },
  ]

  it('passes clean subject b-roll with no voiceover errors', () => {
    const r = vo(cleanScenes)
    expect(r.errors).toEqual([])
  })

  it('errors when a voiceover shot names a narrator/host figure', () => {
    const scenes = [{ ...cleanScenes[0]!, imagePrompt: 'the narrator stands on a rooftop overlooking the city at dawn, papers rustling on the ledge' }, cleanScenes[1]!, cleanScenes[2]!]
    const r = vo(scenes)
    expect(r.errors.some((e) => e.includes('VOICEOVER') && e.includes('narrator'))).toBe(true)
  })

  it('errors on POV framing in a voiceover reel', () => {
    const scenes = [{ ...cleanScenes[0]!, imagePrompt: 'POV from a rooftop ledge overlooking the skyline, a hand resting on the railing' }, cleanScenes[1]!, cleanScenes[2]!]
    const r = vo(scenes)
    expect(r.errors.some((e) => e.includes('VOICEOVER'))).toBe(true)
  })

  it('warns (not errors) when a voiceover reel carries a narratorEntityId', () => {
    const r = vo(cleanScenes, { narratorEntityId: 'narrator' })
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes('narratorEntityId'))).toBe(true)
  })

  it('does not run the voiceover check on first_person reels', () => {
    const scenes = [{ ...cleanScenes[0]!, imagePrompt: "POV of the dark hallway, the narrator's hand pushing the door open" }, cleanScenes[1]!, cleanScenes[2]!]
    const r = reviewSceneBreakdown({ narration: VO_NARRATION, peakMoment: '', minScenes: 3, maxScenes: 6, narratorPerspective: 'first_person', scenes })
    expect(r.errors.some((e) => e.includes('VOICEOVER'))).toBe(false)
  })
})
