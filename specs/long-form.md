# Long-form video (YouTube 16:9, 5–10 min)

**Status: v1 built 2026-07-15.** Long-form is a fifth `targetPlatform` — `youtube_long` — chosen in
onboarding Step 1 next to the short-form platforms. Everything downstream keys off the platform
preset (aspect/dimensions) and off actual story duration (chaptering), so short-form reels are
byte-identical to before.

## What "long-form" means here

- **16:9, 1920×1080, 30fps** (all other platforms stay 9:16, 1080×1920).
- **Up to 600s (10 min), sweet spot 5–8 min.** The 10-min cap is not arbitrary: it keeps the
  narration (~1,500 words ≈ 9k chars) near the single-request comfort zone of ElevenLabs
  `multilingual_v2` (10k chars) — the TTS provider now chunks transparently above 9.5k chars, but
  one request is still the reliable fast path. Raising the cap later is a preset edit + listen-test,
  not a redesign.
- **Same pipeline, same steps.** No new pipeline stages; the existing steps scale by parameter.

## Design decisions

### 1. Format = platform preset (no new column, no migration)

`channels.target_platform` is a plain text column; `youtube_long` is a new enum member of
`TargetPlatformSchema` and a new `PLATFORM_PRESETS` entry. `PlatformPreset.aspect` is widened from
the `'9:16'` literal to `'9:16' | '16:9'`, and presets gain `width`/`height` — the single source the
renderer, ffmpeg literals, and image/video providers now read. Rejected: a separate
`videoFormat` column (a second axis that can contradict the platform) and a standalone
`VideoFormat` object (an abstraction with one consumer — extract it later if a second format
appears, per the constitution's Extraction Rule).

### 2. Chaptering is duration-driven, not format-driven

The scenes schema hard-caps one breakdown call at 16 scenes, which is sound for ≤~250s of
narration. Stories with **estimated narration > 180s** are broken down **per chapter**:

- `planChapters()` (pure, in `packages/core/src/assembly/chapters.ts`) cuts the narration into
  chapters of ~120–180s **by offset**, preferring journey-leg boundaries (the world-state ground
  truth from `analyze_story`), falling back to sentence boundaries. Chapters tile the narration by
  construction.
- `breakdown_scenes` runs the existing prompt once per chapter (same best-of-3 QA loop), with a
  chapter-context block: story logline, chapter i-of-N, where the previous chapter left off (last
  location), and only the journey legs that overlap this chapter. The peak block goes only to the
  chapter containing the peak line.
- Scenes are stitched in order, re-idx'd globally, then global QA runs: full-narration tiling,
  cross-chapter location-label drift, total motion budget, peak placement.

This keys off duration, so a 3-min TikTok story gets the same treatment for free. ≤180s stories
take the single-call path — bitwise-unchanged behavior.

### 3. Motion (i2v) budget scales with duration

`MOTION_BUDGET` (3) becomes `motionBudgetForSeconds()`: 3 up to 180s, then ~1 clip per 90s capped
at 8 (600s → 7 clips ≈ $2.45 of Kling). Allocation across chapters is deterministic: 1 per chapter,
+1 to the opening chapter, +1 to the peak chapter, trimmed to the global budget. `scene-qa` takes
the budget as a parameter (defaults to 3 — legacy callers unchanged).

### 4. Music stays ONE bed (owner decision 2026-07-01), looped past 5 min

Eleven Music caps a generation at 300s. Multi-bed crossfades were already tried and rejected
(key/tempo lurch risk — see music-prompt.ts). So: the bed stays a single generation (≤300s); when
the reel outruns it, the mixer's existing `aloop` covers the tail, and the music prompt switches to
a **loop-aware arc** (evolving texture that resolves back to its opening, no single terminal peak —
the mixer's volume envelope owns the reel-level swell toward the actual climax). No new API calls,
no cost change.

### 5. TTS chunks transparently above 9.5k chars

`ElevenLabsTtsProvider.synthesize` splits the narration on whitespace boundaries into <9k-char
chunks whose concatenation is byte-identical to the original, synthesizes each, concatenates the
audio (ffmpeg), and offsets the per-chunk alignments. The M10 invariant (alignment 1:1 with
`Array.from(narration)`) is preserved; downstream steps see one voiceover, as today. Cost is
per-char, so unchanged.

### 6. Prompts get long-form structure, not a fork

`story.v1` and `scenes.v1` gain conditional blocks (active only when the target/chapter length
crosses the threshold): the story prompt asks for chaptered escalation with periodic re-hooks
(retention resets) instead of one 3-second hook; the scenes prompt receives the chapter context.
Genre stays entirely out of these blocks — pacing guidance only, per unbiased-design. The channel
derive prompt already reads the platform preset's `lengthHint`, so `youtube_long` channels derive a
long `targetSeconds` naturally; its schema ceiling widens 180 → 600.

### 7. Render + QA parameterized, not rewritten

- Remotion: composition registered at defaults; `renderMedia` overrides width/height/duration per
  render from the preset. Overlays already read `useVideoConfig()` — no component changes.
- The two raw `1080x1920` ffmpeg literals (render placeholder, compilation connective segment) read
  the preset dims.
- Kling i2v `aspect_ratio` is threaded from the preset (was a `'9:16'` string literal).
- `render_qa`'s 180s max-duration gate becomes a parameter derived from the platform cap (+ margin
  for the climax ring-out extension).
- Captions: no overlay change needed — `fontSizePx` is calibrated against the frame's minor
  dimension (1080), which is identical in 1080×1920 and 1920×1080, and every overlay already reads
  `useVideoConfig()`. The long-form preset's captionHint steers derivation toward restrained
  cinematic styles.

## Unit economics (600s / 10-min horror reel, estimates)

| Item | Basis | ≈Cost |
|---|---|---|
| Story best-of-6 + critic + analyze + breakdown (×5 chapters) + annotate | LLM calls | ~$0.60 |
| Scene images ~50 @ 4¢ (nano-banana) + plates + QA retries | `FAL_IMAGE_COST_CENTS` | ~$2.50 |
| i2v clips 7 × 5s @ 7¢/s | `FAL_VIDEO_COST_CENTS_PER_SEC` | ~$2.45 |
| TTS ~9k chars @ 30¢/1k | `TTS_COST_CENTS_PER_1K_CHARS` | ~$2.70 |
| Music 1 bed (300s) + SFX/foley | Eleven Music + SFX | ~$0.60 |
| **Total** | | **~$8–10** |

vs ~$2–3 for a 75s reel. Cost scales roughly linearly with duration; TTS is the new largest line —
worth revisiting the ElevenLabs tier before running long-form at volume. All calls remain
cost-accounted per reel through the existing `costCents` plumbing (nothing new to instrument).

## Deferred (explicitly out of v1)

- **>10 min videos** — needs a raised preset cap + listen-testing of looped beds at 2×+ loops.
- **Long-form publish packaging** — export-post-package copy is still reel-flavored
  (hashtags/cross-post checklist); YouTube long-form metadata (chapters/timestamps in description)
  is a natural follow-up and the chapter offsets already exist.
- **SFX density above the 18-cue schema cap** — the sound designer's restraint is the current
  bottleneck by design; revisit after a full listen of a rendered 10-min reel.
- **Per-reel format override** — format is per-channel identity for now.
- **Storyboard editor landscape polish** — the editor renders 16:9 media unletterboxed via its
  existing `adaptAspect` path; deeper layout work deferred until long-form is used in anger.
