# Kendrix Rebrand — Design Token Diff

**Status:** APPLIED to the working tree, awaiting review before the component pass
**Scope:** the token layer only — `tailwind.config.ts`, `globals.css`, `layout.tsx` (font loading)
**Gates:** `pnpm typecheck` clean · `pnpm lint` 0 errors · Tailwind CSS compiles clean
**Source of truth:** `design_handoff_kendrix_rebrand/README.md` → "Design tokens"

Components are **untouched by this diff** (see "Carried over" at the bottom for pre-existing
component edits that predate it).

---

## 1. Fonts — three-font system

The old brand loaded **Inter + JetBrains Mono** via `next/font`. Replaced with the three-font
system, still via `next/font` (self-hosted, no render-blocking request, no FOUT):

| Role | Family | Weights | CSS var | Tailwind |
|---|---|---|---|---|
| Display — titles, headings, wordmark | **Nunito** | 500–900 | `--font-nunito` | `font-display` |
| Body + all UI | **Mulish** | 400–700 | `--font-mulish` | `font-sans` (default) |
| Numbers, costs, IDs, scene indices, slate | **Space Mono** | 400/700 | `--font-space-mono` | `font-mono` |

`layout.tsx` puts all three variables on `<html>`. Numeric weights `font-400 … font-900` are now
registered in `fontWeight` — the spec talks in numeric weights, and **this was the compile break**:
`globals.css` already `@apply`'d `font-700`/`font-600`/`font-400` while only `800`/`900` existed, so
the stylesheet failed to build (`The 'font-700' class does not exist`).

Heading defaults: `h1` 900 / `-0.03em`, `h2` 800 / `-0.02em`, `h3` 700, all `font-display`.
Added `text-2xs` (10px) for the micro-labels the spec calls for.

---

## 2. Brand gradient

`linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 75%, #FF9A3D 100%)`

Exposed as `backgroundImage` utilities so nothing hard-codes the stops:

| Utility | Value | Use |
|---|---|---|
| `bg-brand` | 4-stop (orange tail) | hero taglines, long sweeps |
| `bg-brand-3` | 3-stop, no orange | **most CTAs**, active states, avatars |
| `bg-brand-wash` | gradient @ 12% | active nav row, "why this one" panel |
| `bg-brand-wash-faint` | gradient @ 6–8% | subtler washes |
| `bg-brand-bar` | `180deg #2FA4FF→#FF2D9B` | 3px active-nav left bar |
| `bg-pair-purple-pink` | `#9B3BFF→#FF2D9B` | avatar / accent pair |
| `bg-pair-blue-purple` | `#2FA4FF→#9B3BFF` | avatar / accent pair |
| `bg-pair-blue-violet` | `#2FA4FF→#7B5BFF` | avatar / accent pair |
| `bg-pair-pink-orange` | `#FF2D9B→#FF9A3D` | avatar / accent pair |
| `bg-plum` | `150deg #1B1330→#2A1650` | credits card, channel banner |

Individual stops also available as colors: `brand-blue` `#2FA4FF`, `brand-violet` `#7B5BFF`,
`brand-purple` `#9B3BFF`, `brand-pink` `#FF2D9B`, `brand-orange` `#FF9A3D` — for SVG icon strokes.

---

## 3. Colors

### Light app
| Token | Hex | Change |
|---|---|---|
| `bg` | `#FBFAFF` | app canvas |
| `surface` | `#FFFFFF` | cards, sidebar, header |
| `subtle` | `#FAF9FD` | light inset / hover |
| `subtle-strong` | `#F0EDF8` | **new** — deeper insets, muted fills |
| `border-soft` | `#F2F0F8` | **new** — faintest divider |
| `border` | `#ECEAF3` | default hairline |
| `border-mid` | `#E4E1EE` | **new** — buttons |
| `border-strong` | `#DEDBEA` | inputs |
| `ink` | `#16131F` | primary text |
| `body` | `#2C2836` | long-form copy |
| `muted` | `#6B6577` | secondary |
| `faint` | `#9B96A8` | tertiary / placeholders |
| `faint-soft` | `#B0AABE` | **new** — micro-labels |
| `accent` | `#9B3BFF` | **replaces midnight `#1A1A2E`** |
| `accent-hover` | `#7A2BE0` | **new** — link hover |
| `accent-soft` | `#F2ECFC` | soft accent wash |
| `accent-ring` | `#C9A0FF` | **new** — hover border (cards/chips/nav) |
| `row-hover` | `#F7F5FC` | **new** — list-row hover |

### Semantic
`success` `#1A7F52` on `success-soft` `#E6F4EC` · `warning` `#8A5A16` on `warning-soft`
`rgba(255,154,61,.07)` with **new** `warning-ring` `rgba(255,154,61,.28)` · `danger` `#C8341B` on
`danger-soft` `#FBEAE6`. **New** admin status pills: `status-pending` `#9B3BFF` on
`status-pending-soft` `#F2ECFC`, `status-suspended` `#B0453A` on `status-suspended-soft` `#F8ECEA`.

### Dark world (auth panes + cutting-room stage) — all new
`night` `#08060E` · `night-800` `#0A0713` · `night-700` `#0D0A17` · `night-plum` `#1B1330` ·
`night-plum-lit` `#2A1650`; text `night-ink` `#FFFFFF` / `night-body` `#B8B0CC` /
`night-muted` `#948CAB` / `night-faint` `#6A6280`.

---

## 4. Radii, shadows, focus, layout

- **Radius:** `sm` 10 (inputs) · `md` 12 (buttons, `DEFAULT`) · `lg` 16 (cards) · `xl` 18 (elevated)
  · `2xl` 20 (pills, avatar tiles) · `3xl` 22 (phone frame).
- **Shadows:** `xs` `0 1px 3px rgba(20,16,26,.05)` resting; `sm`/`md`/`lg` elevated
  (`rgba(30,16,60,.1–.16)`); CTA glow `glow-sm/md/lg` `rgba(155,59,255,.5–.55)`; **new**
  `glow-pink` `0 16px 34px -10px rgba(255,45,155,.6)` — the mocks' primary-CTA hover.
- **Focus rings:** `ring-focus` `rgba(155,59,255,.16)` (light) / `ring-focus-dark` `.25` (dark),
  paired with `focus:border-accent`.
- **Tracking:** `tracking-micro` `0.12em`, `tracking-micro-wide` `0.14em`.
- **Layout:** `spacing.sidebar` = `236px`, so the shell width is a token not a magic number.

---

## 5. Component-layer primitives (globals.css)

Existing classes retuned to the new tokens; nothing removed.

- `.btn-primary` → `bg-brand-3` + `hover:shadow-glow-pink` (was a raw inline gradient).
- `.btn-secondary` → `border-border-mid`, `hover:border-accent-ring`.
- `.input` → `focus:border-accent focus:ring-[3px] focus:ring-focus`. **New** `.input-dark` for the
  auth panes.
- `.nav-link-active` → **now the spec's active state**: `bg-brand-wash` + a 3px `bg-brand-bar` left
  bar via `::before` (was a flat `bg-subtle`).
- `.mono-label` → 11px, `tracking-micro`, `text-faint-soft` (was 12px `text-faint`).
- `.gradient-primary` / `-3stop` / `-text` / `-soft-wash` → now delegate to the `bg-brand*` tokens.
- **New** `.gradient-border` — the double-background trick for selected scenes/cards.
- **New "cutting room" motif** primitives for Story Studio v2 + Storyboard: `.stage` (plum base),
  `.stage-leak` (animated three-radial light-leak, 7s), `.film-grain` (inline fractal-noise SVG at
  9% soft-light), `.slate` / `.slate-label` / `.slate-value` (clapperboard metadata strip).
- **New animations** from the spec: `animate-k-float` (6s logo float), `animate-leak` (7s),
  `animate-stage-up` (title stagger), `animate-ticker-fade` (3s status crossfade),
  `animate-aura-pulse` (2.8s loader aura), `animate-ring` (scale 0.5→1.8 fade).
- **Retint:** every `#1A1A2E` fallback (`--think-tint`, `--gl-tint`, `--glow-tint`, `value-flash`)
  → `#9B3BFF`. These were silently keeping the old midnight brand on the loaders.
- Scrollbar thumb `rgba(22,22,26,…)` → `rgba(22,19,31,…)` (ink-tinted).
- The reduced-motion guard and every genre-loader / develop-in / toast animation are untouched.

---

## Verify

- [x] Tailwind CSS compiles (`npx tailwindcss -i src/app/globals.css`)
- [x] `pnpm typecheck` clean
- [x] `pnpm lint` 0 errors
- [ ] Visual check in-browser — fonts resolve (Mulish body / Nunito headings / Space Mono figures),
      gradient CTAs, focus rings, `#FBFAFF` canvas

---

## Component pass 1 — shell + auth + dashboard (DONE)

Redone against the tokens, replacing the earlier pass's inline hexes. Behavior, props and data
flow unchanged throughout.

| File | Change |
|---|---|
| `components/Wordmark.tsx` | **new** — shared `KendrixMark` / `Wordmark` lockup (real K asset) |
| `public/brand/` | **new** — `kendrix-k.png`, `kendrix-sparkle.png` from the handoff |
| `(app)/Sidebar.tsx` | mock layout: lockup, `WORKSPACE` / `OPERATIONS` micro-labels, `.nav-link-active` gradient wash + left bar, gradient-stroked active icon, operator footer with sign-out icon button |
| `(app)/Shell.tsx` | mobile top-bar monogram → brand gradient tile |
| `(auth)/AuthShell.tsx` | two-pane dark brand world: glow + floating K + hero + 4 capability marks; dark form panel; dark `GoogleButton`, `OrDivider`, new `AuthField` |
| `(auth)/signin/page.tsx` | dark-panel form, arrow CTA, `input-dark` |
| `(auth)/signup/page.tsx` | dark-panel form + the mock's green auto-approve banner |
| `dashboard/page.tsx` | Nunito page title, micro-label sections, dashed draft cards, channel cards with per-channel corner glow + mono stats, new-channel tile |
| `dashboard/CreateChannelButton.tsx` | gradient CTA + new `variant="tile"` |
| `components/ChannelAvatar.tsx` | monogram palette → the brand's four accent pairs; rounded tile (was circle); new `avatarGlow()` |

### Dead classes found and fixed at the token layer
The old brand's names were still referenced app-wide and silently rendering **unstyled**:
- `btn-accent` — **27 buttons** across storyboard, wizard, admin, review, story studio. Added as an
  alias of `.btn-primary` so the whole app inherits the gradient, with no component churn.
- `positive` / `positive-soft` / `negative` / `negative-soft` — 8 sites (toasts, admin status pills,
  storyboard). Added as aliases of success/danger.
- `bg-positive-soft text-positive` on the signup invite banner was doubly dead — restyled outright.

### Tokens added during the pass
`night-danger` `#FF9C8A` · `night-success` `#43E08A` · `night-success-body` `#9FE7C0` ·
`night-success-strong` `#C6F5DD` · `night-success-bg`/`-border` — semantics legible on the dark
panes. `animate-glow-pan` + `.brand-glow` (the auth world's three-radial glow).
`.micro-label` split from `.mono-label`: section labels are **Mulish** 700 tracked per the mocks;
Space Mono stays reserved for figures and slate metadata. `.card-channel` corrected from a
full-card purple wash to the mock's 90px tinted corner radial (`--card-glow`).

### Verified
- [x] `pnpm typecheck` clean · `pnpm lint` 0 errors · Tailwind compiles clean
- [x] Every semantic class the app references is emitted (swept tsx → compiled CSS)
- [x] **In-browser**: `/signin` and `/signup?invite=1` screenshotted at 1280×760 — match the mocks
      (fonts resolve, gradient CTA + glow, dark inputs, invited banner, error state)
- [x] **In-browser dashboard + sidebar** — screenshotted signed in. Fixed one defect found only by
      looking: channel/draft card stats rows didn't align across the grid when descriptions ran to
      different line counts (now `mt-auto`-pinned to the card bottom).

### Dev login (fixed 2026-07-26)
The admin account still carried the old work email while `.env.local`'s `ADMIN_EMAIL` had moved to
`kjmsilvestre@gmail.com`, so credential sign-in failed. Corrected the email on the existing `users`
row (same id `e90261ce…`, no OAuth links to migrate) and re-ran the repo's idempotent
`pnpm --filter @reels/db seed:admin`, which reset the password from `ADMIN_PASSWORD` and adopted the
one owner-less channel. One admin account, no duplicate.

## Component pass 2 — story studio, channel detail, review queue (DONE)

| File | Change |
|---|---|
| `reel/[reelId]/story/StoryStudio.tsx` | the **cutting room**: dark story stage (light-leak, film grain, 9:16 frame guide, gradient eyebrow, Nunito title card, logline, subgenre chips, clapperboard slate TAKE/LANG/RUNTIME/SPEND) + light editing rail (the read, voice-reference switch, Built-from chips, Why-this-one panel with gradient bar, QA punch-list, Write another / Use this story). Reject now opens in the rail with the stage still up. |
| `reel/[reelId]/story/page.tsx` | `extractCritic` stops folding the read-gate verdict into `rationale` — it rides as `readGate {pass,label,reason}` so it can render as the mock's pass/flag pill |
| `components/StoryGenerating.tsx` | unchanged — already matched the loader mock; it inherits the retinted aura/rings/thinking-bar |
| `lib/pipeline-phases.ts` | `MOOD_TINT.neutral` `#1A1A2E` → `#9B3BFF` (last stale midnight value in JS; dark/warm keep their channel-character hues) |
| `channel/[id]/page.tsx` | dark-plum channel banner with corner glows + mono stats; reels list rows with 9:16 tinted thumb, title, age, status pill |
| `components/ReelStatusPill.tsx` | **new** — the 12 reel statuses grouped into live / working / waiting / broken, as a dot-and-label pill |
| `review/page.tsx` | Nunito header, accent `N of M` counter, stacked-cards peek behind the top card |
| `review/ReviewCard.tsx` | brand top edge, channel identity row, Nunito title, tag pills, mono meta strip, Reject outline / gradient Approve |
| `globals.css` | added `.clapper-band` (the clapperboard stripe) |

Also fixed: `review/page.tsx` used the dead `bg-positive-soft text-positive` pair (now `success`).
Removing two now-unused imports took web's lint warnings from 6 → 4.

### Verified in-browser
Story studio at 1440×820 in all four states (read, rail-scrolled, reject picker, and the pre-story
light layout), channel detail and review queue at 1360×900 — no console/page errors in any.
The read-gate pill renders real data ("Passed the read (after one rewrite)"), confirming the
plumbing. Reel thumb measured 34×48 to confirm the 9:16 shape.

### Deliberately not added
- **Channel detail's segmented filter** (All / Published / In progress). It's in the mock but it is
  new *behaviour*, not a skin — it needs client state over the server-rendered list. Flagged for a
  yes/no rather than added silently.
- **Views / analytics numbers** in the channel banner (mock shows "1.4M VIEWS · 30D"). The app has no
  view data on this page, so the third stat is month-to-date **spend**, which is real.

## Component pass 3 — storyboard editor (SKIN DONE · layout rework needs a decision)

`StoryboardEditor.tsx` (2,377 lines) got the brand skin, **not** the mock's structural rework — see
the open question below.

| Change | Detail |
|---|---|
| Header | Nunito title, `ReelStatusPill` replacing the grey status badge, mono spend/minutes |
| Filmstrip | `MICRO-LABEL` scene count + mono total runtime, **sprocket-hole band** (new `.sprockets` token) that fades in as the rail collapses |
| Scene frames | Space Mono zero-padded indices (`01`, `02`…), gradient chip on the selected frame |
| Grid captions | added the mock's `STILL` / `MOTION` / `RENDERING` state label |
| Render cluster | voice control as the mock's icon-tile card; **spend slate** in clapperboard treatment beside the gradient Render CTA |
| `globals.css` | new `.sprockets` |

### Bug found and fixed (caused by the token pass)
`SceneThumb` and `SceneInspector` both special-case the mood tint when it would collide with the
selection accent — but they tested for the *old* midnight `#1a1a2e`. After `MOOD_TINT.neutral`
became `#9B3BFF`, neutral channels hit exactly the collision the code exists to prevent: hero/beat
badges rendered in the same purple as "selected". Both now test `#9B3BFF` and fall back to
`#2FA4FF`. Verified in-browser — beat badges render blue, distinct from the selection ring.

### Not invented
The mock's render cluster shows `EST RENDER $1.24`. The app has **no** render-cost forecast, and
inventing one would contradict how spend is tracked (recorded from actual provider usage). The slate
shows the reel's real spend-so-far instead, labelled `SPEND`.

### Decision taken: option (b) — the cross-scroll rework is DONE (see pass 4)

### ⚠ The decision, as originally posed
The handoff conflicts with itself here. Its scope rules say *"the app is authoritative for
structure… restyle, not rebuild"*, but screen 8 prescribes a **structural** change: remove
cross-scrolling, float the inspector beside a single large preview, and move the scenes into a
bottom filmstrip dock ("only scroll is the filmstrip itself").

The current editor implements a deliberate, heavily-commented scroll choreography — a sticky rail
that shrinks with `--shrink`, `--hold` spacers so the panel stays glued to the rail, and a
stabiliser so scroll height never drops mid-scroll (the comments cite shake and clamping bugs these
fix). Ripping that out is a rebuild of the screen's core interaction, and the render path can't be
end-to-end verified without paid API calls.

So the skin is applied and the layout is untouched, pending your call:
- **(a) Keep the current layout** (done — brand-consistent today), or
- **(b) Do the rework** as its own task, with the scroll choreography removed deliberately and the
  editing states re-verified.

### Verified
Storyboard at 1440×900 on an approved reel — no console/page errors. The storyboard **editing**
state (voice + music + spend slate + Render CTA) was not visually verified: no reel currently sits
at `storyboard` status in the dev DB.

## Component pass 4 — storyboard cross-scroll rework (DONE)

Owner chose **(b)**. The screen is now the mock's cutting room, and **the page no longer scrolls at
all** — verified: `main.scrollHeight === main.clientHeight` (900 === 900).

### Removed (the old scroll choreography)
`scrollRef`, the `--shrink`/`--hold` reset effect, `onShrinkScroll` + `COLLAPSE_PX`, the sticky
shrinking rail, the "hold" spacer, the scroll-height stabiliser, `compactOnShrink`, and **every**
`var(--shrink)` inline style across `SceneTimeline`, `SceneThumb`, `SceneMedia` and
`MotionDurationChip` (~25 call sites). Nothing scroll-linked remains.

### New structure
1. **Header** — unchanged (title, status pill, mono spend/minutes, pipeline stepper).
2. **Workspace row** (`flex-1`, fixed height) — a dark screening-room stage (`.stage` + `.stage-leak`
   + `.film-grain`) holding: the scene's 9:16 preview directly on the stage, the inspector floating
   beside it as a light panel, and — post-render — the finished reel as a third column.
   The light panel owns the **only** vertical scroll in the row.
3. **Filmstrip dock** — `SceneTimeline` in strip mode: scene count + mono runtime, sprocket band,
   fixed 74px numbered frames, sideways scroll confined to the strip.
4. **Render / gate bar** — unchanged, all four states intact (storyboard · spot-check · approved ·
   published).

Grid view is preserved as a full-area scrolling **overview** (verified: 11 scenes, beat badges,
`MOTION`/`STILL` labels, captions), with the dock hidden since the grid already shows every scene.

### Layout bugs found by measuring, not eyeballing
- **Panel/preview overlap.** My wrapper for the two control columns had no `order`, so it defaulted
  to `order:0` and rendered *before* the `order-1` preview. Fixed with `order-2`.
- **Preview column collapsed to 0px wide.** `aspect-ratio` on an inner box whose height was a
  percentage is a circular width↔height dependency — the browser resolved intrinsic width to 0 and
  the image overflowed under the panel. Measured it (`inner.w === 0`, `clickable.x === 134` vs
  `panel.x === 284`) rather than guessing. Fixed by moving the aspect onto the **column**, whose
  height is definite via flex stretch. Now: preview `x 260 w 248`, panel `x 532` — no overlap.
- The render preview needed `height:100%; width:auto` too, for the same reason.

### Known gaps
- In strip view the finished-reel column is `xl:` and up only; below that it's reachable via grid
  view. Worth revisiting if operators work on narrower screens.
- The storyboard **editing** state (voice + music + spend slate + Render CTA) still hasn't been seen
  in a browser — no reel sits at `storyboard` status in the dev DB. Only the post-render bar was
  exercised.

### Verified
1440×900, approved reel: no page scroll in either view, no console/page errors, 11 scenes, selection
and click-through working, grid↔strip toggle clean. `pnpm typecheck` clean (7/7), `pnpm lint` 0
errors, Tailwind compiles.

## Component pass 5 — the remaining screens (DONE)

| Screen / file | Change |
|---|---|
| `admin/page.tsx` | Nunito header + clapperboard month-spend slate, micro-label sections renamed to the mock's ("Invite test users", "Test users"), stat cards with mono figures, activity rows on `ReelStatusPill` + row hover |
| `admin/AdminInvites.tsx` | brand top edge, `Email · binds the invite to one person` inline hint, Role as a **segmented Tester/Admin toggle** (was a `<select>`), gradient "Create invite link" with icon, invite rows with role badge + mono link + relative age + Copy |
| `admin/AdminUsers.tsx` | avatar per user, `YOU` marker on the admin's own row, the mock's exact status palette (pending purple / active green / suspended clay) as dot pills, mono figures, micro-label headers |
| `channel/[id]/settings/ChannelSettings.tsx` | avatar + Nunito channel name in the header, Cancel + gradient Save, generation-mode radio cards with the mock's gradient check circle. `SectionLabel`/`Field` restyled — both are shared helpers, so the whole 514-line form inherited it |
| `channel/[id]/settings/page.tsx` | plumbed `avatarKey` through for the header avatar |
| `channel/new/NewChannelWizard.tsx` | header = Channels + K mark + Nunito "New channel" + gradient step dots + close X; each step now leads with the mock's `SETUP · STEP n OF 5` micro-label over a Nunito display heading (`STEP_TITLE`); `Field`/`SectionLabel` restyled → cascades across all 5 steps |
| `channel/[id]/details/page.tsx` | Nunito title + section labels, micro-label metadata, chip styling, mono tone values |
| `storyboard/StoryboardEditor.tsx` | post-render states polished: spot-check / ready-to-post / published headings on `ReelStatusPill`, and real logged views in mono when present |

Tone sliders already matched the spec's `accent-color:#9B3BFF` — `accent-accent` resolves to the
accent token, inherited from the token pass with no edit needed.

### Not built (feature, not skin)
- **The published mock** (`10-published.png`) shows a dedicated reel page with per-platform
  publishing rows (TikTok / YouTube Shorts / Facebook Reels, each with a Publish button) and
  performance metrics (views · likes · shares · avg watch). The app has **none** of that: publishing
  is YouTube-only plus manual "mark published", and the sole metric stored is `metricsViews`. Building
  it would mean inventing three integrations and three metrics. Instead the real published state now
  shows the status pill and **real** logged views. Multi-platform publishing is a product decision.
- **Invite revoke** (the mock's trash icon): `api/admin/invites` has only `POST`, no `DELETE`. A
  revoke button would have been dead, so it's omitted.
- **Channel-detail segmented filter** — still open from pass 2.

### Verified
Admin, channel settings, channel details and the new-channel wizard all screenshotted at 1360×950
signed in — no console or page errors on any. `pnpm typecheck` clean (7/7), `pnpm lint` **0 errors**
(4 pre-existing warnings; I removed the `STEP_SUBTITLE` I orphaned, so no new ones), Tailwind
compiles. Swept every new component class against the compiled CSS — all emitted except
`.gradient-border`, which has no consumer yet (Tailwind tree-shakes it; zero cost, kept as the
spec'd primitive for a future selected-card state).

## Status

All screens in the handoff are now restyled. Open items, all needing a product call rather than
code: multi-platform publishing + metrics (published mock), invite revoke (needs a `DELETE`),
channel-detail status filter, and the sidebar credits card (needs a real credits/spend source).

Not visually verified: the storyboard **editing** state (voice + music + spend slate + Render CTA) —
no reel sits at `storyboard` status in the dev DB.
