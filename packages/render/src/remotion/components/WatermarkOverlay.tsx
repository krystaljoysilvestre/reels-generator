import React from 'react'
import { useCurrentFrame, useVideoConfig, Img } from 'remotion'

// Roaming watermark: the channel logo, low-opacity, that HOPS to a new spot every few seconds so it can't
// be cropped out for the whole video (a fixed corner is trivially cropped + re-uploaded). Positions are
// spread across the frame but kept out of the bottom-centre caption zone and inside a safe margin. Pure
// function of the frame (Remotion renders across threads — never Math.random / Date here).

interface WatermarkOverlayProps {
  dataUri: string
  opacity: number
}

// Anchor positions as fractions of the frame (top-left of the logo box). Spread wide — corners, mid-edges,
// a couple of interior spots — but avoiding the lower-centre where subtitles sit.
const POSITIONS: { left: number; top: number }[] = [
  { left: 0.06, top: 0.06 },
  { left: 0.62, top: 0.10 },
  { left: 0.08, top: 0.40 },
  { left: 0.60, top: 0.44 },
  { left: 0.34, top: 0.24 },
  { left: 0.30, top: 0.60 },
]
const MOVE_SECONDS = 3 // hop interval
const FADE_SECONDS = 0.3 // fade out at the old spot, in at the new — so the hop reads as a soft move, not a blink
const WIDTH_FRAC = 0.26 // logo box width as a fraction of the frame width

export const WatermarkOverlay: React.FC<WatermarkOverlayProps> = ({ dataUri, opacity }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const period = Math.max(1, Math.round(fps * MOVE_SECONDS))
  const fadeFrames = Math.max(1, Math.round(fps * FADE_SECONDS))
  const idx = Math.floor(frame / period) % POSITIONS.length
  const pos = POSITIONS[idx]!
  const local = frame % period
  const fade = Math.min(local, period - local, fadeFrames) / fadeFrames // 0 at the interval edges, 1 in the middle
  return (
    <div
      style={{
        position: 'absolute',
        left: `${pos.left * 100}%`,
        top: `${pos.top * 100}%`,
        width: width * WIDTH_FRAC,
        opacity: opacity * fade,
        pointerEvents: 'none',
      }}
    >
      <Img src={dataUri} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  )
}
