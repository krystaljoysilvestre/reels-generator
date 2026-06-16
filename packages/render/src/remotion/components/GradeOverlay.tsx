import React from 'react'

interface GradeOverlayProps {
  grain: number       // 0–1, channel grain setting
  vignette: number    // 0–1, channel vignette setting
}

// Film grain + vignette overlay. LUT is applied in post via FFmpeg (needs GPU pipeline).
// These CSS effects give the channel's visual signature without FFmpeg LUT support in Remotion.
export const GradeOverlay: React.FC<GradeOverlayProps> = ({ grain, vignette }) => {
  if (grain === 0 && vignette === 0) return null

  return (
    <>
      {/* Vignette */}
      {vignette > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${(vignette * 0.7).toFixed(2)}) 100%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Grain via SVG noise filter */}
      {grain > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: grain * 0.25,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  )
}
