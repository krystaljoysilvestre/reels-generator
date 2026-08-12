'use client'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes } from '@reels/db'
import { sceneSeconds, sceneStarts, totalSeconds, fmtClock, rulerTicks } from './scene-timing'

type Scene = InferSelectModel<typeof scenes>

// ── The timeline dock ────────────────────────────────────────────────────────────
// The cutting room's bench (Storyboard v3). Two parts:
//
//   TRANSPORT ROW — where the reel is, what it's made of, and the one button that renders it. Always on.
//   TRACKS        — the reel's SHAPE: a time ruler, the video clips sized in PROPORTION to how long they
//                   run, and the two audio tracks under them (voice, music). Collapsible.
//
// The proportional clips are the point. The filmstrip this replaces gave every scene the same 84px frame,
// which drew a six-scene reel as six equal beats — so a 19s closer and a 9s beat looked identical and the
// dock said nothing about pacing. Width here IS duration (see scene-timing.ts for why it's an estimate),
// so a glance reads the cut: where the reel lingers, where it rushes, and how much of it one scene owns.
export function Timeline({
  scenes: list, sceneImages, selectedIdx, onSelect, onArrow, loading,
  tracksOpen, onToggleTracks, viewToggle, controls, actions,
  voiceLabel, onEditVoice, musicLabel, onEditMusic,
}: {
  scenes: Scene[]
  sceneImages: Record<number, string>
  selectedIdx: number | null
  onSelect: (idx: number) => void
  onArrow: (d: number) => void
  loading: string | null
  tracksOpen: boolean
  onToggleTracks: () => void
  /** The strip/grid view switch — the dock's, but owned by the editor. */
  viewToggle: React.ReactNode
  /** Voice · music · effects chips (the editor owns their popovers). */
  controls: React.ReactNode
  /** Spend + Render reel. */
  actions: React.ReactNode
  voiceLabel: string
  onEditVoice: () => void
  musicLabel: string
  onEditMusic: () => void
}) {
  const total = totalSeconds(list)
  const starts = sceneStarts(list)
  const playhead = selectedIdx != null && total > 0 ? ((starts[selectedIdx] ?? 0) / total) * 100 : 0

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
    if (e.key === 'ArrowRight') { e.preventDefault(); onArrow(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onArrow(-1) }
  }

  return (
    <div className="flex-shrink-0 border-t border-night-seam bg-night-dock px-5 pb-4 pt-3">
      {/* ── Transport row ── */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        {/* Where the selected scene starts, against the whole reel. No play button: until the reel is
            rendered there is no cut to play, and a transport that does nothing is a lie about the surface.
            Once it IS rendered, the finished-reel screen plays it. */}
        <span className="mono-value text-sm text-night-ink" title="Where this scene starts in the reel">
          {fmtClock(starts[selectedIdx ?? -1] ?? 0)} <span className="text-night-rule">/ {fmtClock(total)}</span>
        </span>

        <button
          type="button"
          onClick={onToggleTracks}
          aria-expanded={tracksOpen}
          className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-600 text-night-lilac transition-colors hover:border-white/20 hover:bg-white/10"
          title={tracksOpen ? 'Hide the tracks' : 'Show the tracks'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
            className="transition-transform duration-200" style={{ transform: tracksOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
          {list.length} {list.length === 1 ? 'scene' : 'scenes'}
        </button>

        {viewToggle}

        <span className="hidden h-[22px] w-px bg-white/10 sm:block" aria-hidden />

        {controls}

        <div className="hidden flex-1 md:block" />

        {actions}
      </div>

      {/* ── Tracks ── */}
      {tracksOpen && (
        <div className="flex gap-3">
          {/* Gutter — names the three tracks. Padded to clear the ruler above the clips. */}
          <div aria-hidden className="hidden w-[52px] flex-shrink-0 flex-col gap-[7px] pt-5 sm:flex">
            <div className="flex h-16 items-center text-2xs font-700 uppercase tracking-[0.06em] text-night-gutter">Video</div>
            <div className="flex h-[26px] items-center gap-1.5 text-2xs font-600 text-night-gutter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B3BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2" /></svg>
              VO
            </div>
            <div className="flex h-[26px] items-center gap-1.5 text-2xs font-600 text-night-gutter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF2D9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              Mus
            </div>
          </div>

          <div className="relative min-w-0 flex-1">
            {/* Ruler — five marks across the reel. */}
            <div className="mb-1 flex h-4" aria-hidden>
              {rulerTicks(total).map((t, i) => (
                <div key={i} className="flex-1 border-l border-night-seam pl-1 font-mono text-[9px] tabular-nums text-night-rule">{t}</div>
              ))}
            </div>

            {/* Video track — the clips, sized by duration. */}
            <div
              className="strip-scroll flex h-16 gap-[5px] overflow-x-auto"
              role="listbox" aria-label="Scenes" tabIndex={0} onKeyDown={onKeyDown}
            >
              {list.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-[9px] border border-dashed border-white/15 text-xs text-night-faint">
                  No scenes yet
                </div>
              )}
              {list.map((scene) => (
                <Clip
                  key={scene.idx}
                  scene={scene}
                  secs={sceneSeconds(scene)}
                  imgSrc={sceneImages[scene.idx]}
                  selected={scene.idx === selectedIdx}
                  busy={loading === `regen-${scene.idx}` || loading === `animate-${scene.idx}`}
                  onSelect={onSelect}
                />
              ))}
            </div>

            {/* Voice track — one continuous narration under the whole reel. */}
            <TrackRow
              label={voiceLabel}
              onClick={onEditVoice}
              title="Change the narrator voice"
              className="border-accent/20 bg-gradient-to-r from-brand-blue/[0.16] to-accent/[0.16] text-night-lilac"
              hatch="repeating-linear-gradient(90deg,rgba(255,255,255,0.35) 0 2px,transparent 2px 5px)"
            />
            {/* Music track. */}
            <TrackRow
              label={musicLabel}
              onClick={onEditMusic}
              title="Change the music bed"
              className="border-brand-pink/20 bg-gradient-to-r from-brand-pink/[0.14] to-brand-orange/[0.14] text-night-rose"
              hatch="repeating-linear-gradient(90deg,rgba(255,255,255,0.28) 0 3px,transparent 3px 8px)"
            />

            {/* Playhead — parked at the start of the selected scene. */}
            {list.length > 0 && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-5 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                style={{ left: `${playhead}%` }}
              >
                <div className="absolute -left-1 -top-1.5 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// One scene as a timeline clip. `flex: <secs>` is what makes width mean duration; the min-width keeps a
// 20-scene long-form reel's short beats clickable (the row scrolls sideways instead of collapsing them).
function Clip({
  scene, secs, imgSrc, selected, busy, onSelect,
}: {
  scene: Scene; secs: number; imgSrc?: string | undefined; selected: boolean; busy: boolean; onSelect: (idx: number) => void
}) {
  const state = busy ? 'rendering' : scene.tier === 'video' ? 'motion' : 'still'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(scene.idx)}
      title={`Scene ${scene.idx} · ${secs}s · ${state}`}
      className="relative min-w-[2.25rem] flex-shrink-0 overflow-hidden rounded-[9px] bg-night-plum transition-[transform,filter] duration-150 hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ flex: `${secs} 1 0` }}
    >
      {imgSrc ? (
        <img src={imgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-night-plum via-night-plum-lit to-night-plum bg-[length:200%_100%]" aria-hidden />
      )}
      {/* Top-lit sheen, so a clip reads as a lit frame rather than a flat crop. */}
      <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.16),transparent_60%)]" />
      {selected && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[9px] shadow-[inset_0_0_0_2px_#fff,inset_0_0_0_4px_#9B3BFF]" />
      )}
      <span className="absolute left-[7px] top-[5px] font-mono text-[10px] font-700 tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
        {String(scene.idx).padStart(2, '0')}
      </span>
      <span className="absolute bottom-[5px] left-[7px] font-mono text-[9px] tabular-nums text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
        {busy ? '···' : `${secs}s`}
      </span>
      {/* What this scene IS at render — the strip's own vocabulary. */}
      <span className="absolute right-1.5 top-[5px] rounded-full bg-black/40 px-1.5 py-px text-[8px] font-800 uppercase tracking-[0.04em] text-white backdrop-blur-[4px]">
        {state}
      </span>
      {busy && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-night-800/40">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
        </span>
      )}
    </button>
  )
}

// An audio track: its label, a waveform-ish hatch standing for the whole reel, and the way to change it.
function TrackRow({
  label, onClick, title, className, hatch,
}: { label: string; onClick: () => void; title: string; className: string; hatch: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`mt-[7px] flex h-[26px] w-full items-center gap-2.5 rounded-lg border pl-2.5 pr-2 text-left transition-colors hover:brightness-125 ${className}`}
    >
      <span className="flex-shrink-0 truncate text-2xs font-600">{label}</span>
      <span aria-hidden className="h-3 flex-1 rounded-sm opacity-50" style={{ background: hatch }} />
      <span className="inline-flex flex-shrink-0 items-center gap-1 text-[9px] font-700">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
        Change
      </span>
    </button>
  )
}
