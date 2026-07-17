import { z } from 'zod'

// ── Post metadata (reels.postMeta) ────────────────────────────────────────────
// The publish-facing package for one reel: platform title, hook, caption, hashtags. Written by the
// generate_post_meta pipeline step (LLM proposes, anchored to the finished story), fully
// operator-editable afterwards. Consumed by the export post-package and the publish UI.

export const PostMetaSchema = z.object({
  v: z.literal(1),
  // Platform title — what shows as the video title (YouTube) / bold first line (FB). Short, no clickbait-cap abuse.
  title: z.string().min(1).max(120),
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
