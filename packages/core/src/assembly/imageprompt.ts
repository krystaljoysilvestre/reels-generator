// Server-side prompt assembly. The LLM writes content; the system owns style and the canonical look
// of recurring entities. The LLM never sees or modifies the style preset, and never re-describes a
// bible entity — those are spliced here, byte-identically, so they can't paraphrase-drift across the
// independently-generated scene images (see specs/story-bible.md).

import type { StoryBible } from '../types/story-bible.js'
import { resolveEntities, slug } from './story-bible.js'

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
): string {
  const style = stylePreset.trim()
  const content = contentPrompt.trim()

  // No bible → unchanged: lead with style DNA, then the scene content (legacy callers, previews, etc.).
  if (!expansion) return `${style}, ${content}`

  const { bible, primaryEntity, supportingEntities } = expansion
  const { narratorPerspective, narratorEntityId } = bible.continuity
  const { resolved } = resolveEntities(bible, { primaryEntity, supportingEntities })

  const specs = resolved
    // Perspective-aware narrator suppression: in a first-person reel the narrator is never rendered as
    // a separate figure (a hard scenes.v1 rule; image-QA rejects full-body POV), so we do NOT splice
    // their canonical full description — the scene's action prose carries the POV.
    .filter((e) => !(narratorPerspective === 'first_person' && narratorEntityId && slug(e.id) === slug(narratorEntityId)))
    .map((e) => e.description)

  // Style first (convention: style DNA frames how the scene reads), then the frozen entity specs in
  // role order (primary leads → satisfies VISUAL PRIORITY mechanically), then the scene's action prose.
  // Sentence-level join only — no grammar weaving; each canonical string stays a verbatim clause.
  const parts = [style, ...specs, content].map((p) => p.trim().replace(/[.,\s]+$/, '')).filter(Boolean)
  return parts.join('. ')
}

export function assembleNegativePrompt(
  opts?: { genreCategory?: string; channelNegativeTerms?: string },
): string {
  // gpt-image-1 has no negative_prompt field — these are folded into the prompt as an "Avoid:" clause.
  // Keep the list SHORT and intentional: a long avoid-list dilutes the real prompt and can ironically
  // surface the negated nouns. We drop the whole flux-era artifact/anatomy/quality-floor/double-door
  // catalog (those were flux failure modes; gpt-image-1 doesn't make them) and keep only what genuinely
  // helps: a watermark guard plus the content guards.
  // NOTE: we intentionally do NOT suppress 'text'/'caption'/'subtitles' here. That guard kept stray
  // captions out of scene art, but it also blocked INTENTIONAL diegetic text — a phone message, a sign,
  // a note — which some scenes need rendered in-frame. Leaving text un-suppressed lets those render.
  const defaults = ['watermark']
  // Content guards. Suppressing gore/violence/nudity is right for most niches, but on a HORROR channel the
  // gore/violence guards fight the genre — they neuter exactly the dread/menace the look is built for, so
  // every reshoot comes back tame. Horror channels drop those two. 'nudity' STAYS for everyone: it adds
  // nothing to dread, and dropping it risks unclothed figures (a platform-ban risk).
  // OpenAI's own moderation still backstops true NSFW at generation time.
  const contentGuards = opts?.genreCategory === 'horror' ? ['nudity'] : ['gore', 'graphic violence', 'nudity']
  const channel = opts?.channelNegativeTerms ? opts.channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...contentGuards, ...channel].join(', ')
}
