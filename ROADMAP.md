# Roadmap

Living backlog for the operator app. Vision: an AI pipeline that turns a niche
description into publish-ready videos; we run it ourselves first on our own
Filipino-horror channel(s) (Shorts/Reels for reach, long-form YouTube
compilations for RPM, brand deals at scale), and productize as SaaS only after a
channel proves traction.

Model today: **one operator, multiple channels.** Dashboard = the operator's
channel portfolio.

---

## Done

- **UI redesign** — modern design system (Stripe/Linear/Apple/Notion peg);
  primitives in `apps/web/src/app/globals.css`, tokens in `tailwind.config.ts`.
- **Portfolio dashboard** — `/dashboard` lists channels (empty state +
  Create-channel button); per-channel reel/published counts.
- **Channel creation flow** — `/channel/new`, a 4-step wizard, AI-assisted:
  **(1) Describe** — name + niche + language + target platform → Claude derives the
  creative bible (tone, visual DNA, world bible, captions, `voiceSearchKeyword`).
  **(2) Sample script** *(optional)* — write/generate one short example narration.
  **(3) Narrator voice** — pick the channel's voice (recommended by niche + genre).
  **(4) Visual style** — pick a look → channel is created.
  (`channel.v1` prompt; `/api/channel/derive` + `/api/channel/create`.)
  - Optional **channel avatar** (R2 upload) and **preset niches** (curated
    trending short-form niches that seed the description) in step 1. Niche
    presets use colored, outlined icons.
  - **Genre-neutral, no horror bias**: tone is modeled as genre-agnostic axes —
    `intensity / warmth / energy / pacing / humor` (replacing the old horror-specific
    `suspense / dread / gore`), so a kids/finance/space channel scores meaningfully
    (e.g. high warmth + humor) instead of always-zero dread/gore. Step-1 placeholders
    and copy are neutral (no "Aswang Files" example) and the preset grid no longer
    leads with Horror. (`gore`/`violence` remain only as image **safety negatives**.)
  - **One language per channel**, picked from a fixed **dropdown** of
    pipeline-supported languages (`languages.ts`) — no free text. Want another
    language → make another channel. (Stored as a 1-element array.) Claude writes
    the language, ElevenLabs narrates it; ~30 languages offered.
  - **Sample script (step 2, optional)** — an editable narration the operator
    writes by hand (preferred) or seeds with a "Generate draft" (`channel-sample.v1`;
    `/api/channel/sample-script`). The draft is a **complete, coherent piece sized to
    the channel's reel length** with a **niche-adaptive arc** (narrative: hook→build→
    recontextualizing turn; informational: hook→points→payoff; persuasive: hook→idea→
    close), in spoken beat-per-line cadence, with Taglish code-switch — no forced horror
    twist. It drives the step-4 preview scene and is saved as the channel's **first
    reference story** (`is_reference=true`, `source` user/ai) so the few-shot selector
    has a seed example from day one.
  - **Per-channel reel length** — `channel.v1` derives `targetSeconds` (15–180) per
    niche (quick informational ~20–40s, atmospheric/narrative ~75–120s), applied
    automatically (no Step-2 control — the suggested length is used; a custom script of
    any length is handled as-is). Stored on the channel (`channels.target_seconds`) and
    **honored end-to-end**: the generated sample mirrors it, `generate-story` uses it
    instead of a hardcoded 75s, and scene breakdown scales (`~1 scene / 12s`, clamped
    3–16) so short and long reels both render sensibly. Shown on the detail page. The
    sample script has no tight character limit (a generous 20k server ceiling only).
  - **Target platform** (Step 1) — TikTok / YouTube Shorts / Facebook Reels / All,
    stored on the channel (`channels.target_platform`). A single `PLATFORM_PRESETS`
    table (in core) is the source of truth: per-platform aspect (all 9:16), **length
    cap**, sweet-spot, caption + hook hints, **caption safe-zone**, and **watermark**
    default. Today it feeds `channel.v1` (length + caption tailored to the platform) and
    **hard-caps length** on create/edit (e.g. Shorts ≤60s — verified: same niche →
    TikTok 90s, Shorts 55s, All 55s; a 150s Shorts channel is clamped to 60). Editable
    in Settings (length slider max tracks the platform) and shown on the detail page.
    **Caption safe-zone is deterministic now**: the platform's `safeZoneBottomPct` offsets
    the caption band so it clears each platform's UI — applied in the live `CaptionPreview`
    (verified: Reels sits higher than Shorts) and threaded through the Remotion renderer
    (`SubtitleOverlay`) for the video phase. **Aspect ratio is real now too**: the platform
    aspect (all 9:16) drives image generation — `generateImage` was hardcoded to 3:4
    (`portrait_4_3`), now maps the preset aspect → fal `image_size` (verified: previews
    generate 576×1024 = 9:16), the real reel's `generate-images` passes the channel's
    platform aspect, and **Step-4 style tiles render 9:16** so they match the actual frame.
    **Hook style is applied at Step 2 now**: the platform's `hookHint` shapes the sample/
    reference script's opening (verified — same niche yields a pattern-interrupt hook for
    TikTok, a curiosity-promise for Shorts, a relatable opener for Reels); it'll feed real
    story-gen from the same source when that's built. The Step-1 picker uses the platforms'
    **actual brand logos** (shared `PlatformPicker`, used by wizard + Settings). Still
    **captured-but-not-applied**: **watermark** (render) — lights up in the video phase.
    (Caption *preset* remains a soft AI hint, niche-dominated — not a hard platform rule.)
  - **Per-channel caption style** — competitive, *animated* burned-in captions (the kind
    that win on TikTok/Reels/Shorts), not plain subtitles. **16 expressive presets**, each
    with a signature motion: **pop** (word-by-word scale), **hype** (Hormozi highlight-box),
    **karaoke** (progressive fill), **neon** (glow), **whisper** (eerie typewriter+cursor),
    **impact** (oversized punch-in + tilt), **elegant** (wide-tracked italic serif fade),
    **clean** (refined white), **comic** (tilted playful pop), **terminal** (green monospace
    on a panel), **cinematic** (Netflix subtitle bar), **breaking** (solid news lower-third),
    **marker** (highlighter swipe), **script** (handwritten cursive), **retro** (chrome/
    synthwave gradient + glow), **glitch** (RGB-split datamosh) — plus `backplate`
    (translucent/solid panel) and `gradient` (clipped text fill) style fields.
    **Hybrid derivation:** `channel.v1` picks the preset **per
    niche energy** (horror→whisper, money→hype, gaming→neon, luxury→elegant, …) *and* nudges
    a few **safe, clamped knobs** on top — accent **highlight color**, **base text color**
    (near-white unless the niche calls for a tint), **placement** (bottom/center/top), and a
    bounded **font scale** (0.85–1.25). The preset's signature motion/font/stroke stay fixed
    so the look can't break; `resolveCaptionStyle()` merges the knobs and the zod schema
    clamps anything out of range. (Switching presets in the wizard keeps the channel's brand
    palette but resets motion/size/placement to that preset's identity.)
    The `CaptionStyle` spec (animation, font/weight/size, color/activeColor/highlight,
    stroke, shadow|glow, letter-spacing, uppercase/italic, rotation, position) is stored on
    the channel (`channels.caption_style`) and read by the **Remotion** `SubtitleOverlay`,
    which animates word-by-word from the per-word timings preserved through `compute-timings`.
    A shared **`CaptionPreview`** client component plays the style **live, looping, on a dark
    "video-frame" stage** — so the wizard Step-4 picker and the channel detail page show
    captions exactly as they'll appear in the reel. (Full per-field editing is deferred to
    Settings; the renderer path is typecheck-verified — the reel pipeline hasn't run E2E yet.)
  - Optional channel **description** (shown on card/header), **default gradient
    avatar** monogram when no image, custom animated **Dropdown** (language +
    voice gender), smooth animations + responsive widths.
  - **Visual style (step 4)** — `style-options.v1` proposes a content-safe scene + **4–5
    recognizable styles** from a known palette, **curated on merit** from niche + **mood**
    (no realism bias — horror surfaces creepy comic / manga / woodcut; a niche that suits
    photoreal can still get it), each tuned with a "why it fits". Previews **auto-render in
    parallel on flux/dev** (~8¢, ≈40¢/channel) and are **prefetched in the background when
    leaving Step 2**, so Step 4 is ready on arrival. Shown as a **compact grid** of tiles
    (image + label; selected ringed, first badged Recommended; the selected style's "why it
    fits" below) with a blur→sharp develop-in reveal, shimmer while rendering, and a graceful
    "couldn't preview" placeholder. No re-roll buttons (cost).
  - **Upload your own reference (step 4)** — the operator can upload **1–3 reference images**;
    a **vision pass** (`style-ref.v1`, `/api/channel/style-ref`) distills their shared *style*
    into the channel's DNA (medium/lighting/palette/texture/mood — not the subjects), added as a
    pickable **"Uploaded"** tile and auto-selected. The first image is kept as `styleImageKey`,
    the derived DNA as `stylePreset` — so it flows through the text-to-image pipeline with no
    downstream change. (True image-conditioned generation is a deferred upgrade.)
  - The chosen style's DNA is saved as `stylePreset` and its image as `styleImageKey`. A slim recap (avatar/name/language) sits atop steps 2–4; tone /
    world / positioning are still generated + stored, hidden at creation (editable
    later in Settings).
  - **Draft persistence**: the whole wizard (all 4 steps, incl. generated profile,
    sample script, voices, avatar, style proposals + selection + resolved previews)
    is saved to `localStorage` and rehydrated on reload; cleared on successful
    create. Survives reloads and leaving the page.
  - **Real voice picker (Step 3)** — **radio** choice: *one voice* vs *different voice per
    story*; the voice list stays hidden until "one voice" is picked. One-voice shows
    Claude-**recommended** voices for the niche/language/tone (`/api/voices/recommend`),
    read-only metadata + instant preview + "show all" fallback, top auto-selected. Per-story
    stores no voice (chosen per reel at render). Default channel language is **English**.
    **Language → ElevenLabs voices:** English uses premade voices;
    other languages pull from the shared library by code (Tagalog/Taglish →
    `fil`, etc.) so e.g. a Taglish channel sees real Filipino voices.
    Recommendation pool is filtered: **narration** use-case, **popularity** sort,
    and a **genre keyword** (`voiceSearchKeyword` from derivation, e.g. "horror")
    via the library `search`. A **gender** chip filters the shown list.
    (Listing + previews are free; only render-time TTS costs characters.)
- **Design conventions** captured in `DESIGN.md` (root): always animate, always
  responsive, primitives-first, custom controls, outlined icons, light theme.
- **Channel detail page (`/channel/[id]`)** — read-only overview: header,
  stat row, niche, tone bars, visual style (the chosen **style image** when one
  was previewed, above the DNA text), story world, narrator voices (real, with
  voice-mode badge), and a reels section (empty state). Portfolio cards open it.

## Next steps

1. ✅ **Channel settings / edit** (done) — `/channel/[id]/settings` makes the
   derived bible editable post-creation: identity (name/description/tagline),
   niche, tone (sliders), reel length, **captions** (live preview + all 16
   presets), visual-style DNA, and the full world bible (region/era/locations/
   objects/vocabulary). `PATCH /api/channel/[id]` validates with the same zod
   schemas as creation. Settings button on the detail page now links here.
   *Still deferred:* editing voices, avatar, language, and the not-yet-real
   config (LUT, audio packs, posting rules).
   Also fixed alongside: the **voice-id shape bug** (storyboard read a
   non-existent `id`/`style`; now uses `providerId`/`description`, so a chosen
   voice actually reaches render) + a render-time guard so an empty voice can't
   silently crash TTS; and **`tagline` + `voiceSearchKeyword` are now persisted**
   on the channel (were derived then discarded).

2. **Per-channel workspace** — fold the old `/review` and `/storyboard/[id]`
   views into the channel detail page (reels, review queue, analytics tabs).
   They're currently unreachable from nav.

3. **Per-story voice selection** — channel voice picking is done (real voices,
   single or per-story shortlist). When the reel flow is built, a `per_story`
   channel should let the operator pick one voice from its shortlist per reel;
   a `single` channel just inherits its one voice.

4. **Derivation prompt tuning** — iterate on `channel.v1` if the generated
   tone/style/world doesn't match what we imagine for a given niche.

5. **Align reel rendering to the chosen style** — Step-4 previews render on **flux/dev** for
   faithful stylization; the worker reel pipeline (`generate-images`) still uses **flux/schnell**
   (cheaper, but collapses non-photoreal styles toward realism). Before producing reels for real,
   decide the per-image model/quality so produced reels match the style the operator picked at
   creation (flux/dev everywhere, or a per-channel quality tier). `assembleImagePrompt` already
   leads with the style DNA, so only the model/guidance differs.

6. **De-bias `channel.v1` style derivation (optional)** — Step-4 curation no longer uses the derived
   `stylePreset` (it picks mediums on merit from niche + mood). But `channel.v1` still derives a
   film/photographic `stylePreset` ("film stock/medium … analog photography aesthetic"), now used only
   as the pre-Step-4 default + fallback if style-options fails. If that fallback ever matters, broaden
   `channel.v1` so the default look isn't reflexively cinematic either.

7. **Length follow-ups** — the `$8` short-reel budget cap (`DEFAULT_BUDGET_CAPS_CENTS.short`) is flat;
   a ~180s reel (more scenes + more TTS) should scale the cap so long-form channels don't false-fail.
   Also two still-horror-flavored bits to de-bias when generalizing the writing pipeline:
   `scenes.v1` guards ("no faces of fear", "children in threatening contexts") and the hardcoded
   `audienceDescriptor: 'young Filipino adult'` in `generate-story`.

### Deferred config (currently schema defaults at creation)

- `lutConfig` / `audioPacks` — need real asset files (LUTs, ambient beds, music
  pack); configure later in channel settings.
- `postingRules` — defaults to fb+yt, 21:00 PHT, no quality filter.

### Known gaps / cleanup

- **Provider resilience (all external APIs):** each call has a per-request
  timeout + auto-retry on transient failures (connection/429/5xx):
  Anthropic (60s, 1 retry), ElevenLabs (30s metadata / 120s TTS / 60s SFX,
  1 retry), R2/S3 (maxAttempts 3 + 5s/60s timeouts), fal asset download (60s,
  1 retry). **fal image/video generation is intentionally NOT auto-retried** —
  resubmitting a paid job risks double-charging; it keeps its existing
  rate-limit/content-filter handling. Wizard shows a "couldn't reach the AI —
  try again" message on final failure.
- **Shared-library voices at render:** non-English channels select community
  (shared) voices. ElevenLabs TTS may require *adding* a shared voice to the
  account before synthesis — wire that into the render step (the stored
  `providerId` is the shared `voice_id`).
- Multilingual is now unblocked end-to-end: per-reel story types (`story.ts`,
  `story.v1`, worker `dispatcher`/`generate-story`) accept any supported
  language; Taglish keeps its code-switch special-case (case-insensitive).
  Still TODO when reels run for real: normalize channel language casing
  ("Tagalog" → "tagalog") at the reel boundary, and verify ElevenLabs voice
  coverage per language.
- Avatar images can be orphaned in R2 if creation is abandoned (no cleanup job).
- No channel-name uniqueness check (fine for a single operator).

### Known gaps / cleanup

- Sidebar nav is portfolio-only now; per-channel nav (reels/review/analytics)
  moves into the channel detail page.
- ~~End-to-end reel production has never run start to finish~~ — **DONE**: first reel
  rendered 2026-06-19; channel-creation polish + flux/dev images + voice delivery + AI
  music shipped 2026-06-20.

## Audit backlog (2026-06-20) — fix AFTER channel creation
Pre-production audit (3 passes: channel creation, quality, robustness). Prioritized; pull as
evidence demands. **✅ Done 2026-06-20:** silent-failure surfacing + retry; `render_qa` hardening
(black-frame + silent-audio + unmeasured-loudness now fail); varied Ken Burns motion;
budget-exceeded fails fast (no wasted retries). Remaining items below are deliberately deferred
(scale / edge / big-bet / marginal-for-horror) — pull when real channels demand them.

### Robustness
- **[P1 — fixing now] Silent failure → no signal.** On permanent step failure the `pipeline_steps`
  row is marked failed but `reel.status` is NOT updated and nothing shows in the UI — the reel
  silently stalls (`harness.ts`, `dispatcher.ts`). Fix: mark `reel.status='failed'` on permanent
  BullMQ failure + a storyboard "failed" banner (step + error) + one-click retry
  (`/api/pipeline/retry-reel`).
- **[P2] 429 = hard fail** after 3 quick retries (5s exponential). No dedicated long backoff for
  rate limits (`ProviderRateLimitError` → BullMQ). Fine at low volume; revisit before batch.
- **[P2] Per-provider rate-limit queues defined but unused** — all steps run on the single PIPELINE
  queue (concurrency 2, 50/min). OK for low volume; split to FAL_IMAGE/TTS queues when scaling.
- **[✅ DONE] Budget-exceeded fails fast** — thrown as BullMQ `UnrecoverableError` (no wasted retries); reel marked failed + surfaced.
- **[P3] Wizard style-image previews fire ~4–5 in parallel un-throttled** — debounce/limit before heavy use.

### Quality ceiling (pull as niches demand)
- **[✅ DONE] render_qa hardened**: now also fails on black frames (`blackdetect`), near-silent audio
  (`volumedetect`), and unmeasured loudness (`packages/render/src/qa/render-qa.ts`).
- **[P2] No character/location consistency** across scenes (each regenerates independently). Low impact
  for atmospheric/silhouette channels; high for character-driven. Needs reference/identity conditioning.
- **[✅ motion DONE] Camera motion** now varies per scene (zoom in/out + occasional drift,
  `SceneClip.tsx`). Scene TRANSITIONS (hard cuts only) still TODO.
- **[✅ DONE] Unmeasured loudness now FAILS** render_qa (was a warning).
- **[✅ DONE] AI music is now PER-REEL, not per-channel.** `generate_music` composes one fresh original
  bed for each reel (seeded by the channel's `audioMood`, tilted by the story's mood, sized to the reel),
  replacing the fixed channel-bed pool — so no two reels share a backing track, and each is vetted in
  context at spot_check. Cost ~10¢/reel (vs ~30¢ once); ~8s added per render. The pooled approach can
  return later as an "economy" toggle (cheaper, consistent) for cost-sensitive SaaS tiers.
- **[future] Scored music** — arc-synced to `peakMoment` (rises/drops timed to the story beats), built
  on the per-reel `generate_music` foundation. The premium tier above today's flat per-reel bed.

### Channel creation
- **[P2] Derived genome goes stale on edit**: changing niche in Settings doesn't re-derive tone/style/
  voice-keyword/audioMood. Add a "Regenerate profile" action.
- **[P2] Hardcoded, should be per-niche**: ambient SFX pack (`province_night`), LUT grade, posting rules.
- **[P3] derive timeout can hang Step 1** (manual retry only) — add a client timeout + retry UX.
- **[P3] Validate `musicMode='ai'` has an `audioMood`** at create (else per-reel beds fall back to a
  generic niche/tone prompt instead of the channel's sonic DNA).
- **[P3] Some derived fields locked/hidden post-creation**: caption colors/position, audioMood.
