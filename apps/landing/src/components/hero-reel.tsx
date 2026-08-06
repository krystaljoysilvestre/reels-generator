'use client'

import { useEffect, useRef, useState } from 'react'
import { CropMarks } from './crop-marks'

/**
 * The hero trailer — "Every Story Begins Here".
 *
 * PROVENANCE: this is NOT pipeline output. It is hand-cut from the same engines the product runs
 * (nano-banana + flux stills, Kling motion, ElevenLabs voice and score) plus screen captures of the
 * real app. The figcaption therefore reads "Kendrix Studio", and the real pipeline reel belongs in the
 * screening room further down the page. Never relabel this as something the pipeline produced.
 *
 * It autoplays muted, which is why the trailer carries burned titles — muted is the default state of a
 * hero, so the titles are how the story reaches anyone who never unmutes.
 */
export function HeroReel() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    // Respect the OS setting: no ambient motion, just the poster until someone asks for it.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Autoplay can still be refused (low power mode, data saver) — the poster is the fallback, so a
    // rejected promise is not an error worth surfacing.
    void v.play().catch(() => {})
  }, [])

  const toggleSound = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (v.paused) void v.play().catch(() => {})
  }

  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-[20px] border border-white/[0.14] bg-night shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85),0_0_0_7px_rgba(255,255,255,0.03)]">
      <video
        ref={videoRef}
        src="/hero/trailer.mp4"
        poster="/hero/trailer-poster.jpg"
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* The frame keeps its crop marks — the design treats the hero as a film frame, not a player. */}
      <CropMarks />

      {/* Sound is opt-in and the only control — a hero is watched, not operated. */}
      <button
        type="button"
        onClick={toggleSound}
        aria-label={muted ? 'Unmute the trailer' : 'Mute the trailer'}
        className="mono absolute bottom-3.5 right-3.5 inline-flex items-center gap-1.5 rounded-[20px] border border-white/20 bg-black/45 px-2.5 py-1.5 text-[10px] font-700 uppercase tracking-[0.08em] text-white backdrop-blur-[6px] transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
      >
        {muted ? 'Sound on' : 'Sound off'}
      </button>

      {/* Only shown when autoplay was refused or motion is reduced — otherwise it would sit over the film. */}
      {!playing && (
        <button
          type="button"
          onClick={() => void videoRef.current?.play().catch(() => {})}
          aria-label="Play the trailer"
          className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white/70"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.7)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#111" aria-hidden>
              <path d="M5 3v18l15-9z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
