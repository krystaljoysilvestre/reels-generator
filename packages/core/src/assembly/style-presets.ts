// Curated visual-style presets for channel onboarding. These replace per-channel AI style generation in
// the wizard (which cost a paid image render per option for every signup): the operator picks from this
// fixed gallery — thumbnails are pre-rendered ONCE (scripts/render-style-presets) and shipped as static
// assets, so onboarding spends nothing on visuals. A bespoke, channel-specific look is generated later,
// opt-in, via "Customize look" in Settings.
//
// Each `stylePreset` is the visual DNA fed to the image model (same contract as the LLM-derived styles):
// it starts with an explicit medium phrase and avoids fixing a time of day / light level, so every scene
// sets its own lighting. Non-photographic styles include "illustration, not a photograph".

export interface StylePreset {
  id: string
  label: string // short, recognizable look name
  description: string // one plain-English line: what it is / who it suits
  genres: string[] // genreCategory values this look suits best (for ordering); 'all' = universally usable
  heroFor?: string[] // genreCategory values this look should LEAD (pre-selected default) for — outranks the universal 'all'
  stylePreset: string // visual DNA for the image model
}

// Stable R2/asset key for a preset's pre-rendered thumbnail.
export function stylePresetThumbKey(id: string): string {
  return `style-presets/${id}.webp`
}

// How many presets to surface per channel (the gallery cap). The pool below is tagged so every genre
// has at least this many genuinely-fitting looks.
export const PRESETS_PER_GENRE = 8

export const STYLE_PRESETS: StylePreset[] = [
  // ── Photoreal family ──
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Photoreal, film-still look — versatile and grounded. Works for almost any channel.',
    genres: ['all'],
    stylePreset:
      'cinematic photoreal film still, shallow depth of field, natural color grade, soft volumetric light, fine filmic grain, balanced contrast, 35mm look, lifelike textures and skin, restrained palette, tasteful composition',
  },
  {
    id: 'cinematic-horror',
    label: 'Cinematic Dread',
    description: 'Photoreal horror film still — deep shadows, cold palette, unsettling stillness. The scary default for horror.',
    genres: ['horror'],
    heroFor: ['horror'], // horror channels lead with this, not the neutral universal Cinematic
    stylePreset:
      'grainy 35mm horror film still, low-key chiaroscuro lighting, deep crushed shadows that swallow the edges of frame, cold desaturated teal-and-amber palette, slightly underexposed, humid atmospheric haze, shallow depth of field, heavy occupied negative space, unsettling stillness, naturalistic but ominous, analog film grain texture',
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Gritty reportage realism — candid and true-to-life. Strong for true-crime and explainers.',
    genres: ['informational', 'horror', 'general'],
    stylePreset:
      'gritty photoreal documentary still, natural available light, candid reportage framing, slight handheld imperfection, true-to-life color, fine grain, journalistic realism, unposed authenticity',
  },
  {
    id: 'bright-studio',
    label: 'Bright Studio',
    description: 'Clean, bright product-shot look — crisp and appealing. Great for food and lifestyle.',
    genres: ['lifestyle', 'informational'],
    stylePreset:
      'clean bright photoreal studio shot, soft diffused lighting, crisp sharp focus, vivid true color, minimal seamless background, polished commercial product look, high clarity, appetizing and inviting',
  },
  {
    id: 'found-footage',
    label: 'Found Footage',
    description: 'Degraded handheld video — raw, unsettling, real. Great for horror and mystery.',
    genres: ['horror', 'general'],
    stylePreset:
      'degraded handheld camcorder video still, VHS analog artifacts, chromatic aberration, heavy noise and scan lines, slight motion blur, washed muted colors, vignetting, amateur footage feel, imperfect framing',
  },
  {
    id: 'retro-sepia',
    label: 'Retro Sepia',
    description: 'Aged archival photo — nostalgic and warm. Suits history and period stories.',
    genres: ['informational', 'horror', 'general'],
    stylePreset:
      'vintage sepia-toned archival photograph, aged paper texture, faded warm tones, soft focus, subtle scratches and vignetting, nostalgic early-century feel, timeworn print quality',
  },
  // ── Anime / illustration ──
  {
    id: 'dark-anime',
    label: 'Dark Anime',
    description: 'Moody cel-shaded animation — expressive and stylized. Suits horror, drama, sci-fi.',
    genres: ['horror', 'general'],
    stylePreset:
      'flat cel-shaded anime illustration, illustration not a photograph, bold clean linework, dramatic flat shadows, desaturated moody palette with one accent color, painterly background, expressive atmosphere, high contrast',
  },
  {
    id: 'anime-bright',
    label: 'Anime',
    description: 'Clean, bright cel animation — lively and crisp. Versatile for lighter niches.',
    genres: ['lifestyle', 'informational', 'general'],
    stylePreset:
      'flat cel-shaded anime illustration, illustration not a photograph, clean crisp linework, bright cheerful palette, soft gradient shading, expressive characters, detailed vibrant background',
  },
  {
    id: 'ink-noir',
    label: 'Ink Noir',
    description: 'High-contrast black-and-white ink — graphic and tense. Strong for true-crime and horror.',
    genres: ['horror', 'informational', 'general'],
    stylePreset:
      'high-contrast black-and-white ink illustration, illustration not a photograph, bold brush strokes, deep blacks, halftone texture, stark negative space, graphic-novel inking, dramatic chiaroscuro, limited or no color',
  },
  {
    id: 'comic-book',
    label: 'Comic Book',
    description: 'Bold inked panels with halftone — punchy and graphic. Fun for action and stories.',
    genres: ['horror', 'informational', 'general'],
    stylePreset:
      'inked comic-book panel, illustration not a photograph, bold black outlines, halftone dot shading, dynamic saturated colors, screen-tone texture, graphic-novel energy, strong dramatic composition',
  },
  {
    id: 'charcoal',
    label: 'Charcoal Sketch',
    description: 'Smudged graphite and charcoal — raw and haunting. A moody hand-drawn look.',
    genres: ['horror', 'general'],
    stylePreset:
      'charcoal and graphite sketch, illustration not a photograph, smudged tonal shading, rough paper texture, expressive hatching, monochrome grayscale, raw hand-drawn intensity',
  },
  {
    id: 'woodcut',
    label: 'Woodcut Print',
    description: 'Bold carved relief print — folk and striking. Distinctive for myth and history.',
    genres: ['horror', 'informational', 'general'],
    stylePreset:
      'traditional woodcut relief print, illustration not a photograph, bold carved linework, high-contrast ink, limited two-tone palette, textured hand-printed look, folk-print quality',
  },
  // ── Soft / friendly ──
  {
    id: 'painterly',
    label: 'Painterly',
    description: 'Classical oil-painting texture — rich and timeless. Lovely for drama and lifestyle.',
    genres: ['lifestyle', 'general'],
    stylePreset:
      'classical oil painting, illustration not a photograph, thick impasto brushwork, visible canvas texture, warm layered glazes, soft edges, rich saturated palette, painterly light, gallery-quality composition',
  },
  {
    id: 'storybook',
    label: 'Storybook',
    description: 'Soft hand-painted watercolor — warm and gentle. Best for lifestyle and explainers.',
    genres: ['lifestyle', 'informational', 'general'],
    stylePreset:
      'soft hand-painted watercolor storybook illustration, illustration not a photograph, gentle washes, visible paper grain, loose organic edges, warm pastel palette, cozy inviting mood, light linework',
  },
  {
    id: 'pastel-minimal',
    label: 'Pastel Minimal',
    description: 'Soft flat shapes in muted pastels — calm and clean. Nice for wellness and how-tos.',
    genres: ['lifestyle', 'informational'],
    stylePreset:
      'soft flat pastel illustration, illustration not a photograph, minimal shapes, muted pastel palette, gentle gradients, generous negative space, calm editorial simplicity',
  },
  {
    id: 'animated-3d',
    label: 'Animated 3D',
    description: 'Glossy Pixar-style render — bright and friendly. Great for explainers and lighter niches.',
    genres: ['informational', 'lifestyle', 'general'],
    stylePreset:
      'glossy 3D animated render, illustration not a photograph, smooth subsurface-scattered materials, soft global illumination, rounded stylized forms, vibrant saturated palette, cinematic but friendly, polished Pixar/DreamWorks look',
  },
  {
    id: 'claymation',
    label: 'Claymation',
    description: 'Tactile stop-motion clay — handmade and charming. Playful for quirky niches.',
    genres: ['lifestyle', 'informational', 'general'],
    stylePreset:
      'tactile claymation stop-motion look, illustration not a photograph, sculpted plasticine forms, visible fingerprints and seams, soft studio lighting, handmade charm, shallow miniature set',
  },
  {
    id: 'flat-vector',
    label: 'Flat Vector',
    description: 'Clean modern flat illustration — crisp and clear. Ideal for informational channels.',
    genres: ['informational', 'general'],
    stylePreset:
      'clean modern flat vector illustration, illustration not a photograph, bold simple shapes, limited flat color palette, minimal gradients, crisp geometric composition, clear iconography, uncluttered editorial look',
  },
  {
    id: 'neon-glow',
    label: 'Neon Glow',
    description: 'Vibrant synthwave neon — sleek and electric. Eye-catching for music and tech.',
    genres: ['lifestyle', 'general'],
    stylePreset:
      'vibrant neon-lit synthwave illustration, illustration not a photograph, glowing magenta and cyan, high saturation, soft bloom, retro-futuristic atmosphere, sleek gradients',
  },
]

// The best-fit presets for a channel's genre (genre-tagged + universal), capped at PRESETS_PER_GENRE.
export function presetsForGenre(genre?: string): StylePreset[] {
  const g = (genre ?? 'general').toLowerCase()
  return [...STYLE_PRESETS]
    .filter((p) => p.genres.includes(g) || p.genres.includes('all'))
    .sort((a, b) => fit(b, g) - fit(a, g))
    .slice(0, PRESETS_PER_GENRE)
}

function fit(p: StylePreset, genre: string): number {
  // A look explicitly designated the hero for this genre leads (pre-selected default) — e.g. horror
  // leads with Cinematic Dread, not the neutral universal Cinematic which fights the genre's mood.
  if (p.heroFor?.includes(genre)) return 4
  // Otherwise 'all' (the universal photoreal default) leads so it's offered to every channel; then the
  // genre-specific looks.
  if (p.genres.includes('all')) return 3
  if (p.genres.includes(genre)) return 2
  return 0
}

export function findStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id)
}
