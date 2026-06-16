# Design conventions

How the operator web app (`apps/web`) should look and feel. Read this before
building any UI. Design pegs: **Stripe, Linear, Apple, Notion** — clean neutrals,
generous whitespace, one indigo accent, soft shadows, hairline borders.

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
- **No layout shift.** The scroll container (`<main>`) uses
  `overflow-y-auto [scrollbar-gutter:stable]` so a scrollbar appearing (e.g. a
  dropdown opening) never reflows content sideways. Keep that on any scroller.
- **Build from the primitives**, don't reinvent: `.btn-*`, `.card`, `.input`,
  `.badge`, `.nav-link` in `globals.css`; tokens in `tailwind.config.ts`. No
  ad-hoc colors — use the palette (`ink/muted/faint`, `accent*`, semantic
  `*-soft` tints).
- **Custom controls over native.** Use the shared `Dropdown`
  (`src/components/Dropdown.tsx`) instead of bare `<select>` so menus match the
  design system and animate. Avatars use `ChannelAvatar`
  (`src/components/ChannelAvatar.tsx`) — uploaded image, else a deterministic
  gradient monogram.
- **Icons:** outlined line icons (stroke, ~1.7px), consistent sizing. Category
  icons may carry a tinted color chip.
- **Light theme** is the default; if dark mode is ever added, do it as a toggle.
- **Type:** Inter for UI, JetBrains Mono for IDs/numbers/cost (tabular-nums).

## Shared components

- `src/components/Dropdown.tsx` — animated, click-outside + Escape to close,
  scrollable, single-select.
- `src/components/ChannelAvatar.tsx` — image-or-gradient-monogram; pure render
  (usable in server components). Exposes `avatarGradient(name)` +
  `avatarInitials(name)` for custom placements (e.g. the upload picker).
