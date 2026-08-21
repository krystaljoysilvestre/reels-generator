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
  appearanceByEntity?: Record<string, string>
}

// The channel's cast nationality/ethnicity. Image models otherwise free-fill a generic (usually Western)
// look, which reads wrong for a localized channel (a Filipino-language reel rendering red-haired leads).
// Keyed off the channel's PRIMARY language; falls back to region keywords; empty when neither is confident —
// we omit rather than guess (English/Spanish/Arabic span many nationalities). See castNationality().
const LANGUAGE_NATIONALITY: Record<string, string> = {
  tagalog: 'Filipino', filipino: 'Filipino', taglish: 'Filipino', cebuano: 'Filipino', bisaya: 'Filipino', ilocano: 'Filipino', hiligaynon: 'Filipino',
  korean: 'Korean', japanese: 'Japanese', vietnamese: 'Vietnamese', thai: 'Thai',
  indonesian: 'Indonesian', malay: 'Malaysian', hindi: 'Indian', tamil: 'Indian',
  chinese: 'Chinese', mandarin: 'Chinese', cantonese: 'Chinese', turkish: 'Turkish',
  greek: 'Greek', vietnamese_north: 'Vietnamese',
}
const REGION_NATIONALITY: [RegExp, string][] = [
  [/philippine|filipino|manila|luzon|visayas|mindanao|cebu|davao/i, 'Filipino'],
  [/korea/i, 'Korean'], [/japan/i, 'Japanese'], [/viet\s?nam/i, 'Vietnamese'],
  [/thai|thailand/i, 'Thai'], [/indonesia/i, 'Indonesian'], [/\bindia\b/i, 'Indian'],
  [/china|chinese/i, 'Chinese'],
]
// Resolve the cast nationality for a channel. `languages` = channel.languages (primary = [0]); `region` =
// channel.worldBible.region (a fallback signal). Returns '' when neither maps confidently.
export function castNationality(languages?: string[] | null, region?: string | null): string {
  const primary = (languages?.[0] ?? '').toLowerCase().trim()
  if (LANGUAGE_NATIONALITY[primary]) return LANGUAGE_NATIONALITY[primary]!
  const r = region ?? ''
  for (const [re, nat] of REGION_NATIONALITY) if (re.test(r)) return nat
  return ''
}

// RECONSTRUCTION FRAMING — the depictive-ethics floor's condition for depicting a long-dead historical
// figure at all (the depictive-fidelity CARE tier). A sourced portrait plate bypasses REFERENCE_FRAMING entirely
// (the photograph IS the plate), so the framing has to ride on the SCENE prompt instead, on every beat that
// conditions on such a plate. Written positively, per DESCRIBE PRESENCE, NOT ABSENCE.
//
// This governs what the frame CLAIMS, not whether it is accurate: no render, in any style, may be presented
// as an authentic photographic record of a real event. The burned disclosure label says the same thing to
// the viewer; this says it to the model.
export const RECONSTRUCTION_FRAMING =
  'a historical reconstruction — a dramatised depiction of a documented past scene, painterly and clearly a reconstruction rather than an authentic archival photograph of a real event'

export function assembleImagePrompt(
  contentPrompt: string,
  stylePreset: string,
  expansion?: EntityExpansion,
  lighting?: string, // reel-level time-of-day directive (see reelLightingDirective) — forces night/dark, etc.
  cast?: string, // channel cast nationality (see castNationality); '' / undefined → no ethnicity directive
  reconstruction?: boolean, // this scene conditions on a real historical person's plate → append the framing
): string {
  const style = stylePreset.trim()
  const content = contentPrompt.trim()
  const light = lighting?.trim()
  // Constrain ethnicity for whoever appears WITHOUT forcing a person into a people-free shot ("any people").
  const castClause = cast?.trim() ? `any people in frame are ${cast.trim()}` : ''

  const reconstructionClause = reconstruction ? RECONSTRUCTION_FRAMING : ''

  // No bible → unchanged: lead with style DNA, then the scene content (legacy callers, previews, etc.).
  // Lighting, when present, is appended as its own clause (keeps the legacy "style, content" form intact).
  if (!expansion) {
    const parts = [`${style}, ${content}`, castClause, light ?? '', reconstructionClause].map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean)
    return parts.join('. ')
  }

  const { bible, primaryEntity, supportingEntities, appearanceByEntity } = expansion
  // Scene entities in splice order, narrator suppression + depictability applied (see sceneEntities). When
  // the scene's image is reference-conditioned (the entity has a plate), the references carry the look — but
  // we still splice the descriptions: they're the channel's narration-language facts that the reference
  // can't encode (which light source is active, etc.), and they keep the text-only fallback identical.
  const specs = sceneEntities(bible, {
    primaryEntity,
    supportingEntities,
    ...(appearanceByEntity ? { appearanceByEntity } : {}),
  }).map((e) => e.description)

  // Style first (convention: style DNA frames how the scene reads), then the cast ethnicity directive (so it
  // frames every person), then the frozen entity specs in role order (primary leads → satisfies VISUAL
  // PRIORITY mechanically), then the scene's action prose, then the reel-level lighting directive last.
  const parts = [style, castClause, ...specs, content, light ?? '', reconstructionClause].map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean)
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
export function assembleReferencePrompt(entity: BibleEntity, stylePreset: string, lighting?: string, cast?: string): string {
  const light = entity.kind === 'character' ? undefined : lighting?.trim()
  // Lock the cast nationality into the CHARACTER plate itself — every scene conditions on this plate, so if
  // the plate isn't the right ethnicity nothing downstream will be. Only characters (locations/objects have no people).
  const castClause = entity.kind === 'character' && cast?.trim() ? `the person is ${cast.trim()}` : ''
  const parts = [stylePreset, castClause, entity.description, REFERENCE_FRAMING[entity.kind], PLATE_NO_TEXT, light ?? '']
  return parts.map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean).join('. ')
}
