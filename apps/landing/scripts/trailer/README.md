# Hero trailer — "Every Story Begins Here"

The 40.7s brand film for the landing hero. **It is not pipeline output** — it is hand-cut from the
same engines the product runs (nano-banana + flux stills, Kling v2.5 motion, ElevenLabs voice/score)
plus screen captures of the real app. The landing page never claims otherwise: the hero figcaption
says "Kendrix Studio", and the real pipeline reel lives in the screening-room section below it.

Deliverables land in `assets/trailer-src/out/`: `trailer-final.mp4` (1080×1920 master, −14 LUFS),
`trailer-web.mp4` (720×1280, ~6.6 MB), `trailer-poster.jpg`. Previous cuts sit beside them in
`prev-<date>/` and `prev-cut2/`.

**EMBEDDED 2026-08-06.** The web cut and poster are copied to `apps/landing/public/hero/` and played by
[`hero-reel.tsx`](../../src/components/hero-reel.tsx) — autoplay, muted, looping, sound opt-in, poster
as the fallback when autoplay is refused or `prefers-reduced-motion` is set. **After re-cutting, copy
both files across again or the page keeps serving the old take:**

```bash
cp assets/trailer-src/out/trailer-web.mp4    apps/landing/public/hero/trailer.mp4
cp assets/trailer-src/out/trailer-poster.jpg apps/landing/public/hero/trailer-poster.jpg
```

The hero figcaption reads **"Every Story Begins Here" · Kendrix Studio** — that wording is the
provenance law, not decoration. Never relabel it as pipeline output.

## The ending is the thesis (cut 3, 2026-08-06)

The brand used to arrive as a card after 30 seconds of worlds — which taught the viewer "oh, that was
an ad". It is now the conclusion of the story: **imagination → creation → Kendrix**. The reel finishes,
the camera pulls back until you realise you are *inside Kendrix*, the room goes dark, and the last
light left — the gradient on the button you pressed — contracts and becomes the K, exactly as the
narrator says the name. Then half a second of air (in the speech only; the score holds through it),
the wordmark, beat 1's room rising behind, and the tagline.

Two craft rules that are easy to undo by accident:
- **The pull-back must withhold its reveal.** A plain zoom-out reads as "a UI" within a few frames.
  The surround is bloomed and unreadable until the final third, then racks into focus. Verify by
  eye at 0.4s (must be unreadable) and 1.6s (must be legible, with *Approve reel* readable).
- **The half-second of air is speech-only.** The bed plays through it — measured at −30.9 dB, versus
  −75 dB for actual silence. A silent pause reads as a dropout.

The opening was also replaced: its prompt literally said *"oppressive quiet dread"* over the line
"Every story begins with a single question". Beat 1 is now a child's room in a 3D-animated-feature
language — the same shot (closet ajar, light through the crack, one focal point) in a different
visual language, so the fadewhite into beat 2 still works.

## ⚠️ The finale contains app UI — it goes stale when the screens change

Beat 10 (the last 13s) is: a pan across the real storyboard editor → the cursor pressing the real
gradient **Render reel** CTA → the product's real *"Rolling your reel"* state → the finished reel →
the pull-back that reveals the editor around it → the dim → the collapse into the K → the end card.
Four of those shots are screen captures of the real app.

**After any app redesign, re-shoot it before the page deploys** — otherwise the hero shows a product
that no longer exists. Re-shooting costs **$0** (no API calls): it only re-captures screenshots and
re-renders. Beats 1–9 need no regeneration (they are the stills and Kling clips, already paid for).

```bash
cd apps/landing/scripts/trailer
# prereqs: the web app + postgres running (pnpm dev), and a reel with scenes, images and a render
node mint-cookie.mjs        # 24h local session cookie → assets/trailer-src/session.jwt
node shoot-ui-states.mjs    # the 3 editor states + ui-geometry.json (flips reel status, restores it)
node build-finale.mjs       # 10 finale shots (calls shoot-motion.mjs) + clips/beat10-shots.json
node assemble-trailer.mjs   # full cut + mix + loudness + web cut + poster → out/
```

Overrides: `REEL_ID`, `WEB_PORT` (**probe it — it moves**: `curl -s localhost:3000 | grep '<title>'`),
`SESSION_JWT`, `PG_CONTAINER`.

### The two traps this re-shoot hit

1. **A `tailwind.config.ts` token is invisible until the CSS is rebuilt.** The 2026-08-06 dock
   redesign added `night-dock`; the running dev server had never compiled it, so the first capture
   shot a *white* dock with invisible text. `touch apps/web/src/app/globals.css`, wait for the
   recompile, then confirm the token is really served:
   `curl -s localhost:3000/_next/static/css/app/layout.css | grep -c night-dock`.
   (Touching globals.css is enough — no need to restart the dev server.)
2. **Screenshots taken before hydration look plausible and are wrong.** The server HTML has no scene
   selected, so the stage reads "Pick a scene to start" and every filmstrip frame is blank. A fixed
   `sleep` passes this by luck; `shoot-ui-states.mjs` now waits on real conditions (scene selected,
   narrator resolved, every thumbnail decoded, count stable) and fails loudly instead.

### Crop windows are derived, not hard-coded

`shoot-ui-states.mjs` measures the Render CTA, the rendering card, the dock, the frame and the strip
into `assets/trailer-src/ui/ui-geometry.json`; `build-finale.mjs` computes its pan target, cursor
landing point and push-in centre from that file. The dock redesign moved the cursor's landing point
56 px left and 20 px down within the 1080×1920 frame — hard-coded coordinates would have pressed
empty dock, and nobody would have noticed until the founder watched it.

It now also carries the pull-back's destination (`reelPreview`) and the gradient the K grows out of
(`approveReel`). The one deliberately hand-picked number is where the pan *opens* (`PAN_FROM`) —
that's taste, not geometry, and the script warns if the shot no longer supports it.

**And the picture now anchors the voice.** `vo10At` used to be `finaleStart + 3.1`, a magic number.
`build-finale.mjs` writes `clips/beat10-shots.json` — every shot's offset plus a `kResolvesAt` marker —
and `assemble-trailer.mjs` places "Kendrix." on that marker. Change a shot length and the voice
follows. It also refuses to run if the manifest and the finale disagree.

## Source assets

Large binaries live in `assets/trailer-src/` (gitignored), which is also where the minted cookie and
the ffmpeg intermediates (`work/`, safe to delete) go:

| dir | holds |
|---|---|
| `stills/` | the 8 beat stills + 3 style alternates (paid, hard to reproduce) |
| `clips/` | the 8 Kling clips (paid), `beat9-montage.mp4`, `beat10-finale.mp4` |
| `ui/` | app captures, overlays, `ui-geometry.json` — free to re-shoot, stale after a redesign |
| `audio/` | `t*.mp3` raw VO, `s*.mp3` tempo-corrected, bed, heartbeat |
| `out/` | masters, web cut, poster, and `whatif-reel.mp4` (the real pipeline reel) |

The reels are also in R2 and can be re-downloaded by `assets.storageKey`. Previous versions of the
UI captures and masters are kept beside them in `prev-<date>/` folders.

## Regeneration costs (2026-08-05)

| piece | cost | notes |
|---|---|---|
| 8 beat stills | $0.50 | flux ×3 (dread/neon/eye), nano ×5 |
| 3 style alternates | $0.12 | founder chose all three: oil painting, anime, watercolor |
| 8 Kling clips | $2.80 | 5s each @ 7¢/s; style-preservation pinned per prompt or Kling photorealizes paintings |
| voice + score + sfx | $0.68 | 10 lines, 36s bed, heartbeat |
| montage + finale + UI | $0 | cut from existing assets and screenshots |
| **cut 3 (2026-08-06)** | | |
| beat 1 still, 2 variants | $0.15 | flux + nano; the founder picked nano (darker surround, one focal point) |
| beat 1 motion | $0.35 | Kling, style-preservation clause MANDATORY or it photorealizes the source |
| music bed | ~$0.30 | ⚠️ ElevenLabs IGNORED `music_length_ms: 42000` and returned 60s with a flat plateau where the cut needs a drop. Unusable alone — `assemble-trailer.mjs` splices `music36` (0→31.5s, the right arc) with `music42` (43→55s, the resolve) in the quiet region so the join is masked |
| f7 / f8 / f9 motion shots | $0 | CSS rendered frame-by-frame through `shoot-motion.mjs` |
| **cut 3.1 (2026-08-06)** | $0 | burned captions, the 3-part bed, header-matched wordmark — all local |

`gen-trailer-stills.mjs`, `gen-style-alts.mjs`, `gen-trailer-clips.mjs` and `gen-trailer-audio.mjs`
are the paid steps. They are **not** part of a re-shoot; running them spends money.

## Burned captions — titles, not subtitles

The hero **autoplays muted**, so captions are not a flourish: they are the only way a silent viewer
gets the narration.

The first attempt set them in the product's own `cinematic` caption preset — faithful, and far too
plain for a brand film (founder: *"isn't fancy and artsy at all"*, then *"don't rely on our preset,
they are not fancy enough"*). **The presets are built for reels, not for a title sequence.** So the
treatment is built from the film's own grammar instead:

- **No bar.** A translucent grey box is the single most "utility subtitle" element there is. Legibility
  comes from a graduated scrim that dies out upward, plus a real shadow — the way film titles do it.
- **Nunito 800 at 78px** — the brand's display face, the same one the wordmark and the landing header
  use. Big enough to read as a title.
- **Words arrive on light**: each one resolves out of a blur and drifts up, staggered ~70ms. Light
  drives every transition in this cut, so type enters the same way rather than popping.
- **One word per line is LIT with the brand gradient** (`EMPHASIS` in `narration.mjs` — chosen by hand,
  because the load-bearing word is a judgement). The gradient runs through all eight captioned lines
  and then, at 36s, contracts and becomes the K. The logo is the payoff of a thread the viewer has been
  reading for thirty seconds.
- The eyebrow **WHAT IF** is held across beats 2–7 while only the clause changes.

### Four bugs this treatment hit, all caught by looking at frames

1. **The wordmark was never Nunito.** `fontFromCss` used to skip `.p.` (preload) files and take the
   first remaining woff2 — which is the **Cyrillic** subset, because next/font lists non-latin subsets
   first and preloads exactly the latin one. Every glyph fell back to the system sans for two cuts, and
   the founder caught it by eye. **Select the subset by unicode coverage (`U+0000-00FF`), never by
   filename.**
2. **A gradient FILL made the emphasised word dimmer than its neighbours** — a short word samples only
   the gradient's dark stops. The glyphs are white now and the brand is the *light* behind them, which
   is also truer to the ending.
3. **Orphaned punctuation** — splitting on the emphasis phrase left `"question ."`. Trailing
   punctuation rides with the emphasised word.
4. **Fixed geometry or the layers drift.** The caption zone is anchored from the TOP at a fixed height.
   Bottom-anchoring made the stem-only layer slide down to the clause's baseline (where the clause drew
   over it, leaving the eyebrow invisible); an earlier version let a wrapping clause overprint the stem
   entirely. If the stem can move, the device reads as a rendering fault.

### Captions stop at beat 8

Beat 9's montage is cut from the product's own finished reels, so it already carries **their** burned
captions; a film caption on top stacked two bars. Stepping aside there makes the handoff start where the
product's output first appears: the film's titles (1–8) → the product's own captions (the montage, then
the reel revealed inside Kendrix) → the brand's own words.

`narration.mjs` holds the lines, the emphasis words, the anaphora and the captioned-beat list — **not**
`gen-trailer-audio.mjs`, because importing that file to read its lines would run its ElevenLabs calls
and spend money.

**GOTCHA:** a stray backtick inside a template literal silently breaks these CSS-in-JS builders, and the
failure looks like "my change had no effect". Run `node --check shoot-motion.mjs` after every edit.

## The motion shots — `shoot-motion.mjs`

f7 (the dim), f8 (the collapse) and f9 (the lockup + tagline) are motion graphics, not footage. They
are CSS rendered in headless Chrome and captured frame by frame — $0 and re-runnable — and they reuse
the app's own `.stage-leak`, `.film-grain`, `gl-float`, `gl-twinkle` and `gl-aura` **verbatim from
`apps/web/src/app/globals.css`**. That is the point: the end card doesn't imitate Kendrix, it moves
like it. The founder's note was that the old card "feels like a YouTube outro"; the fix was to build
it out of the product's own motion language rather than approximate one.

**Time is deterministic, not real-time.** Ambient layers are the app's keyframes held at
`animation-play-state: paused` with a negative `animation-delay`; the dramatic timeline is an explicit
interpolation. Frame *n* is a pure function of *t*, so a re-render is identical.

`node shoot-motion.mjs --probe` renders stills at the key instants without spending frames — use it
when iterating on the collapse, which is the riskiest shot in the cut.

## Tooling note

playwright is NOT installed in this repo. `cdp.mjs` drives the Chrome-for-Testing that playwright's
cache already holds (`~/Library/Caches/ms-playwright/chromium-1223`) over CDP with Node's global
WebSocket. Every CDP request is time-boxed: an evaluate issued while the page swaps execution
contexts can get no reply at all, which is how the first re-shoot silently hung for ten minutes.

## Craft constraints worth keeping

- **The arc widens every beat** — bedroom → planet → civilization → city → sky → ocean → cosmos →
  a galaxy in a suitcase → all worlds → the tool that holds them.
- **Light drives every transition** (white-flash `xfade=fadewhite`, and each still's dominant light
  source sits center/upper-center, warm core against cool surround).
- **One focal point per beat** — the thumbnail test.
- **The cut is driven by the narration**, not fixed 3s slots; that's why it runs 35.8s, not 30s.
- **Beat 10's dominant action is CREATION** — the render press and progress are the star; the card
  choreography must stay support.
