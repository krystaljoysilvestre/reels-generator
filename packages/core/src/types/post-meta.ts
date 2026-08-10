import { z } from 'zod'

// ── Post metadata (reels.postMeta) ────────────────────────────────────────────
// The publish-facing package for one reel: platform title, hook, caption, hashtags. Written by the
// generate_post_meta pipeline step (LLM proposes, anchored to the finished story), fully
// operator-editable afterwards. Consumed by the export post-package and the publish UI.

export const PostMetaSchema = z.object({
  v: z.literal(1),
  // Platform title — what shows as the video title (YouTube) / bold first line (FB). Short, no clickbait-cap abuse.
  title: z.string().min(1).max(120),
  // THUMBNAIL OVERLAY — the 3–5 words burned onto the thumbnail image. A SEPARATE field from `title`
  // on purpose: the publish-bar audit (2026-08-10) named thumbnails as a reason no reel was ever posted,
  // and the cause was conceptual — the composition burned the WHOLE title onto the image. Creators put a
  // few huge words on the thumbnail and let the title say something else; the two are halves of one
  // package, not the same sentence twice.
  // The rule is ADD, COMPRESS or AMPLIFY — never merely duplicate. Overlapping one load-bearing phrase
  // is often the point ("ONE SECOND" under "What If Earth Stopped Spinning for One Second?"); repeating
  // the whole title is the failure. Empty = fall back to the title, so old reels still render.
  // Punctuation is stripped rather than requested. The prompt already says "no punctuation, no full
  // sentences" and the first live run came back with "AI Takes Over?" — a question mark in half-metre type.
  // That is this repo's oldest recorded lesson about soft guidance: it gets satisficed, and the only things
  // that hold are the mechanisms. Terminal punctuation and quotes carry no meaning at thumbnail scale, so
  // normalizing here means no route, no LLM path and no hand-written jsonb can persist them. Internal
  // hyphens and apostrophes are kept — "Crypto's" and "9-to-5" are words, not punctuation.
  thumbnailText: z
    .string()
    .max(60)
    .default('')
    .transform((t) => t.replace(/["“”]+/g, '').replace(/[.,!?;:—–]+/g, '').replace(/\s+/g, ' ').trim()),
  // The one-line hook a viewer reads before deciding to watch — the caption's opening line.
  hook: z.string().max(200).default(''),
  // Caption body (no hashtags — they live separately so platforms that want them inline vs first-comment can differ).
  caption: z.string().max(2200).default(''),
  // Hashtags including '#'. A ceiling, not a quota — however many genuinely fit this niche + language.
  hashtags: z.array(z.string().min(2).max(60)).max(8).default([]),
  language: z.string().default(''),
})
export type PostMeta = z.infer<typeof PostMetaSchema>

// Render the pieces into one paste-ready caption text (export zip + copy button).
export function formatPostCaption(meta: PostMeta): string {
  const parts = [meta.hook, meta.caption, meta.hashtags.join(' ')]
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.join('\n\n')
}

// ── Manually-logged performance (reels.metrics) ───────────────────────────────
// Phase 1: the operator pastes platform numbers after posting. Feeds stories.performanceScore
// (channel-relative, see record-metrics), which weights few-shot reference selection.

export const ReelMetricsSchema = z.object({
  views: z.number().int().min(0),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
  recordedAt: z.string(), // ISO timestamp of when these numbers were captured
})
export type ReelMetrics = z.infer<typeof ReelMetricsSchema>

// ── Channel-relative performance scoring ──────────────────────────────────────
// One implementation shared by the manual log route (record-metrics) and the YouTube stats poller,
// so a story's score means the same thing no matter how the views arrived.
//
// Log scale relative to the channel's own best: 10k and 100k views both score high, a dud lands near
// zero, and a small channel isn't judged against a big channel's numbers.

export const PERFORMANCE_PROMOTION_MIN_SCORE = 70 // stories at/above become few-shot references
export const PERFORMANCE_PROMOTION_MIN_LOGGED = 3 // cold-start guard: no promotion until the channel has a real comparison set

export function scorePerformance(rows: Array<{ storyId: string; views: number }>): Map<string, number> {
  const maxViews = Math.max(...rows.map((r) => r.views), 0)
  const scores = new Map<string, number>()
  if (maxViews <= 0) return scores
  for (const r of rows) {
    scores.set(r.storyId, Math.round((Math.log1p(r.views) / Math.log1p(maxViews)) * 100))
  }
  return scores
}

/**
 * The words to burn on the thumbnail. Falls back to the title so reels written before `thumbnailText`
 * existed still render exactly as they did — the field is additive, never a hard requirement.
 */
export function thumbnailOverlay(meta: Pick<PostMeta, 'title' | 'thumbnailText'>): string {
  return meta.thumbnailText.trim() || meta.title.trim()
}

/**
 * Does the overlay merely duplicate the whole title? The check behind the "add, compress or amplify"
 * rule — deliberately NOT a shared-words test, which would reject the strongest packaging there is
 * (compressing a title down to its load-bearing phrase). Only whole-title duplication is the defect.
 */
export function thumbnailDuplicatesTitle(meta: Pick<PostMeta, 'title' | 'thumbnailText'>): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const overlay = norm(meta.thumbnailText)
  const title = norm(meta.title)
  if (!overlay) return false // empty falls back to the title by design; not a duplication defect
  // Exact, or the overlay is the title with only a trailing/leading fragment trimmed off.
  return overlay === title || (overlay.length > title.length * 0.8 && title.includes(overlay))
}
