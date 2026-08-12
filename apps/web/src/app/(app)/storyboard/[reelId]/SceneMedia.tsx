'use client'
import { useState } from 'react'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes } from '@reels/db'

type Scene = InferSelectModel<typeof scenes>

export const fmtSecs = (secs: number) => `${Math.round(secs * 10) / 10}s`

// One scene's picture — the shared frame behind every surface that shows a scene: the stage player, a
// timeline clip's neighbours in the grid overview, the inspector's takes. Extracted from StoryboardEditor
// so the stage (SceneStage) and the overview can both draw a scene without importing the editor.
export function SceneMedia({
  scene, imgSrc, videoKey, showVideo, playVideo, loaded, onLoaded, onDuration, regenerating, animating, compact, frameClass, frameStyle, adaptAspect, frameAspect, defaultAspect, contain, children,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; showVideo: boolean; playVideo: boolean
  loaded: boolean; onLoaded: () => void; onDuration?: ((secs: number) => void) | undefined
  regenerating: boolean; animating: boolean
  // In the strip rail the tile collapses to a slim filmstrip (--shrink → 1); when set, the busy-overlay
  // caption collapses away with it so the tiny tile shows just the spinner, not cramped text.
  compact?: boolean
  // frameAspect fixes the frame's shape (e.g. '16 / 9' for a landscape, YouTube-style player); contain fits
  // the media inside it (letterboxed on black) instead of cropping. Without them: adaptAspect → media's own
  // aspect, else a 9:16 tile. frameStyle merges onto the frame box (e.g. scroll-linked border radius/width).
  // defaultAspect is the shape to hold UNTIL adaptAspect learns the media's own — pass the channel's real
  // output aspect and a landscape reel stops opening as a portrait box and snapping wide on load.
  frameClass?: string | undefined; frameStyle?: React.CSSProperties | undefined; adaptAspect?: boolean; frameAspect?: string | undefined; defaultAspect?: string | undefined; contain?: boolean; children?: React.ReactNode
}) {
  const hasMedia = Boolean(videoKey || imgSrc)
  const developClass = `style-develop ${loaded ? 'style-develop-in' : ''}`
  // With adaptAspect on, the frame matches the media's real aspect ratio (so non-9:16 reels aren't
  // cropped); otherwise it stays 9:16 for uniform timeline tiles. Defaults to 9:16 until the media loads.
  const [mediaAspect, setMediaAspect] = useState<string | null>(null)
  return (
    <div
      className={`group relative isolate w-full overflow-hidden rounded-xl border shadow-sm ${contain ? 'bg-black' : 'bg-subtle'} ${frameClass ?? 'border-border'}`}
      style={{ aspectRatio: frameAspect ?? (adaptAspect && mediaAspect ? mediaAspect : defaultAspect ?? '9 / 16'), ...frameStyle }}
    >
      {/* Shimmer sits behind the media (z-0) — shown while still generating or loading */}
      {(!hasMedia || !loaded) && (
        <div className="absolute inset-0 z-0 animate-shimmer bg-gradient-to-r from-subtle via-surface to-subtle bg-[length:200%_100%]" />
      )}
      {!hasMedia && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-[11px] text-faint">
          <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-accent/70" />
          Shooting scene {scene.idx}…
        </div>
      )}
      {showVideo && playVideo ? (
        <video
          key={videoKey}
          src={`/api/asset?key=${encodeURIComponent(videoKey!)}`}
          autoPlay muted loop playsInline
          onLoadedData={(e) => { e.currentTarget.muted = true; void e.currentTarget.play().catch(() => {}); onLoaded() }}
          onLoadedMetadata={(e) => { onDuration?.(e.currentTarget.duration); if (adaptAspect && e.currentTarget.videoWidth) setMediaAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
          // Force muted as a DOM PROPERTY (React's `muted` attribute is famously unreliable on mount — if it
          // doesn't stick the browser blocks autoplay), then kick playback off explicitly so the clip
          // autoplays on every scene select, including cached sources where the `autoPlay` attribute no-ops.
          // Also catch the already-ready (cached) case so the reveal isn't stuck waiting for onLoadedData.
          ref={(el) => { if (el) { el.muted = true; void el.play?.().catch(() => {}); if (el.readyState >= 2) { onLoaded(); if (el.duration) onDuration?.(el.duration); if (adaptAspect && el.videoWidth) setMediaAspect(`${el.videoWidth} / ${el.videoHeight}`) } } }}
          className={`absolute inset-0 z-10 h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${developClass}`}
        />
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={`Scene ${scene.idx}`}
          onLoad={(e) => { onLoaded(); if (adaptAspect && e.currentTarget.naturalWidth) setMediaAspect(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`) }}
          // Same guard for images: a cached image is already `complete` on mount and won't fire onLoad.
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) { onLoaded(); if (adaptAspect) setMediaAspect(`${el.naturalWidth} / ${el.naturalHeight}`) } }}
          className={`absolute inset-0 z-10 h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${developClass}`}
        />
      ) : null}
      {/* Reshoot overlay */}
      {regenerating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-ink/45 text-xs font-medium text-white backdrop-blur-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          {/* A dock frame is too small for the caption — the spinner alone carries it there. */}
          {!compact && <span>Reshooting…</span>}
        </div>
      )}
      {/* Animate overlay — long op, set a gentle expectation */}
      {animating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-ink/45 px-3 text-center text-xs font-medium text-white backdrop-blur-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          {/* A dock frame is too small for the caption — the spinner alone carries it there. */}
          {!compact && (
            <span className="flex flex-col items-center gap-1">
              Bringing this scene to life…
              <span className="text-[10px] font-normal text-white/70">takes about a minute</span>
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

// A motion scene's actual clip length — probed from the generated video's own metadata (not an estimate).
// Shows just the play glyph until the duration loads, or for a motion scene with no clip generated yet.
export function MotionDurationChip({ clipKey, compact = false }: { clipKey?: string | undefined; compact?: boolean }) {
  const [secs, setSecs] = useState<number | null>(null)
  return (
    <>
      {/* Animated-scene chip — icon + clip length. In a dock frame there's only room for the icon, which
          still marks which scenes move. */}
      <span
        className={`absolute right-1 top-1 z-20 inline-flex items-center gap-0.5 rounded-full bg-accent/85 py-0.5 font-mono text-[10px] font-700 tabular-nums text-white backdrop-blur ${compact ? 'px-1' : 'px-1.5'}`}
        title="Moves in the final reel"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 11 6-3.5v9L15 13" /></svg>
        {!compact && <span className="whitespace-nowrap">{secs != null ? fmtSecs(secs) : null}</span>}
      </span>
      {clipKey && (
        <video
          src={`/api/asset?key=${encodeURIComponent(clipKey)}`}
          preload="metadata"
          muted
          playsInline
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0"
          onLoadedMetadata={(e) => setSecs(e.currentTarget.duration)}
        />
      )}
    </>
  )
}
