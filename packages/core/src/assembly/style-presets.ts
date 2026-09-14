// Curated visual-style presets for channel onboarding. These replace per-channel AI style generation in
// the wizard (which cost a paid image render per option for every signup): the operator picks from this
// fixed gallery — thumbnails are pre-rendered ONCE (scripts/render-style-presets) and shipped as static
// assets, so onboarding spends nothing on visuals. A bespoke, channel-specific look is generated later,
// opt-in, via "Customize look" in Settings.
//
// Each `stylePreset` is the visual DNA fed to the image model (same contract as the LLM-derived styles).
// Three rules keep the gallery clean and the renders predictable:
//   1. Lead with the bare MEDIUM (photograph / watercolor / oil painting / charcoal drawing / ink drawing
//      / woodcut print), then the style/optics/texture. Non-photographic styles add "illustration not a
//      photograph" right after the medium.
//   2. Describe only OBSERVABLE attributes — medium, composition, lighting, texture, color, optics,
//      materials. No emotional or narrative words ("ominous", "haunting", "inviting"): the mood must
//      emerge from the generated scene, not be baked into the style.
//   3. Never fix a time of day / light level, so every scene sets its own lighting.

export interface StylePreset {
  id: string
  label: string // short, recognizable look name
  description: string // one plain-English line: what it is / who it suits
  genres: string[] // genreCategory values this look suits best (for ordering); 'all' = universally usable
  heroFor?: string[] // genreCategory values this look should LEAD (pre-selected default) for — outranks the universal 'all'
  stylePreset: string // visual DNA for the image model
}

// Stable R2/asset key for a preset's pre-rendered thumbnail. Thumbnails are rendered PER GENRE
// (each genre previews its looks on its own sample scene — see SAMPLE_SCENES), so pass the genre.
// Omitting it returns the pre-genre key, which callers use as the fallback while genre thumbnails
// are still being rendered.
export function stylePresetThumbKey(id: string, genre?: string): string {
  const presetGenre = genre && Object.hasOwn(SAMPLE_SCENES, genre) ? genre : 'general'
  return genre ? `style-presets/${presetGenre}/${id}.webp` : `style-presets/${id}.webp`
}

// Inverse of stylePresetThumbKey: `style-presets/<genre>/<id>.webp` → `style-presets/<id>.webp`,
// and null for anything else. The asset route uses this to serve the pre-genre thumbnail when a
// genre's own thumbnails haven't been rendered yet. Deliberately narrow — it only ever drops the
// genre segment inside this one shared, non-tenant prefix, so it can't redirect a read elsewhere.
export function presetThumbFallbackKey(key: string): string | null {
  const m = /^style-presets\/[A-Za-z0-9_-]+\/([A-Za-z0-9_-]+\.webp)$/.exec(key)
  return m ? `style-presets/${m[1]}` : null
}

// The scene each genre's thumbnails are rendered on. One scene per genre, shared by all of that
// genre's looks: holding the CONTENT constant is what makes the gallery a fair comparison — vary the
// scene per card and the prettiest scene wins instead of the best style.
//
// Every scene must be:
//   1. SAFE to render — atmospheric, never graphic. No gore, injury, nudity, or minors in peril.
//   2. Built around a PERSON WITH A VISIBLE FACE, at a three-quarter angle. Faces are the hardest
//      thing a style has to do and where styles differ most, so a back-of-the-head scene hides
//      exactly what the creator is trying to judge.
//   3. Genre-true in mood — a cooking channel must not preview its looks on a horror scene.
//   4. Content only: no style/medium words (the preset's DNA supplies those), and it SETS its own
//      light, because the presets deliberately never fix a time of day.
export const SAMPLE_SCENES: Record<string, string> = {
  horror:
    'a young woman standing in the doorway of an old house, turning to look back over her shoulder toward the camera, her face lit from below by the lamp she carries, an unlit hallway receding behind her',
  drama:
    'a man in his forties sitting at a kitchen table, seen from a three-quarter angle, an unopened letter held in both hands, his face turned toward a window, late afternoon light across his cheek',
  comedy:
    'a young man in an apron standing in a cluttered kitchen, seen from a three-quarter angle, eyebrows raised in mock disbelief at a collapsed cake on the counter in front of him, bright even light',
  reddit_story:
    'a young woman sitting on the edge of a bed in a small bedroom, seen from a three-quarter angle, a phone held in both hands, glancing up toward the camera with a guarded expression, warm lamp light',
  commentary:
    'a woman standing in front of a plain wall, seen from a three-quarter angle, one hand raised mid-gesture as if making a point, a direct and confident expression, even frontal light',
  informational:
    'a man in his thirties at a workbench, seen from a three-quarter angle, holding up a small mechanical object toward the camera and examining it with interest, bright even light',
  lifestyle:
    'a woman in a bright kitchen, seen from a three-quarter angle, arranging fresh vegetables on a wooden board, glancing up toward the camera with a warm smile, soft daylight from a window',
  childrens:
    'a small child in pajamas kneeling on a bedroom floor, seen from a three-quarter angle, a firefly cupped in both hands, looking up toward the camera with wide delighted eyes, soft warm lamp light',
  fairytale:
    'a young woman in a simple cloak at the edge of a forest clearing, seen from a three-quarter angle, a small lantern held at her side, looking toward the camera, tall trees and drifting mist behind her',
  general:
    'a person in their late twenties standing on a city street, seen from a three-quarter angle, looking toward the camera with a calm open expression, soft daylight, buildings receding behind them',
}

// The sample scene for a genre, falling back to the neutral 'general' one for an unknown value.
export function sampleSceneForGenre(genre?: string): string {
  const key = (genre ?? 'general').toLowerCase()
  return SAMPLE_SCENES[Object.hasOwn(SAMPLE_SCENES, key) ? key : 'general']!
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
      'photograph, cinematic 35mm film still, natural lens imperfections, soft volumetric light, shallow depth of field, balanced color grade, fine film grain, lifelike skin and textures, restrained palette',
  },
  {
    id: 'cinematic-horror',
    label: 'Cinematic Dread',
    description: 'Photoreal horror film still — deep shadows, cold palette, a worn, lived-in world. The scary default for horror.',
    genres: ['horror'],
    heroFor: ['horror'], // horror channels lead with this, not the neutral universal Cinematic
    // The worn-surfaces run (owner decision 2026-07-15): horror worlds read used, never showroom-new.
    // Surfaces-only wording keeps people/wardrobe clean; nouns stay generic (no tile/taps) so the clause
    // can't conjure fixtures into scenes that lack them.
    stylePreset:
      'photograph, grainy 35mm horror film still, low-key chiaroscuro lighting with the key subject clearly exposed, deep shadows pooling at the edges and background, cold desaturated teal-and-amber palette, humid atmospheric haze, shallow depth of field, large areas of shadowed negative space, analog film grain texture, well-used lived-in surfaces with visible age, scuffed paint, faint water stains along edges, worn fittings, smudged glass, thin grime settled into seams and corners',
  },
  {
    id: 'analog-film',
    label: 'Analog Film',
    description: 'Warm 35mm film look — soft grain and lifted blacks. The nostalgic Instagram/TikTok aesthetic.',
    genres: ['lifestyle', 'informational', 'general', 'drama', 'reddit_story', 'commentary', 'comedy'],
    stylePreset:
      'photograph, Kodak Portra film look, soft pastel highlights, fine film grain, slightly lifted blacks, warm natural skin tones, subtle halation, vintage lens rendering, shallow depth of field',
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Gritty reportage realism — candid and true-to-life. Strong for true-crime and explainers.',
    genres: ['informational', 'horror', 'general', 'commentary', 'reddit_story', 'drama'],
    stylePreset:
      'photograph, gritty documentary still, natural available light, candid reportage framing, slight handheld imperfection, natural color reproduction, fine grain, unposed framing',
  },
  {
    id: 'bright-studio',
    label: 'Bright Studio',
    description: 'Clean, bright product-shot look — crisp and appealing. Great for food and lifestyle.',
    genres: ['lifestyle', 'informational', 'comedy', 'commentary'],
    stylePreset:
      'photograph, clean bright studio product shot, soft diffused lighting, crisp sharp focus, vivid accurate color, minimal seamless background, high clarity, polished commercial look',
  },
  {
    id: 'found-footage',
    label: 'Found Footage',
    description: 'Degraded handheld video — raw, unsettling, real. Great for horror and mystery.',
    genres: ['horror', 'general', 'reddit_story'],
    stylePreset:
      'video still, degraded handheld camcorder footage, VHS analog artifacts, chromatic aberration, heavy noise and scan lines, slight motion blur, washed muted colors, heavy vignetting, imperfect handheld framing',
  },
  {
    id: 'retro-sepia',
    label: 'Retro Sepia',
    description: 'Aged archival photo — nostalgic and warm. Suits history and period stories.',
    genres: ['informational', 'horror', 'general', 'drama', 'fairytale'],
    stylePreset:
      'photograph, vintage sepia-toned archival print, aged paper texture, faded warm tones, soft focus, subtle scratches and vignetting, timeworn print quality',
  },
  // ── Anime / illustration ──
  {
    id: 'dark-anime',
    label: 'Dark Anime',
    description: 'Moody cel-shaded animation — expressive and stylized. Suits horror, drama, sci-fi.',
    genres: ['horror', 'general', 'drama', 'reddit_story', 'fairytale'],
    stylePreset:
      'illustration not a photograph, Japanese cel animation, bold clean line art, 2D cel shading, dramatic flat shadows, desaturated palette with one accent color, painted background, limited gradients, high contrast',
  },
  {
    id: 'anime-bright',
    label: 'Anime',
    description: 'Clean, bright cel animation — lively and crisp. Versatile for lighter niches.',
    genres: ['lifestyle', 'informational', 'general', 'comedy', 'childrens', 'fairytale', 'drama', 'reddit_story'],
    stylePreset:
      'illustration not a photograph, Japanese cel animation, clean crisp line art, 2D cel shading, bright saturated palette, soft gradient shading, detailed painted background',
  },
  {
    id: 'ink-noir',
    label: 'Ink Noir',
    description: 'High-contrast black-and-white ink — graphic and tense. Strong for true-crime and horror.',
    genres: ['horror', 'informational', 'general', 'drama', 'reddit_story', 'commentary'],
    stylePreset:
      'ink drawing, illustration not a photograph, high-contrast black and white, bold brush strokes, deep blacks, halftone texture, stark negative space, graphic-novel inking, dramatic chiaroscuro, limited or no color',
  },
  {
    id: 'comic-book',
    label: 'Comic Book',
    description: 'Bold inked panels with halftone — punchy and graphic. Fun for action and stories.',
    genres: ['horror', 'informational', 'general', 'comedy', 'reddit_story', 'commentary', 'childrens'],
    stylePreset:
      'illustration not a photograph, inked comic-book panel, bold black outlines, halftone dot shading, dynamic saturated colors, screen-tone texture, strong dramatic composition',
  },
  {
    id: 'charcoal',
    label: 'Charcoal Sketch',
    description: 'Smudged graphite and charcoal — raw and haunting. A moody hand-drawn look.',
    genres: ['horror', 'general', 'drama', 'fairytale'],
    stylePreset:
      'charcoal drawing, illustration not a photograph, smudged graphite and charcoal, soft tonal shading, rough paper texture, expressive hatching, monochrome grayscale',
  },
  {
    id: 'woodcut',
    label: 'Woodcut Print',
    description: 'Bold carved relief print — folk and striking. Distinctive for myth and history.',
    genres: ['horror', 'informational', 'general', 'fairytale'],
    stylePreset:
      'woodcut print, illustration not a photograph, traditional relief carving, bold carved linework, high-contrast ink, limited two-tone palette, textured hand-printed look',
  },
  // ── Soft / friendly ──
  {
    id: 'painterly',
    label: 'Painterly',
    description: 'Classical oil-painting texture — rich and timeless. Lovely for drama and lifestyle.',
    genres: ['lifestyle', 'general', 'drama', 'fairytale', 'childrens'],
    stylePreset:
      'oil painting, illustration not a photograph, classical style, thick impasto brushwork, visible canvas texture, warm layered glazes, soft edges, rich saturated palette, painterly light',
  },
  {
    id: 'storybook',
    label: 'Storybook',
    description: 'Soft hand-painted watercolor — warm and gentle. Best for lifestyle and explainers.',
    genres: ['lifestyle', 'informational', 'general', 'childrens', 'fairytale', 'drama'],
    heroFor: ['fairytale'], // a hand-painted storybook look is the fairytale default, not photoreal
    stylePreset:
      'watercolor, illustration not a photograph, hand-painted storybook style, cold-press paper texture, visible pigment blooms, gentle washes, soft pencil linework, loose brush edges, warm pastel palette',
  },
  {
    id: 'pastel-minimal',
    label: 'Pastel Minimal',
    description: 'Soft flat shapes in muted pastels — calm and clean. Nice for wellness and how-tos.',
    genres: ['lifestyle', 'informational', 'childrens', 'comedy'],
    stylePreset:
      'illustration not a photograph, soft flat pastel shapes, minimal composition, muted pastel palette, gentle gradients, generous negative space, editorial simplicity',
  },
  {
    id: 'animated-3d',
    label: 'Animated 3D',
    description: 'Glossy Pixar-style render — bright and friendly. Great for explainers and lighter niches.',
    genres: ['informational', 'lifestyle', 'general', 'childrens', 'comedy', 'fairytale'],
    heroFor: ['childrens'], // kids' channels lead with the bright friendly render, not photoreal
    stylePreset:
      'illustration not a photograph, stylized 3D animated render, rounded proportions, smooth subsurface-scattered materials, soft global illumination, vibrant saturated materials, glossy surfaces, cinematic composition',
  },
  {
    id: 'claymation',
    label: 'Claymation',
    description: 'Tactile stop-motion clay — handmade and charming. Playful for quirky niches.',
    genres: ['lifestyle', 'informational', 'general', 'childrens', 'comedy', 'fairytale'],
    stylePreset:
      'illustration not a photograph, claymation stop-motion still, sculpted plasticine forms, visible fingerprints and seams, soft studio lighting, shallow miniature set, handmade imperfections',
  },
  {
    id: 'flat-vector',
    label: 'Flat Vector',
    description: 'Clean modern flat illustration — crisp and clear. Ideal for informational channels.',
    genres: ['informational', 'general', 'commentary', 'comedy'],
    stylePreset:
      'illustration not a photograph, clean flat vector graphic, bold simple shapes, limited flat color palette, minimal gradients, crisp geometric composition, clear iconography, uncluttered editorial look',
  },
  {
    id: 'neon-glow',
    label: 'Neon Glow',
    description: 'Vibrant synthwave neon — sleek and electric. Eye-catching for music and tech.',
    genres: ['lifestyle', 'general', 'commentary', 'comedy'],
    stylePreset:
      'illustration not a photograph, neon-lit synthwave graphic, glowing magenta and cyan, high saturation, soft bloom, retro-futuristic palette, sleek gradients',
  },
]

// The best-fit presets for a channel's genre (genre-tagged + universal), capped at PRESETS_PER_GENRE.
export function presetsForGenre(genre?: string): StylePreset[] {
  const key = (genre ?? 'general').toLowerCase()
  const g = Object.hasOwn(SAMPLE_SCENES, key) ? key : 'general'
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

// EVIDENCE-BASED NARRATIVE rendering profile. EBN reels are FORCED to render in this look regardless of
// the channel's own stylePreset — the visual guardrail (specs/evidence-based-narrative.md) forbids any
// synthetic image that could be mistaken for authentic documentation, so a factual reel must never render
// photoreal. This leads hard with the illustrated medium and repeats "NOT a photograph / no photorealism"
// so the model can't drift realistic; "no legible text" reinforces the negative-prompt guard (a real
// timeline/diagram with accurate labels is Tier B — a separate build the image path can't do). The
// illustrative modes here were probe-validated to comply with the guardrail and render well
// (apps/worker/scripts/probe-ebn-visuals.ts). One consistent documentary-illustration look per reel;
// per-beat mode selection (court-sketch vs infographic) is a later refinement.
export const EBN_RENDERING_PROFILE =
  'clean editorial conceptual illustration, hand-illustrated documentary style, flat muted color palette, simple bold shapes and clear composition, explainer/magazine artwork, obviously an illustration and clearly NOT a photograph, no photorealism, no legible text'
