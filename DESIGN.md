# Design conventions

How the creator web app (`apps/web`) should look and feel. Read this before
building any UI.

Kendrix is a **cutting room**, not a dashboard. Two worlds, deliberately:

- **The workspace** — a light, purple-tinted white canvas (`#FBFAFF`) with
  hairline borders, generous whitespace and soft shadows. This is where you
  read, decide and type.
- **The dark world** — the screening-room stage, the timeline dock, the auth
  panes, the finished-reel screen. Near-black plum, lit by the brand gradient
  and a slow light-leak. This is where you WATCH.

Colour is the brand gradient (blue → purple → pink, with an orange tail), used
for one primary action per surface and for active states — never as decoration
spread across a screen.

## Standing rules (apply to every build)

- **Smooth animations, always.** Interactive and entering elements animate
  (dropdowns, modals, step transitions, hovers). Keep them fast and subtle
  (~120–180ms, ease-out). Reusable keyframes live in `globals.css`:
  `animate-dropdown`, `animate-fade-in`, `animate-pop-in`. A global
  `prefers-reduced-motion` block disables motion for users who ask — never
  remove it.
- **Responsive layouts, always.** Every screen must hold up from mobile → wide
  desktop. Use Tailwind breakpoints (`sm:`/`md:`/`lg:`), fluid widths
  (`w-full sm:w-64`), responsive grids (`grid-cols-2 sm:grid-cols-3`), and
  responsive padding. Don't hard-code widths that overflow small screens. The
  app shell (`Shell.tsx`) hides the sidebar behind a hamburger drawer below `md`.
  Where a docked panel can't fit beside its subject, MOVE it (flex-direction),
  don't render a second copy — two instances mean two sets of the same DOM ids
  and two independent drafts of the same field.
- **No layout shift.** The scroll container (`<main>`) uses
  `overflow-y-auto [scrollbar-gutter:stable]` so a scrollbar appearing (e.g. a
  dropdown opening) never reflows content sideways. Keep that on any scroller.
- **Build from the primitives**, don't reinvent: `.btn-*`, `.card`, `.surface`,
  `.input`, `.badge`, `.micro-label`, `.mono-*`, `.nav-link` in `globals.css`;
  tokens in `tailwind.config.ts`. No ad-hoc colors — use the palette. If a shade
  is genuinely missing (this happens most on the dark surfaces), ADD a named
  token with a comment saying what role it plays, rather than inlining a hex.
- **Custom controls over native.** Use the shared `Dropdown`
  (`src/components/Dropdown.tsx`) instead of bare `<select>` so menus match the
  design system and animate. Avatars use `ChannelAvatar`
  (`src/components/ChannelAvatar.tsx`) — uploaded image, else a deterministic
  gradient monogram.
- **Icons:** outlined line icons (stroke, ~1.8px), consistent sizing. Category
  icons may carry a tinted color chip.
- **Light theme** is the default for the workspace; the dark world is a
  deliberate *place*, not a theme toggle. If a real dark mode is ever added, do
  it as a toggle.
- **Never a control that does nothing.** A play button with no cut to play, a
  Cancel with no cancel path, a "credits" figure with no credit system — leave
  it out and comment where it would go. This is a house rule, and it outranks a
  mock: design handoffs draw affordances the engine can't yet back.
- **A number shown twice must be the same number.** One scene should not read
  as 13s on the timeline and 10s on the stage. Pick the basis, share it (e.g.
  `storyboard/[reelId]/scene-timing.ts`), and use it on every surface.

## Type

Three faces, loaded via `next/font` in `app/layout.tsx` and wired to Tailwind:

| Role | Face | Tailwind | Where |
|---|---|---|---|
| UI + body | **Mulish** | `font-sans` (default) | everything not below |
| Display | **Nunito** | `font-display` | `h1`–`h3`, page + panel titles |
| Mono | **Space Mono** | `font-mono` | numbers, money, IDs, timecode, slate labels |

Weights are exposed numerically (`font-400` … `font-900`) because the design
spec talks in weights. Mono always pairs with `tabular-nums` when it carries a
value that changes.

`public/caption-fonts.css` loads eight further faces — those belong to the
**burned-in caption presets** (`CaptionPreview`, and Remotion's
`SubtitleOverlay` at render). They are not part of the UI type system; never
reach for them for chrome.

## Palette

Full token set in `apps/web/tailwind.config.ts`. The shape of it:

- **Surfaces** `bg` (canvas) · `surface` (cards, sidebar, header) · `subtle`,
  `subtle-strong` (insets, hovers)
- **Hairlines**, faint → strong: `border-soft` · `border` · `border-mid` ·
  `border-strong`
- **Text** `ink` (primary) · `body` (long-form) · `muted` · `faint` ·
  `faint-soft` (micro-labels)
- **Accent** `accent` (the gradient's purple, for single-colour use) ·
  `accent-hover` · `accent-soft` · `accent-ring`
- **Brand gradient stops** `brand-blue` · `brand-violet` · `brand-purple` ·
  `brand-pink` · `brand-orange`, plus ready-made gradients in
  `backgroundImage`: `bg-brand` (4-stop, hero sweeps), `bg-brand-3` (the
  workhorse for CTAs and active states), `bg-brand-wash` / `-faint` (6–12%
  tints), `bg-pair-*` (avatar and icon-chip pairs), `bg-plum`
- **The dark world** `night.*` — `night-800` (stage), `night-plum` /
  `-plum-lit`, `night-dock`, `night-seam` (hairline), plus its own text ladder
  (`night-ink` / `-body` / `-muted` / `-faint`), its timeline tones
  (`night-rule`, `night-gutter`, `night-lilac`, `night-rose`, `night-live`,
  `night-pending`) and dark-legible semantics (`night-danger`,
  `night-success*`)
- **Semantic** `success` · `warning` · `danger` with `*-soft` tints
  (`positive`/`negative` are older aliases, still used)

## Primitives (`globals.css`)

**Buttons** `.btn` base; `.btn-primary` (gradient + glow; `.btn-accent` is its
alias), `.btn-secondary`, `.btn-ghost`, `.btn-danger`, and `.btn-dark` — the
glass secondary for a control sitting ON a night surface. Sizes `.btn-sm` /
`.btn-md` / `.btn-lg`; `.btn-glow` gives a primary CTA its resting presence.

**Surfaces** `.card`, `.card-elevated`, `.surface`, `.card-channel` (brand glow
bleeding from a corner), `.brand-glow` (the dark world's radial light).

**Inputs** `.input`, `.input-dark` (night panes), `.input-error`.

**Labels** `.micro-label` (UI voice, uppercase tracked) · `.mono-label` (slate
voice: `SCENE 01 / 06`, `SPEND`) · `.mono-value` · `.badge`.

**Cutting-room motif** `.stage` + `.stage-leak` + `.film-grain` compose the
screening room. `.dock-chip` is a control on the dock. `.strip-scroll` is the
dark-world sideways scrollbar. `.clapper-band` + `.slate` / `.slate-label` /
`.slate-value` are the clapperboard slate. `.style-develop` / `-in` gives an
image a polaroid develop-in reveal.

**Gradient helpers** `.gradient-text`, `.gradient-border` (selected-card
double-background trick), `.gradient-soft-wash`.

## Shared components

- `Dropdown.tsx` — animated, click-outside + Escape to close, single-select.
- `ChannelAvatar.tsx` — image-or-gradient-monogram; pure render (usable in
  server components). Exposes `avatarGradient(name)` + `avatarInitials(name)`.
- `Toast.tsx` — `ToastProvider` / `useToast`.
- `GenreLoader.tsx` — a loading glyph whose SHAPE varies by genre and colour by
  the channel's mood tint. Use it wherever the creator waits on generation.
- `StatusTicker.tsx` / `PipelinePhaseStepper.tsx` — in-character progress copy
  and the build-phase journey strip.
- `ReelStatusPill.tsx` · `PlatformPicker.tsx` · `Wordmark.tsx` ·
  `Typewriter.tsx` · `StoryGenerating.tsx` · `RenderAlertWatcher.tsx`.
- `CaptionPreview.tsx` — the animated preview of a channel's burned-in caption
  preset. It is the ONLY caption preview surface besides the storyboard stage's
  static read; Remotion's `SubtitleOverlay` is the truth both answer to. If you
  need caption type anywhere else, scale it the way the renderer does
  (`height / 1920`), and say so in a comment.

## Reference designs

Design handoffs arrive as self-contained bundles at the repo root
(`Kendrix Caption Styles (bundle).html`, `Kendrix Storyboard v3 (bundle).html`).
They are the design TRUTH for the surface they cover — transcribe their numbers,
don't eyeball them. The real markup is a JSON string in the
`script[type="__bundler/template"]` tag near the end of the file.
