import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'

interface GradeOverlayProps {
  grain: number       // 0–1, channel grain setting
  vignette: number    // 0–1, channel vignette setting
}

// Deterministic per-frame pseudo-random in [0,1). Remotion renders frames independently (and across
// threads), so the overlay must be a pure function of the frame — never Math.random / Date.
function frameRand(frame: number, salt: number): number {
  const x = Math.sin(frame * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

// Film grain + vignette overlay — the channel's visual signature (LUT is applied in post via FFmpeg).
// These run as a *living* layer so still scenes don't read like a slideshow:
//   • grain re-grains every frame (shimmer) instead of sitting as one static dirty texture
//   • a gentle, irregular flicker dims the frame like an unstable light / old generator
//   • the vignette breathes very slowly so the frame feels alive rather than printed
// All effects scale with the channel's existing grain/vignette intent — a flat channel (both 0) stays flat.
export const GradeOverlay: React.FC<GradeOverlayProps> = ({ grain, vignette }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (grain === 0 && vignette === 0) return null

  const atmo = Math.min(1, grain + vignette) // overall grade intensity → drives the living-frame effects
  const t = frame / fps

  // Grain shimmer: jump the noise tile to a fresh region each frame (large, directionless offsets so it
  // re-grains in place rather than scrolling), with a slight density jitter. Same base intensity as before.
  const gx = Math.floor(frameRand(frame, 1) * 200)
  const gy = Math.floor(frameRand(frame, 2) * 200)
  const grainOpacity = grain * 0.25 * (0.85 + 0.3 * frameRand(frame, 3))

  // Unstable-light flicker: sum of detuned sines → no obvious period; only ever *dims* (a candle/genset
  // dipping), capped low and scaled by grade intensity so it's atmosphere, not a strobe.
  const wob = (Math.sin(t * 5.3) + Math.sin(t * 11.7) + Math.sin(t * 2.1)) / 3
  const flicker = Math.max(0, wob) * 0.05 * atmo

  // Vignette breathes very slowly (~10s period).
  const vig = vignette * (0.92 + 0.08 * Math.sin(t * 0.6))

  return (
    <>
      {/* Vignette */}
      {vignette > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${(vig * 0.7).toFixed(3)}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Grain via SVG noise filter — position + opacity animated per frame for film-like shimmer */}
      {grain > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: grainOpacity,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundPosition: `${gx}px ${gy}px`,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Unstable-light flicker — a faint, irregular darkening */}
      {flicker > 0.001 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#000',
            opacity: flicker,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  )
}
