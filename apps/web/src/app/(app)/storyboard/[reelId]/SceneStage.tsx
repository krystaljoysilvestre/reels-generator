'use client'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes } from '@reels/db'
import type { CaptionStyle } from '@reels/core'
import { SceneMedia } from './SceneMedia'

type Scene = InferSelectModel<typeof scenes>

// ── The screening room ───────────────────────────────────────────────────────────
// The stage is the storyboard's left half (Storyboard v3): the selected scene, played big in a dark room,
// with the chrome a monitor carries — which scene of how many, how long it runs, where it sits in the reel,
// and the way to step to the next one. Everything editable lives in the inspector beside it; nothing here
// changes the reel, so the stage stays a place to LOOK.
//
// There is deliberately no play/mute transport. Until the reel renders there is no cut to play and no
// audio to mute (a motion scene's clip is silent), and a transport control that does nothing would be a
// lie about the surface. Once the reel IS rendered, the finished-reel screen plays it with real controls.
export function SceneStage({
  scene, sceneNo, total, secs, startPct, spanPct, imgSrc, variations, activeVar, onCycleVar,
  loaded, markLoaded, regenerating, animating, moodTint, reelAspect, captionStyle,
  onPrev, onNext, canPrev, canNext,
}: {
  scene: Scene
  sceneNo: number
  total: number
  /** Estimated seconds this scene runs (scene-timing.ts). */
  secs: number
  /** Where this scene starts, as a % of the reel — the position bar's fill. */
  startPct: number
  /** How much of the reel this scene owns, as a % — the position bar's lit segment. */
  spanPct: number
  imgSrc?: string | undefined
  variations: string[]
  activeVar: number
  onCycleVar: () => void
  loaded: boolean
  markLoaded: (idx: number) => void
  regenerating: boolean
  animating: boolean
  moodTint: string
  /** The channel's own output aspect ("1920 / 1080"), held until the media reports its own. */
  reelAspect: string
  /** The channel's burned-in caption look, so the stage shows the line the way a viewer meets it. */
  captionStyle: CaptionStyle | null
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}) {
  const isVideo = scene.tier === 'video'
  const videoKey = variations[activeVar]
  const showVideo = isVideo && Boolean(videoKey)
  const [showFull, setShowFull] = useState(false)
  const [fullLoaded, setFullLoaded] = useState(false)
  const [lightboxAspect, setLightboxAspect] = useState<string | null>(null)
  const openFull = () => { if (imgSrc) { setFullLoaded(false); setLightboxAspect(null); setShowFull(true) } }

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-5 sm:px-8">
      {/* ── Top chrome: what you're looking at (left), how to move through it (right) ──
          Dark glass, not the design's white-on-dark: a scene's frame can be a bright daylit office as
          easily as a night exterior, and white/8% chrome disappears on the bright ones. */}
      <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3 sm:left-5 sm:right-5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-2xl border border-white/[0.18] bg-black/45 px-3 py-1.5 font-mono text-[11px] font-700 tabular-nums text-white backdrop-blur-[8px]">
            SCENE {String(sceneNo).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          {/* One duration per scene — the same estimate the timeline clips and the inspector show. A
              motion scene's generated clip has its own length, but surfacing it here made one scene read
              as two different lengths on one screen. */}
          <span className="rounded-2xl border border-white/[0.18] bg-black/45 px-2.5 py-1.5 font-mono text-[11px] font-600 tabular-nums text-night-lilac backdrop-blur-[8px]">
            {secs}s
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StageButton onClick={openFull} disabled={!imgSrc} label="Expand this scene">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </StageButton>
          <span className="mx-0.5 h-[22px] w-px bg-white/[0.16]" aria-hidden />
          <StageButton onClick={onPrev} disabled={!canPrev} label="Previous scene">
            <path d="m15 18-6-6 6-6" />
          </StageButton>
          <StageButton onClick={onNext} disabled={!canNext} label="Next scene">
            <path d="m9 18 6-6-6-6" />
          </StageButton>
        </div>
      </div>

      {/* ── The frame ── Height-driven so the whole scene always fits without the page scrolling. */}
      <div className="relative flex h-full max-h-full min-h-0 items-center justify-center">
        {/* A soft mood-tinted glow behind the frame — the lamp in the screening room. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 z-0 rounded-[3rem] opacity-30 blur-2xl"
          style={{ background: `radial-gradient(60% 55% at 50% 42%, ${moodTint}, transparent 72%)` }}
        />
        {/* A FLEX container, so the frame inside is a flex item: that's what lets its width be computed
            from its definite height × aspect-ratio. As a block in normal flow, `width: auto` would mean
            "stretch to the parent" — and the parent's width comes from the frame — so it collapsed to 0. */}
        <div
          onClick={openFull}
          title={imgSrc ? 'Expand this scene' : undefined}
          className={`group/preview relative z-10 flex h-full min-h-0 ${imgSrc ? 'cursor-zoom-in' : ''}`}
        >
          <SceneMedia
            scene={scene}
            imgSrc={imgSrc}
            videoKey={videoKey}
            showVideo={showVideo}
            playVideo
            frameStyle={{ height: '100%', width: 'auto', flex: 'none' }}
            defaultAspect={reelAspect}
            loaded={loaded}
            onLoaded={() => markLoaded(scene.idx)}
            regenerating={regenerating}
            animating={animating}
            frameClass="!border-0 !rounded-[22px] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.6)]"
            adaptAspect
          >
            {/* The line, as a viewer meets it. */}
            {captionStyle && <StageCaption style={captionStyle} text={scene.narrationText} />}

            {/* Position bar — where this scene sits in the reel, and how much of it this scene owns. */}
            <div className="pointer-events-none absolute bottom-4 left-3.5 right-3.5 z-20">
              <div className="h-1 overflow-hidden rounded-sm bg-white/25">
                <div className="relative h-full" style={{ marginLeft: `${startPct}%`, width: `${Math.max(spanPct, 1.5)}%` }}>
                  <span className="absolute inset-0 rounded-sm bg-brand-3" />
                </div>
              </div>
            </div>

            {/* Variation cycler — only when an animated scene has 2+ takes (after a render). */}
            {showVideo && variations.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCycleVar() }}
                className="badge absolute bottom-8 right-3.5 z-20 bg-black/55 text-white backdrop-blur hover:bg-black/70"
                title={`Take ${activeVar + 1} of ${variations.length} — click to switch`}
              >
                ▶ {activeVar + 1}/{variations.length}
              </button>
            )}
          </SceneMedia>
        </div>
      </div>

      {/* Large preview lightbox — portaled to <body> so its `fixed` overlay isn't trapped by a transformed
          ancestor (which would become its containing block). */}
      {showFull && imgSrc && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm" onClick={() => setShowFull(false)}>
          <div className="relative h-[88vh] max-w-[94vw] overflow-hidden rounded-xl bg-ink shadow-lg" style={{ aspectRatio: lightboxAspect ?? '9 / 16' }} onClick={(e) => e.stopPropagation()}>
            {!fullLoaded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </div>
            )}
            <ZoomPan>
              {showVideo ? (
                <video
                  src={`/api/asset?key=${encodeURIComponent(videoKey!)}`}
                  autoPlay muted loop playsInline
                  onLoadedData={(e) => { e.currentTarget.muted = true; void e.currentTarget.play().catch(() => {}); setFullLoaded(true) }}
                  onLoadedMetadata={(e) => { if (e.currentTarget.videoWidth) setLightboxAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
                  // Force muted (React's `muted` attr is unreliable → blocks autoplay) and kick off play().
                  ref={(el) => { if (el) { el.muted = true; void el.play?.().catch(() => {}); if (el.readyState >= 2) { setFullLoaded(true); if (el.videoWidth) setLightboxAspect(`${el.videoWidth} / ${el.videoHeight}`) } } }}
                  className="pointer-events-none h-full w-full select-none object-contain transition-opacity duration-200"
                  style={{ opacity: fullLoaded ? 1 : 0 }}
                />
              ) : (
                <img
                  src={imgSrc}
                  alt={`Scene ${scene.idx}`}
                  draggable={false}
                  onLoad={(e) => { setFullLoaded(true); if (e.currentTarget.naturalWidth) setLightboxAspect(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`) }}
                  ref={(el) => { if (el?.complete && el.naturalWidth > 0) { setFullLoaded(true); setLightboxAspect(`${el.naturalWidth} / ${el.naturalHeight}`) } }}
                  className="pointer-events-none h-full w-full select-none object-contain transition-opacity duration-200"
                  style={{ opacity: fullLoaded ? 1 : 0 }}
                />
              )}
            </ZoomPan>
            <button
              type="button"
              onClick={() => setShowFull(false)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur transition-colors hover:bg-ink/75"
              aria-label="Close preview"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// A glass control on the stage — the monitor's own buttons.
function StageButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-white/[0.18] bg-black/45 text-white backdrop-blur-[8px] transition-colors hover:bg-black/60 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-black/45"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
    </button>
  )
}

// ── The line, as a viewer meets it ───────────────────────────────────────────────
// A STATIC read of the channel's caption style over the stage frame: its typeface, weight, size, case,
// colour and wash. Motion and per-word emphasis are deliberately NOT emulated here — `CaptionPreview`
// (wizard/settings) owns the animated preview and Remotion's `SubtitleOverlay` owns the burned-in truth.
// This exists so the stage stops showing a naked picture while the reel's words live somewhere else.
//
// SIZING follows the renderer's basis exactly: `SubtitleOverlay` scales every px by `height / 1920`, so a
// 1920×1080 landscape cut gets captions at 0.5625× while a 1080×1920 portrait one gets 1×. Dividing by
// WIDTH instead (the 1080-wide basis the presets were transcribed against) would draw a long-form
// caption 1.78× too large. `cqb` — the container's BLOCK size — does that division in CSS, so the preview
// stays exact at any stage size without measuring anything.
function StageCaption({ style, text }: { style: CaptionStyle; text: string }) {
  // ONE CUE, not the scene's whole narration: the reel shows a few words at a time. The size of a cue is
  // not a guess — computeTimings chunks captions at 7 words / 84 chars (its DEFAULT_CONFIG.subtitle), so
  // the stage shows the scene's FIRST cue at exactly that width. A full sentence here would cover the
  // picture in a way the finished reel never does.
  const words = text.trim().split(/\s+/).filter(Boolean)
  let line = ''
  for (const w of words.slice(0, 7)) {
    if (line && `${line} ${w}`.length > 84) break
    line = line ? `${line} ${w}` : w
  }
  if (!line) return null

  const px = (n: number) => `calc(${n} * 100cqb / 1920)`
  const inset = style.position === 'bottom' ? Math.max(12.5, style.bottomInsetPct ?? 0) : 12.5
  const band: React.CSSProperties =
    style.position === 'top' ? { top: `${inset}%`, alignItems: 'flex-start' }
      : style.position === 'center' ? { top: 0, bottom: 0, alignItems: 'center' }
        : { bottom: `${inset}%`, alignItems: 'flex-end' }

  return (
    // The query container is its own absolutely-positioned box (inset-0), not the frame: the frame takes
    // its width from an aspect-ratio, and `container-type: size` on it would fight that.
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[15] [container-type:size]">
      {/* A wash over the picture with no visible edge, not a box around the words — the caption system's
          first rule (contrast comes from the scrim, never from a heavy stroke). */}
      {style.backplate === 'scrim' && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${style.scrimPct ?? 46}%`,
            background: `linear-gradient(to top, rgba(0,0,0,${style.scrimAlpha ?? 0.62}), rgba(0,0,0,0))`,
          }}
        />
      )}
      <div className="absolute inset-x-0 flex justify-center px-[6%]" style={band}>
        <span
          style={{
            fontFamily: style.fontFamily,
            fontWeight: style.fontWeight,
            fontSize: px(style.fontSizePx),
            lineHeight: style.lineHeight,
            letterSpacing: `${style.letterSpacingEm}em`,
            fontStyle: style.italic ? 'italic' : 'normal',
            textTransform: style.uppercase ? 'uppercase' : 'none',
            color: style.color,
            textAlign: 'center',
            textWrap: 'balance',
            // `bar`/`block` backplates ARE a box by design; scrim and none are not.
            ...(style.backplate === 'block' || style.backplate === 'bar'
              ? { background: 'rgba(0,0,0,0.72)', padding: `${px(10)} ${px(22)}`, borderRadius: px(8) }
              : {}),
            ...(style.shadow === 'none' ? {} : { textShadow: `0 ${px(style.fontSizePx * 0.07)} ${px(style.fontSizePx * 0.32)} rgba(0,0,0,${style.shadowAlpha ?? 0.45})` }),
          }}
        >
          {line}
        </span>
      </div>
    </div>
  )
}

// Zoom + pan wrapper for the preview lightbox: scroll wheel or ± buttons to zoom, drag to pan when
// zoomed, double-click to toggle. Resets to fit when zoomed back to 1×.
function ZoomPan({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const clamp = (s: number) => Math.min(5, Math.max(1, Math.round(s * 100) / 100))
  const setZoom = (s: number) => {
    const ns = clamp(s)
    setScale(ns)
    if (ns === 1) { setTx(0); setTy(0) }
  }

  return (
    <div
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      onWheel={(e) => { setZoom(scale - e.deltaY * 0.003) }}
      onDoubleClick={() => setZoom(scale > 1 ? 1 : 2.5)}
      onPointerDown={(e) => { if (scale === 1) return; drag.current = { x: e.clientX, y: e.clientY, tx, ty }; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (!drag.current) return; setTx(drag.current.tx + (e.clientX - drag.current.x)); setTy(drag.current.ty + (e.clientY - drag.current.y)) }}
      onPointerUp={() => { drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
    >
      <div
        className="h-full w-full"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: dragging ? 'none' : 'transform 0.12s ease-out' }}
      >
        {children}
      </div>
      {/* Zoom controls — bottom center; stop propagation so clicks don't start a pan or close the modal */}
      <div
        className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-ink/55 p-0.5 text-white backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={() => setZoom(scale - 0.5)} disabled={scale <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Zoom out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
        </button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-[3rem] rounded-full px-2 text-xs font-medium tabular-nums hover:bg-white/15" aria-label="Reset zoom">{Math.round(scale * 100)}%</button>
        <button type="button" onClick={() => setZoom(scale + 0.5)} disabled={scale >= 5} className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Zoom in">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}
