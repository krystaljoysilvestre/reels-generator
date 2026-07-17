import React from 'react'
import { AbsoluteFill } from 'remotion'

// Post thumbnail — the hero frame with the title composited on (YouTube-style packaging: 1280×720).
// A static single-frame composition rendered via renderStill. Style is deliberately neutral-bold
// (works over any footage, any genre): full-bleed image, bottom scrim for legibility, big title.
export const THUMB_WIDTH = 1280
export const THUMB_HEIGHT = 720

// A type alias (not an interface) so it satisfies Remotion's Record<string, unknown> constraint.
export type ThumbnailCompositionProps = {
  imageSrc: string // data URI of the hero frame
  title: string
}

export const ThumbnailComposition: React.FC<ThumbnailCompositionProps> = ({ imageSrc, title }) => {
  // Scale type down as titles get longer so 3-line monsters still fit the frame.
  const fontSize = title.length > 60 ? 64 : title.length > 35 ? 76 : 92

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <img
        src={imageSrc}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Legibility scrim — bottom-weighted so the image still reads */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 34%, rgba(0,0,0,0) 58%)',
        }}
      />
      {/* Soft vignette keeps eyes centered */}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,0.55)' }} />
      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 44,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          fontWeight: 900,
          fontSize,
          lineHeight: 1.06,
          letterSpacing: '-0.015em',
          color: '#fff',
          textShadow: '0 3px 20px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.95)',
          textWrap: 'balance',
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  )
}
