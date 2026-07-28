# Roadmap

Living backlog for the operator app. Vision: an AI pipeline that turns a niche
description into publish-ready videos; we run it ourselves first on our own
Filipino-horror channel(s) (Shorts/Reels for reach, long-form YouTube
compilations for RPM, brand deals at scale), and productize as SaaS only after a
channel proves traction.

Model today: **one operator, multiple channels.** Dashboard = the operator's
channel portfolio.

This file is the **execution backlog**. The strategy layer — why work is
sequenced this way — lives in `dna/company/roadmap.md` (company DNA starts at
`dna/START-HERE.md`).

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
   *New evidence (2026-07-24 production run):* an all-scene-animated ~100s reel landed at **$7.60 —
   $0.40 under the cap**; one more scene would have stranded it mid-render (shipped steps hard-throw
   once `costCents` exceeds the cap, with no stills-fallback). Cap needs to be per-channel/reel
   configurable AND degrade gracefully (finish with stills) instead of failing terminally.

### Pipeline findings — 2026-07-24 "News Today PH" production run (one-off, $7.60, findings tracker)

A real factual Taglish news reel driven end-to-end surfaced these, ranked. Tackling one-by-one with
the owner (design first, then implementation). Full evidence in the session summary + hypothesis doc.

1. **Voiceover perspective missing** (owner-endorsed) — the pipeline knows only diegetic narrators
   (`first_person`/`third_person`), so a voiceover explainer got an invented on-screen host, POV
   shots, and a photoreal fake press photo of real officials; auto-breakdown unusable for the whole
   news/documentary/explainer family (incl. committed EBN documentary). Candidate architecture:
   [hypotheses/voiceover-perspective.md](hypotheses/voiceover-perspective.md) — one enum value +
   analyzer/scenes/assembly conditionals + channel presentation hint.
   **Status 2026-07-25:** both director reviews ACCEPT-WITH-CHANGES (folded); Phase-0 probe RAN
   (39¢): axis mechanism VALIDATED; teaching bar FAILED → judge-and-force **depiction gate**.
   **PHASE 1 IMPLEMENTED** (working tree, uncommitted): axis (enum + analyzer participant test +
   scenes VOICEOVER_RULE + scene-qa) · depiction gate (scene-depiction-critic/doctor.v1, informational
   boards, kill switch, scored audit) · presentation hint (channels.presentation, migration 0045,
   channel.v1 v1.5, wizard + Settings + analyzer). typecheck/lint/tests green; tenancy 7/7. Next:
   owner-gated controls lap (~30–50¢, prompt/bible level) → live review → commit → graduate to /specs.
2. **Depictive-ethics floor for real parties** (separable, ships first) — nothing prevents rendering
   identifiable real living people / named orgs' officials/events as photoreal event imagery in
   standard-mode factual content (EBN's illustrative floor doesn't reach it). **Drafted in full at
   [specs/depictive-ethics-floor.md](specs/depictive-ethics-floor.md)** (visual-director, 2026-07-25):
   floor wording + 5-point placement inventory + boundaries + edge cases. Awaiting founder
   ratification (floors-are-law), then implementation.
3. **Standalone fact gate** — the EBN Extractor + Fact-Fidelity Checker are excellent but only
   reachable via `storyMode='ebn'`, which also forces illustrative visuals + burned disclosure + a
   writer that ignores language/persona/length. Decouple "check my script against sources" into an
   opt-in step any channel can use (production run proved it works standalone: caught a missing
   Critical fact + forced attribution). Must define which visual floors travel with it (→ #2).
   Sequenced after #1/#2; amends specs/evidence-based-narrative.md.
4. **Budget cap** — folded into item 7 above (fresh evidence there).
5. **Render visual-fingerprint gap** — `render-step.ts` hashes `captionStyle` but NOT subtitle
   *content*; caption text changes could reuse a stale cached visual. Tiny correctness fix, do anytime.
6. **`captionStyle` has no "none"** — no-text reels currently require emptying `timings.subtitles`
   by hand. Make captions-off a first-class channel/reel toggle (some formats legitimately want zero
   on-screen text; owner shipped one).
7. **Duration estimator undershoots** — 2.5 wps estimate vs ~2.2 wps real (voice delivery + genre
   pauses): a ~220-word script rendered 100.7s vs ~86s predicted. Calibrate `estimateNarrationSec`
   with the voice/pause profile; affects `targetSeconds` honoring end-to-end.
8. **Style-ref distillation drops signature lighting** — `style-ref.v1` deliberately strips
   time-of-day, which erased a channel's dusk signature (had to hand-append). Add an owner-set
   "preserve signature lighting/time-of-day" option to the distillation.

### Deferred config (currently schema defaults at creation)

- `lutConfig` / `audioPacks` — need real asset files (LUTs, ambient beds, music
  pack); configure later in channel settings.
- `postingRules` — creation still seeds the defaults (fb+yt, 21:00 PHT, no quality filter), but the
  parts that matter are now editable in channel settings: the auto-produce cadence and the **posting
  schedule** (`postingRules.publish` — post as soon as a reel is ready, or hold it for the channel's
  next free day/time slot). On an auto-publishing YouTube channel the slot is handed to YouTube as
  `publishAt`, so the schedule fires even if our worker is down; `publish_promote` (every 15 min) is
  what moves our own records from scheduled to live. Still deferred: per-platform schedules (only
  YouTube publishes by itself — fb/ig/tiktok get the next slot printed on the post package) and
  per-channel timezones (slots are stored as UTC hours, shown in the operator's local time).

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
- **[✅ DONE] Scene image beat-adherence** — `scenes.v1` now front-loads the load-bearing beat (the
  subject/action that carries the shot) before framing/light, so flux renders the actual moment (e.g. the
  scare) instead of generic atmosphere. Plus style-neutral quality-floor negatives (`imageprompt.ts`) and
  a content-filter fallback that keeps the channel style (`generate-images.ts`).
- **[✅ DONE] Beat-aware scene count** — `breakdown_scenes` cuts on dramatic beats within a length-scaled
  range (e.g. 120s → 7–14) instead of a fixed `len/12`; the `peakMoment` (`story.twistAnchor`) gets its
  own dedicated shot. Verbatim-tiling + music-timing invariants unchanged; empty-peak degrades gracefully.
- **[✅ DONE] Living grade overlay** — `GradeOverlay` now animates: grain re-grains every frame (film
  shimmer, not a static texture), an unstable-light flicker, and a slow vignette breath. Frame-deterministic;
  scaled by the channel's grain/vignette. Camera motion (Ken Burns) already varied per scene (`SceneClip.tsx`).
- **[✅ DONE] Per-scene mood-driven atmosphere** — `ReelComposition` maps each scene's mood + tier →
  intensity, so dread/climax beats grade harder (more grain/flicker/vignette) than quiet ones; a flat
  channel stays flat. `mood` is plumbed scene → render-step → Remotion. Scene TRANSITIONS (hard cuts) still TODO.
- **[✅ DONE — text-based] Character consistency within a reel** — `scenes.v1` fixes a recurring figure's
  canonical look (build/hair/wardrobe/one detail) on first appearance and reuses it verbatim in later scenes,
  so it reads as the same individual (verified: identical description across scenes + consistent generated
  images). Faces stay obscured (imply rule). REMAINING for face-heavy / cross-reel niches: identity
  conditioning (world-bible characters + an identity model) — a SaaS-tier build; wardrobe can still drop under flux.
- **[✅ DONE — spike + fix] i2v video path** — the configured `kling-video/v1.6/image-to-video` was a DEAD
  endpoint (404; fal now requires the `/standard/` tier segment), so the video path was silently broken.
  Fixed in `config.ts`. Verified on a real photoreal scene: both kling-standard and the wan fallback hold the
  style and give a clean camera push-in (no warping) — the "wrong for stylized" concern doesn't apply to THIS
  photoreal channel. Both output 720p → upscaled to 1080×1920 at render; use kling `/pro/` for native 1080p
  (higher cost). Invoked only for `tier:'video'` hero beats.
- **[✅ DONE] Unmeasured loudness now FAILS** render_qa (was a warning).
- **[✅ DONE] AI music is now PER-REEL, not per-channel.** `generate_music` composes one fresh original
  bed for each reel (seeded by the channel's `audioMood`, tilted by the story's mood, sized to the reel),
  replacing the fixed channel-bed pool — so no two reels share a backing track, and each is vetted in
  context at spot_check. Cost ~10¢/reel (vs ~30¢ once); ~8s added per render. The pooled approach can
  return later as an "economy" toggle (cheaper, consistent) for cost-sensitive SaaS tiers.
- **[future] Scored music** — arc-synced to `peakMoment` (rises/drops timed to the story beats), built
  on the per-reel `generate_music` foundation. The premium tier above today's flat per-reel bed.

#### Sound (owned by the Sound Director coworker; A/B/C taxonomy ratified 2026-07-24)
The founder's reframe: the reels-sound-thin fix is audio *engineering*; the competitive advantage is *sound
direction* — the creative reasoning before a single sound is generated. **An AI Sound Director, not a better
mixer.** Three phases, each gating its taste-touching parts on a blind ear test before they ship:

- **[NOW] Phase A — Audio Engineering** (branch `feat/sound-presence-phase-a`). Fixes the founder's "I can
  barely hear it… no continuous background music and sound effects." **Reference gain-staging** (voice/music/
  ambient normalized to a reference so the bed is a true, audible ratio under the voice — it was ~22–27 dB
  under, below the WCAG floor); a **guaranteed continuous bed** (kill the two voice-over-silence paths; a
  room-tone ambient fallback instead of digital silence); a **QA bed-presence invariant** (an intended bed
  must be measurably audible — intensity-aware so a deliberately calm register isn't false-failed); duck-floor
  + SFX-bus re-level; plus the principle-7 cost-accounting fixes (music cost scales with length; SFX/TTS/music
  on one plan basis) and the annotate `maxTokens` reliability fix. Near-zero marginal cost (re-leveling, not
  more generation); validated by re-balancing the persisted stems + a blind before/after ear test.
- **[NEXT] Phase B — Sound Direction** (candidate architecture: [hypotheses/audio-direction.md](hypotheses/audio-direction.md)).
  An **Audio Direction** — the canonical creative intent for a reel's sound (per-scene emotion, listener
  perspective, environment, intentional silence, peaks/releases, motifs, cross-scene continuity) — that music,
  ambience, foley, SFX, and any *future* provider all derive from. **Never "better prompts"**: the Direction is
  a provider-independent artifact, not prompt tuning. Built by deepening `annotate_audio_script` (Direct →
  Design, no new stage) with a mandatory **direction-fidelity check** (downstream stages satisfice plans — the
  judge-and-force lesson). The register work folds in here: de-bias `sound-designer.v1` off its 18-revision
  horror overfit (the first EBN documentary reel came out tense and wrong — register is set by genre + mode +
  channel DNA, never a house default; a calm register is often correct), de-monoculture the all-dark mood
  vocabulary, strip "tension/taut" from the universal music prompt, register-gate the forced-movement remap.
  Judgment/de-biasing, NOT more mandates (prescription *caused* the overfit — Anti-Prescription Guard). Gate:
  cross-register blind ear A/B. Diagnosed + A/B-designed by the Sound Director via Evidence-Before-Taste,
  shipped through the Product Partner + Technical Advisor.
- **[future] Phase C — Channel Audio Identity, as the Audio Bible.** The channel-level twin of the Audio
  Direction (signature motifs, ambience palette, instrumentation, recurring transitions, pacing, loudness
  philosophy, silence habits, forbidden sounds, callbacks) that every reel's Direction inherits from —
  completing the Bible family (Story = fiction, Evidence = fact, Audio = sonic identity). North star: **a viewer
  recognizes the channel without seeing its logo.** Mechanism levers unused today: ElevenLabs `seed`,
  `music_v2`, `composition_plan`; a seeded signature bed reused across a channel (identity + cost win, cost
  attributed once). The Sound Director's spot-audit lever once channels have a back catalog.
- **[note] EBN i2v cost/quality lever** — for Evidence-Based (illustrative) reels, the i2v hero-beat clips
  are the bulk of per-reel cost, slow the render, and risk warping flat illustration (i2v is trained on
  photoreal motion). Consider allocating 0 video tiers for EBN (stills + Ken Burns only). Cost/render lever,
  not strictly sound — tracked here alongside the EBN media work.

#### Visual direction (owned by the Visual Director coworker, added 2026-07-24)
- **[NOW] Baseline visual spot-audit of shipped reels.** Visual craft has had no owner; the known failures
  are anecdotes scattered across the system's history — the entity drift that motivated the Story Bible, the
  breakdown drift that motivated storyboard grounding (`continuity.journey`), the fingerprint audit's
  cinematic-vagueness finding. First charge: audit a sample of shipped reels for continuity breaks
  (character / environment / object), style drift, and visual monoculture, and turn the anecdotes into a
  measured pattern catalog via the Visual Director's Evidence-Before-Taste workflow. Any fix ships as an
  experiment through the Product Partner + Technical Advisor — judgment-shaped, never more prompt mandates.
- **[future] Channel Visual DNA** — steward a channel's longitudinal visual identity (recognizable but not
  repetitive — rendering style, palette, camera language, motifs) once channels have a back catalog; the
  Visual Director's spot-audit lever, the twin of Channel Audio DNA.
- **[✅ DONE] Guided story creation + full-pipeline transparency.** Review-mode reels now land on a
  per-reel **Story Studio** (`/reel/[id]/story`): ask BYO-or-generate; a characterful, channel-themed
  loader (crimson for horror) while the story is written; review it; **regenerate-with-reason** (the
  rejection reason+note is injected into the prompt + an attempt # busts the `generate_story` inputHash, so
  even the same reason yields a new story). New routes: `provide-story`, `regenerate-story`, `status`
  (poll). A `usePipelineStatus` hook + `pipeline-phases.ts` (14→5 phases) also drive a live build/render
  stepper + "scenes develop in" on the storyboard. No schema change (reuses `rejections`/`pipeline_steps`).

### Channel creation
- **[P2] Derived genome goes stale on edit**: changing niche in Settings doesn't re-derive tone/style/
  voice-keyword/audioMood. Add a "Regenerate profile" action.
- **[P2] Hardcoded, should be per-niche**: ambient SFX pack (`province_night`), LUT grade, posting rules.
- **[P3] derive timeout can hang Step 1** (manual retry only) — add a client timeout + retry UX.
- **[P3] Validate `musicMode='ai'` has an `audioMood`** at create (else per-reel beds fall back to a
  generic niche/tone prompt instead of the channel's sonic DNA).
- **[P3] Some derived fields locked/hidden post-creation**: caption colors/position, audioMood.
