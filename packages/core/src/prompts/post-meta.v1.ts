// post-meta.v1 — the publish package for one reel: platform title, hook, caption, hashtags.
// LLM proposes (it knows the story + the channel), the operator can edit, the export consumes.
//
// Unbiased by design: genre, language, and platform arrive as CONTEXT the model reasons from —
// no hardcoded hashtag lists, no per-genre caption formula, no baked-in audience culture. The
// only hard constraints are shape (schema) and honesty (no bait the story doesn't pay off).

import type { z } from 'zod'
import { PostMetaSchema } from '../types/post-meta.js'

export const POST_META_V1_VERSION = 'post-meta.v1.1'

// The model emits the meta WITHOUT the version discriminator; the caller stamps `v: 1`.
export const PostMetaLlmSchema = PostMetaSchema.omit({ v: true, language: true })
export type PostMetaLlm = z.infer<typeof PostMetaLlmSchema>

export interface PostMetaVars {
  channelName: string
  nicheDescription: string
  language: string
  platforms: string[] // e.g. ['fb','yt'] — where this will be posted
  genreCategory?: string | undefined // context only, never a formula
  title: string // the story's working title
  logline: string
  narration: string // full narration — the caption must be true to it
  // Runtime of the finished video. Context, not a formula: a 45-second vertical post and a 9-minute
  // one are read in different places by differently-committed viewers, and the model should judge the
  // packaging from that rather than from a hardcoded per-length template. Absent → unstated.
  targetSeconds?: number | undefined
}

export function buildPostMetaPrompt(v: PostMetaVars): { system: string; userMessage: string } {
  const runtimeLine = v.targetSeconds
    ? `\n\nRUNTIME: about ${v.targetSeconds < 90 ? `${v.targetSeconds} seconds` : `${Math.round(v.targetSeconds / 60)} minutes`}. Let that inform how much the package has to carry — a viewer choosing a longer watch is deciding differently than a viewer mid-scroll — but judge what this story and audience need; there is no per-length template.`
    : ''
  const system = `You package finished videos for posting. For the channel "${v.channelName}" (${v.nicheDescription}), you write the title, hook, caption, and hashtags a viewer sees BEFORE deciding to watch.${runtimeLine}

You are given the finished story. Your job is to earn the click honestly — the best packaging makes the story's own strongest tension visible, it never promises something the video doesn't deliver.

LANGUAGE: write the way real accounts in this niche actually post for a ${v.language}-speaking audience — that may be the narration's language, the platform's lingua franca, or a natural mix; you judge what a real post looks like for THIS audience. Never translate word-for-word.

PLATFORMS: ${v.platforms.join(', ')}. One package serves all of them, so favor what works everywhere (a strong first line, a short scannable caption) over any single platform's trick.

FIELDS
- title: the video's title (YouTube title / bold opening on other platforms). Short and specific to THIS story. No clickbait caps, no emoji spam — intrigue comes from the story, not punctuation.
- hook: the single line a scroller reads first. The story's sharpest question or tension, in the audience's own register. May be empty if the title already IS the hook.
- caption: the post body under the hook. Set the scene or deepen the pull, never summarize the ending or spoil the turn. Length is yours to judge from the runtime and where this gets read — a scroller wants a line or two, a longer watch can support a fuller note. May be empty if the hook says it all.
- hashtags: up to 8, with '#'. Choose what real posts in this niche + language actually use — a mix of niche-specific and discovery tags, in whatever language(s) the audience searches. Fewer is fine; use only tags that genuinely fit this story and channel. Never invent a tag that looks like another channel's brand.

Return ONLY JSON: {"title": "...", "hook": "...", "caption": "...", "hashtags": ["#...", ...]}`

  const userMessage = `STORY TITLE: ${v.title}
LOGLINE: ${v.logline || '(none)'}

FULL NARRATION:
${v.narration}`

  return { system, userMessage }
}
