// Server-side prompt assembly. The LLM writes content; the system owns style and the canonical look
// of recurring entities. The LLM never sees or modifies the style preset, and never re-describes a
// bible entity — those are spliced here, byte-identically, so they can't paraphrase-drift across the
// independently-generated scene images (see specs/story-bible.md).

import type { BibleEntity, StoryBible } from '../types/story-bible.js'
import { sceneEntities } from './story-bible.js'

// Story-bible expansion for a single scene: the scene's entity references resolved against the reel's
// frozen bible. Optional — when absent, assembleImagePrompt behaves exactly as before (style + content).
export interface EntityExpansion {
  bible: StoryBible
  primaryEntity: string | null
  supportingEntities: string[]
}

export function assembleImagePrompt(
  contentPrompt: string,
  stylePreset: string,
  expansion?: EntityExpansion,
  lighting?: string, // reel-level time-of-day directive (see reelLightingDirective) — forces night/dark, etc.
): string {
  const style = stylePreset.trim()
  const content = contentPrompt.trim()
  const light = lighting?.trim()

  // No bible → unchanged: lead with style DNA, then the scene content (legacy callers, previews, etc.).
  // Lighting, when present, is appended as its own clause (keeps the legacy "style, content" form intact).
  if (!expansion) {
    const base = `${style}, ${content}`
    return light ? `${base}. ${light}` : base
  }

  const { bible, primaryEntity, supportingEntities } = expansion
  // Scene entities in splice order, narrator suppression + depictability applied (see sceneEntities). When
  // the scene's image is reference-conditioned (the entity has a plate), the references carry the look — but
  // we still splice the descriptions: they're the channel's narration-language facts that the reference
  // can't encode (which light source is active, etc.), and they keep the text-only fallback identical.
  const specs = sceneEntities(bible, { primaryEntity, supportingEntities }).map((e) => e.description)

  // Style first (convention: style DNA frames how the scene reads), then the frozen entity specs in
  // role order (primary leads → satisfies VISUAL PRIORITY mechanically), then the scene's action prose,
  // then the reel-level lighting directive last (it constrains the whole frame). Sentence-level join only.
  const parts = [style, ...specs, content, light ?? ''].map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean)
  return parts.join('. ')
}

// Reel-level lighting directive from the bible's time-of-day cues. The per-scene LLM names the active light
// SOURCE, but it doesn't reliably commit to DARKNESS — a night beat kept rendering in daylight. This forces
// the time-of-day into every scene + every (non-character) reference plate so a night story stays dark.
// Returns undefined when the reel isn't night-set (then nothing is imposed).
const NIGHT_CUE = /night|gabi|hatinggab|madaling|evening|takip[\s-]?silim|dapit[\s-]?hapon|dusk|3\s*am|hatinggabi|late/i
export function reelLightingDirective(_genreCategory: string | undefined, timeline: string[] | undefined): string | undefined {
  // Just establish that it's night and lit by the scene's own source — enough to stop daylight, WITHOUT
  // forcing maximal blackness on every frame (that flattened the reel into uniform dread). How dark/dready
  // a given scene gets is the per-scene job of the genre module + mood, not a blanket reel-wide crush.
  const cues = (timeline ?? []).join(' ')
  if (!NIGHT_CUE.test(cues)) return undefined
  return 'Shot at night, lit by the scene’s own light source with natural darkness around it; no daylight'
}

export function assembleNegativePrompt(
  opts?: { genreCategory?: string; channelNegativeTerms?: string },
): string {
  // gpt-image-1 has no negative_prompt field — these are folded into the prompt as an "Avoid:" clause.
  // Keep the list SHORT and intentional: a long avoid-list dilutes the real prompt and can ironically
  // surface the negated nouns. We drop the whole flux-era artifact/anatomy/quality-floor/double-door
  // catalog (those were flux failure modes; gpt-image-1 doesn't make them) and keep only what genuinely
  // helps: a watermark guard plus the content guards.
  // Suppress text: image models sprinkle gibberish lettering/signage into scenes, which reads as junk.
  // (This does also block INTENTIONAL diegetic text like an in-frame phone message — an accepted tradeoff;
  // unwanted gibberish was the bigger problem in practice.)
  const defaults = ['watermark', 'text', 'lettering', 'captions', 'subtitles', 'signage', 'writing on screen']
  // Content guards. Suppressing gore/violence/nudity is right for most niches, but on a HORROR channel the
  // gore/violence guards fight the genre — they neuter exactly the dread/menace the look is built for, so
  // every reshoot comes back tame. Horror channels drop those two. 'nudity' STAYS for everyone: it adds
  // nothing to dread, and dropping it risks unclothed figures (a platform-ban risk).
  // OpenAI's own moderation still backstops true NSFW at generation time.
  const contentGuards = opts?.genreCategory === 'horror' ? ['nudity'] : ['gore', 'graphic violence', 'nudity']
  const channel = opts?.channelNegativeTerms ? opts.channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...contentGuards, ...channel].join(', ')
}

// Per-kind framing for an entity REFERENCE PLATE — the canonical, scene-free portrait of an entity that
// the scene-image step conditions on for continuity (see specs/story-bible.md). The plate must isolate the
// subject (no story action, no other entities) so the edit endpoint reads a clean identity to carry forward.
const REFERENCE_FRAMING: Record<BibleEntity['kind'], string> = {
  character: 'character reference sheet, single figure, full body, neutral standing pose, plain neutral backdrop, even soft lighting, face clearly visible, no other people',
  location: 'establishing wide shot of the empty location, no people, no figures',
  object: 'the object alone, centred, plain neutral backdrop, no people',
}

// A reference plate is an isolated subject shot — it must NEVER contain text/lettering. Without this guard,
// an image model handed a short/label-like description tends to RENDER the words (e.g. printing
// "reloh sa telepono" instead of drawing a phone). Always appended to plate prompts.
const PLATE_NO_TEXT = 'no text, no lettering, no words, no labels, no watermark'

// Build the prompt for an entity's reference plate. Leads with the channel style DNA (so the plate — and
// therefore every scene conditioned on it — stays on-brand), then the entity's frozen canonical description,
// then kind-specific isolating framing, a no-text guard, and (for non-character plates only) the reel's
// night/lighting directive so a night reel's places/objects aren't anchored to a daylit plate. Character
// plates stay evenly lit — the face must be readable for identity; the scene darkens them at render.
export function assembleReferencePrompt(entity: BibleEntity, stylePreset: string, lighting?: string): string {
  const light = entity.kind === 'character' ? undefined : lighting?.trim()
  const parts = [stylePreset, entity.description, REFERENCE_FRAMING[entity.kind], PLATE_NO_TEXT, light ?? '']
  return parts.map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean).join('. ')
}
