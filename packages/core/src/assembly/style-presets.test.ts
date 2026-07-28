import { describe, it, expect } from 'vitest'
import {
  presetsForGenre,
  PRESETS_PER_GENRE,
  STYLE_PRESETS,
  SAMPLE_SCENES,
  sampleSceneForGenre,
  stylePresetThumbKey,
  presetThumbFallbackKey,
} from './style-presets.js'
import { GENRE_MODULE_VALUES } from '../prompts/scenes.v1.js'

describe('style preset gallery', () => {
  // Regression: six of ten genres (drama, commentary, reddit_story, comedy, childrens, fairytale) used
  // to fall through to the single universal 'cinematic' preset, so onboarding showed those channels a
  // one-card "gallery" while claiming to offer PRESETS_PER_GENRE looks.
  it('offers a full gallery for every genre module', () => {
    for (const genre of GENRE_MODULE_VALUES) {
      expect(presetsForGenre(genre), `genre ${genre}`).toHaveLength(PRESETS_PER_GENRE)
    }
  })

  it('leads each genre with a look tagged for it, never a fallback', () => {
    for (const genre of GENRE_MODULE_VALUES) {
      const first = presetsForGenre(genre)[0]!
      expect(
        first.heroFor?.includes(genre) || first.genres.includes(genre) || first.genres.includes('all'),
        `genre ${genre} led with ${first.id}`,
      ).toBe(true)
    }
  })

  it('honours heroFor over the universal default', () => {
    expect(presetsForGenre('horror')[0]!.id).toBe('cinematic-horror')
    expect(presetsForGenre('childrens')[0]!.id).toBe('animated-3d')
    expect(presetsForGenre('fairytale')[0]!.id).toBe('storybook')
  })

  it('has a sample scene for every genre module', () => {
    for (const genre of GENRE_MODULE_VALUES) {
      expect(SAMPLE_SCENES[genre], `genre ${genre}`).toBeTruthy()
    }
  })

  // The scenes exist to show how each style renders a FACE; a scene that hides it defeats the gallery.
  it('frames every sample scene on a visible face', () => {
    for (const [genre, scene] of Object.entries<string>(SAMPLE_SCENES)) {
      expect(scene.toLowerCase(), `genre ${genre}`).toMatch(/three-quarter|over her shoulder|over his shoulder/)
      expect(scene.toLowerCase(), `genre ${genre}`).not.toMatch(/from behind|back to the camera|seen from the back/)
    }
  })

  it('falls back to the neutral scene for an unknown genre', () => {
    expect(sampleSceneForGenre('not-a-genre')).toBe(SAMPLE_SCENES['general'])
    expect(sampleSceneForGenre(undefined)).toBe(SAMPLE_SCENES['general'])
  })

  it('keys thumbnails per genre, with the pre-genre key as the fallback', () => {
    expect(stylePresetThumbKey('cinematic', 'horror')).toBe('style-presets/horror/cinematic.webp')
    expect(stylePresetThumbKey('cinematic')).toBe('style-presets/cinematic.webp')
  })

  // This runs inside /api/asset's 404 path, so it must never rewrite a key outside the shared
  // style-presets prefix — a fallback that escaped its prefix would be a cross-tenant read.
  it('maps a genre thumbnail key back to the pre-genre key, and nothing else', () => {
    expect(presetThumbFallbackKey('style-presets/horror/cinematic-horror.webp')).toBe('style-presets/cinematic-horror.webp')
    expect(presetThumbFallbackKey('style-presets/cinematic.webp')).toBeNull() // already the fallback
    expect(presetThumbFallbackKey('reels/abc/scene-0.webp')).toBeNull()
    expect(presetThumbFallbackKey('style-presets/horror/../../reels/x.webp')).toBeNull()
    expect(presetThumbFallbackKey('style-presets/a/b/c.webp')).toBeNull()
    expect(presetThumbFallbackKey('style-presets/horror/cinematic.mp4')).toBeNull()
    expect(presetThumbFallbackKey('')).toBeNull()
  })

  it('round-trips every real thumbnail key', () => {
    for (const genre of GENRE_MODULE_VALUES) {
      for (const p of presetsForGenre(genre)) {
        expect(presetThumbFallbackKey(stylePresetThumbKey(p.id, genre))).toBe(stylePresetThumbKey(p.id))
      }
    }
  })

  it('keeps preset ids unique', () => {
    const ids = STYLE_PRESETS.map((p: { id: string }) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
