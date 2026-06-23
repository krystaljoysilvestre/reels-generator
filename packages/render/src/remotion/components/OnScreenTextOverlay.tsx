import React from 'react'
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion'

// Optional per-scene title/overlay burned onto the scene — separate from the spoken captions
// (which sit at the bottom). Sits in the upper third, eases up + fades in at the scene start, and
// is styled for legibility on any footage (bold, high-contrast, soft shadow). One per scene.
export const OnScreenTextOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const inFrames = Math.round(0.35 * fps)
  const opacity = interpolate(frame, [0, inFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const rise = interpolate(frame, [0, inFrames], [Math.round(height * 0.012), 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const fontSize = Math.round(width * 0.062)
  const padX = Math.round(width * 0.08)

  return (
    <div
      style={{
        position: 'absolute',
        top: Math.round(height * 0.1),
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: `0 ${padX}px`,
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontWeight: 800,
          fontSize,
          lineHeight: 1.12,
          letterSpacing: '-0.01em',
          color: '#fff',
          textAlign: 'center',
          textShadow: '0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.95)',
          maxWidth: '92%',
          textWrap: 'balance',
        }}
      >
        {text}
      </div>
    </div>
  )
}
