import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { SceneEffect, SceneEffectType } from '../types.js'

// Per-scene video effects, composited at render time (free — no API cost). Every value is a PURE function
// of the frame (Remotion renders frames independently/across threads, so no Math.random/Date).
//
//  • zoom   — slow Ken Burns push-in (keeps stills from reading as a slideshow)
//  • shake  — handheld jitter for action/panic beats
//  • glitch — brief digital-jolt bursts: horizontal displacement + RGB-split bars
//  • flash  — a hard cut-flash at the scene's start (impact/jump)
//  • vhs    — scanlines + grain + chroma tint, a degraded-tape wash
//
// zoom/shake/glitch transform the scene content (wrapper); glitch/flash/vhs add overlays on top.

function frameRand(frame: number, salt: number): number {
  const x = Math.sin(frame * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const SceneEffects: React.FC<{
  effects?: SceneEffect[] | undefined
  durationFrames: number
  children: React.ReactNode
}> = ({ effects = [], durationFrames, children }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const by = (t: SceneEffectType) => effects.find((e) => e.type === t)
  const zoom = by('zoom')
  const shake = by('shake')
  const glitch = by('glitch')
  const flash = by('flash')
  const vhs = by('vhs')

  const parts: string[] = []
  if (zoom) {
    const s = interpolate(frame, [0, Math.max(1, durationFrames)], [1, 1 + 0.1 * clamp01(zoom.intensity)], { extrapolateRight: 'clamp' })
    parts.push(`scale(${s.toFixed(4)})`)
  }
  if (shake) {
    const amp = 9 * clamp01(shake.intensity)
    parts.push(`translate(${((frameRand(frame, 1) - 0.5) * 2 * amp).toFixed(2)}px, ${((frameRand(frame, 2) - 0.5) * 2 * amp).toFixed(2)}px)`)
  }
  // Glitch bursts: a short window every ~0.4s where the frame jolts horizontally.
  const glitchActive = !!glitch && frameRand(Math.floor(frame / 4), 7) > 1 - 0.22 * clamp01(glitch.intensity)
  if (glitchActive && glitch) {
    parts.push(`translateX(${((frameRand(frame, 8) - 0.5) * 2 * 26 * clamp01(glitch.intensity)).toFixed(1)}px)`)
  }

  return (
    <AbsoluteFill>
      <AbsoluteFill style={parts.length ? { transform: parts.join(' '), transformOrigin: 'center center' } : undefined}>
        {children}
      </AbsoluteFill>

      {vhs && <VhsOverlay frame={frame} fps={fps} intensity={clamp01(vhs.intensity)} />}
      {glitchActive && glitch && <GlitchBars frame={frame} intensity={clamp01(glitch.intensity)} />}
      {flash && <Flash frame={frame} intensity={clamp01(flash.intensity)} />}
    </AbsoluteFill>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

// A hard white flash on the scene's first ~0.3s — a cut/impact hit.
const Flash: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const o = interpolate(frame, [0, 2, 9], [0.85 * intensity, 0.45 * intensity, 0], { extrapolateRight: 'clamp' })
  if (o <= 0.001) return null
  return <AbsoluteFill style={{ backgroundColor: '#fff', opacity: o, pointerEvents: 'none' }} />
}

// RGB-split bars during a glitch burst — a few thin cyan/magenta slices at pseudo-random heights.
const GlitchBars: React.FC<{ frame: number; intensity: number }> = ({ frame, intensity }) => {
  const bars = 2 + Math.round(intensity * 3)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      {Array.from({ length: bars }).map((_, i) => {
        const y = frameRand(frame, 20 + i) * 100
        const h = 1.5 + frameRand(frame, 40 + i) * 5
        const dx = (frameRand(frame, 60 + i) - 0.5) * 2 * 30 * intensity
        const color = i % 2 === 0 ? 'rgba(0,255,255,0.55)' : 'rgba(255,0,128,0.55)'
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${y.toFixed(1)}%`, height: `${h.toFixed(1)}%`, background: color, transform: `translateX(${dx.toFixed(1)}px)` }} />
        )
      })}
    </AbsoluteFill>
  )
}

// Degraded-tape wash: moving scanlines + a faint chroma tint + grain shimmer.
const VhsOverlay: React.FC<{ frame: number; fps: number; intensity: number }> = ({ frame, fps, intensity }) => {
  const t = frame / fps
  const scroll = (frame * 2) % 6 // scanlines drift downward
  const gx = Math.floor(frameRand(frame, 3) * 200)
  const gy = Math.floor(frameRand(frame, 4) * 200)
  const tracking = Math.max(0, Math.sin(t * 1.7)) * 0.06 * intensity // occasional brightening tracking band
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* chroma tint */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,0,128,0.05), transparent 12%, transparent 88%, rgba(0,255,255,0.05))', opacity: 0.6 * intensity + 0.4 }} />
      {/* scanlines */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 2px, transparent 3px)', backgroundPosition: `0 ${scroll}px`, opacity: 0.4 + 0.4 * intensity }} />
      {/* grain shimmer */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.12 * intensity, mixBlendMode: 'overlay', backgroundRepeat: 'repeat', backgroundPosition: `${gx}px ${gy}px`, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
      {/* tracking band */}
      {tracking > 0.005 && <div style={{ position: 'absolute', inset: 0, backgroundColor: '#fff', opacity: tracking }} />}
    </AbsoluteFill>
  )
}
