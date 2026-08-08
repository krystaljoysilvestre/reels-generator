// Genre resolution — the ONE seam every consumer reads genre through (specs/channel-series.md).
//
// Genre used to be a channel-wide constant. With series (the Editorial Program dimension), one channel
// legitimately spans genres: a folklore channel's "Mythical Creatures" wants horror's dread while its
// "Hidden Places" wants a travel register. That makes genre a per-REEL fact, and genre is load-bearing —
// it picks the writer identity, the mechanics library, the element palette, the gate's default rubric,
// the scene-prompt module, the image engine, the outro tail, and it feeds step CACHE KEYS.
//
// Because of that last one especially, resolution is split into two functions on purpose. Do not merge
// them into one "smart" resolver that consults the series on every read:
//
//   resolveGenreForNewReel()  runs ONCE, at reel creation, and its result is written to the reel.
//   effectiveGenre()          runs everywhere after, and only ever reads what was already frozen.
//
// A channel's genre can be corrected in settings and a channel's series are re-derived by a
// non-deterministic LLM call. If downstream stages re-resolved through the series, a finished reel could
// be re-judged, re-rendered and re-cache-keyed under a genre it was never made with. Freezing is what
// buys reproducibility, since the compiler upstream cannot.
//
// The pattern mirrors resolvePlatformPreset() (types/channel.ts): consumers never index the underlying
// columns directly, so a future change to how genre is decided lands in one place.

/** The series' own genre if it has an opinion, else the channel's. Call ONLY at reel creation. */
export function resolveGenreForNewReel(
  series: { genreCategory?: string | null | undefined } | null | undefined,
  channel: { genreCategory?: string | null | undefined },
): string {
  // NULL on a series means "no opinion", never "copy the channel's" — the value is resolved here rather
  // than duplicated onto the series row, so correcting the channel's genre later fixes neutral series
  // automatically instead of leaving them holding a stale copy.
  return series?.genreCategory?.trim() || channel.genreCategory?.trim() || 'general'
}

/**
 * The genre a reel actually ran under. Every pipeline stage, prompt builder and cache key reads this.
 * Falls back to the channel only for reels created before series existed (genreCategory IS NULL).
 * Deliberately does NOT accept a series — nothing downstream of creation may re-consult it.
 */
export function effectiveGenre(
  reel: { genreCategory?: string | null | undefined } | null | undefined,
  channel: { genreCategory?: string | null | undefined },
): string {
  return reel?.genreCategory?.trim() || channel.genreCategory?.trim() || 'general'
}
