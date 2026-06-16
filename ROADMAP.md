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
- **Channel creation flow** — `/channel/new`, minimal + AI-derived:
  operator gives name + niche + languages → Claude derives the creative bible
  (tone, visual style DNA, world bible, narrator voices) → operator reviews/edits
  → channel is created. (`channel.v1` prompt; `/api/channel/derive` +
  `/api/channel/create`.)
  - Optional **channel avatar** (R2 upload) and **preset niches** (curated
    trending short-form niches that seed the description) in step 1. Niche
    presets use colored, outlined icons.
  - **One language per channel**, picked from a fixed **dropdown** of
    pipeline-supported languages (`languages.ts`) — no free text. Want another
    language → make another channel. (Stored as a 1-element array.) Claude writes
    the language, ElevenLabs narrates it; ~30 languages offered.
  - **Sample reel script preview** in step 2 — generates one short narration
    on-demand from the (edited) bible so you can gut-check the channel's voice
    before creating. (`channel-sample.v1`; `/api/channel/sample-script`.)
  - Optional channel **description** (shown on card/header), **default gradient
    avatar** monogram when no image, custom animated **Dropdown** (language +
    voice gender), smooth animations + responsive widths.
  - Step 2 review **simplified**: shows only a recap (avatar/name/description/
    language), narrator voices, and the sample script. Tone / visual style /
    story world / positioning are still generated + stored, just hidden at
    creation (too technical) — they'll be editable in channel Settings.
  - **Draft persistence**: the whole wizard (both steps, incl. generated profile
    + voices + avatar) is saved to `localStorage` and rehydrated on reload;
    cleared on successful create. Survives reloads and leaving the page.
  - **Real voice picker** (replaces AI-invented voices). **Radio** choice —
    *one voice* vs *different voice per story* (each explained); the voice list
    stays hidden until "one voice" is picked. One-voice shows Claude-**recommended**
    voices for the niche/language/tone (`/api/voices/recommend`), read-only
    metadata + instant preview + "show all" fallback, top auto-selected. Per-story
    stores no voice (chosen per reel at render). Default channel language is
    **English**. **Language → ElevenLabs voices:** English uses premade voices;
    other languages pull from the shared library by code (Tagalog/Taglish →
    `fil`, etc.) so e.g. a Taglish channel sees real Filipino voices.
    Recommendation pool is filtered: **narration** use-case, **popularity** sort,
    and a **genre keyword** (`voiceSearchKeyword` from derivation, e.g. "horror")
    via the library `search`. A **gender** chip filters the shown list.
    (Listing + previews are free; only render-time TTS costs characters.)
- **Design conventions** captured in `DESIGN.md` (root): always animate, always
  responsive, primitives-first, custom controls, outlined icons, light theme.
- **Channel detail page (`/channel/[id]`)** — read-only overview: header,
  stat row, niche, tone bars, visual style, story world, narrator voices (real,
  with voice-mode badge), and a reels section (empty state). Portfolio cards
  open it.

## Next steps

1. **Channel settings / edit** — the detail page is read-only; make the bible
   editable (it reuses the wizard's review fields). Header has a disabled
   "Settings" button as the placeholder. This is also where deferred config
   (LUT, audio packs, posting rules) gets edited.

2. **Per-channel workspace** — fold the old `/review` and `/storyboard/[id]`
   views into the channel detail page (reels, review queue, analytics tabs).
   They're currently unreachable from nav.

3. **Per-story voice selection** — channel voice picking is done (real voices,
   single or per-story shortlist). When the reel flow is built, a `per_story`
   channel should let the operator pick one voice from its shortlist per reel;
   a `single` channel just inherits its one voice.

4. **Derivation prompt tuning** — iterate on `channel.v1` if the generated
   tone/style/world doesn't match what we imagine for a given niche.

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
- End-to-end reel production (create reel → review → render → export) has never
  been run start to finish — still the key product milestone.
