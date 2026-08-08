import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionStyle, SubtitleChunk } from '../types.js'

interface SubtitleOverlayProps {
  subtitles: SubtitleChunk[]
  captionStyle: CaptionStyle
  safeZonePct: number // platform safe-zone: % of frame height to keep the caption clear of platform UI
}

const ANIM_MS = 260 // per-word entrance duration
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2 }
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

function shadowCss(style: CaptionStyle): string {
  const fs = style.fontSizePx
  const d = Math.max(2, Math.round(fs * 0.05))
  switch (style.shadow) {
    case 'none': return 'none'
    case 'soft': return `0 ${d}px ${Math.round(fs * 0.14)}px rgba(0,0,0,0.78)`
    case 'glow': return `0 0 ${Math.round(fs * 0.18)}px ${style.highlightColor}, 0 0 ${Math.round(fs * 0.4)}px ${style.highlightColor}, 0 2px 3px rgba(0,0,0,0.9)`
    case 'hard':
    default:
      // Single crisp drop shadow — the stroke already outlines the glyphs; a 4-direction
      // offset would double the black behind the text.
      return `${d}px ${d}px 0 rgba(0,0,0,0.85)`
  }
}

// Caption band offset by the platform safe-zone (% of frame height), so captions clear
// the platform UI. Falls back to ~12.5% when no safe-zone is set.
function bandStyle(position: CaptionStyle['position'], height: number, safeZonePct: number): React.CSSProperties {
  const inset = Math.round(height * (safeZonePct > 0 ? safeZonePct : 12.5) / 100)
  switch (position) {
    case 'top': return { top: inset, bottom: 'auto', alignItems: 'flex-start' }
    case 'center': return { top: 0, bottom: 0, alignItems: 'center' }
    case 'bottom':
    default: return { bottom: inset, top: 'auto', alignItems: 'flex-end' }
  }
}

// Burned-in subtitles — on by default (most short-form reels are watched muted), but a first-class
// channel choice: captionStyle.enabled === false burns nothing (clean visuals + narration only).
// Animates word-by-word with the channel's CaptionStyle (pop / bounce / punch / karaoke /
// highlight-box / typewriter / fade), driven by the real per-word timings in each chunk.
// Mirrors the in-app CaptionPreview so the wizard preview matches the shipped video.
export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ subtitles, captionStyle: style, safeZonePct }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const currentMs = (frame / fps) * 1000

  if (style.enabled === false) return null

  const active = subtitles.find((s) => currentMs >= s.startMs && currentMs < s.endMs)
  if (!active) return null

  const hasWords = active.words.length > 0
  const wordMode = style.mode === 'word' && hasWords &&
    style.animation !== 'fade' && style.animation !== 'typewriter'

  const baseText: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontSize: style.fontSizePx,
    lineHeight: 1.25,
    letterSpacing: `${style.letterSpacingEm}em`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    color: style.color,
    textShadow: shadowCss(style),
    WebkitTextStrokeWidth: style.stroke.widthPx ? `${style.stroke.widthPx}px` : undefined,
    WebkitTextStrokeColor: style.stroke.widthPx ? style.stroke.color : undefined,
    paintOrder: 'stroke fill',
    textAlign: 'center',
    maxWidth: width - 120,
  }

  if (style.gradient) {
    baseText.backgroundImage = `linear-gradient(180deg, ${style.gradient.from}, ${style.gradient.to})`
    baseText.WebkitBackgroundClip = 'text'
    baseText.backgroundClip = 'text'
    baseText.WebkitTextFillColor = 'transparent'
    baseText.color = 'transparent'
  }

  let content: React.ReactNode
  if (style.animation === 'typewriter') {
    const full = active.text
    const dur = Math.max(1, active.endMs - active.startMs)
    const chars = Math.round(clamp01((currentMs - active.startMs) / (dur * 0.7)) * full.length)
    const cursorOn = (frame % Math.round(fps * 0.9)) < Math.round(fps * 0.47)
    content = (
      <span style={baseText}>
        {full.slice(0, chars)}
        <span style={{ color: style.highlightColor, opacity: cursorOn ? 1 : 0 }}>▌</span>
      </span>
    )
  } else if (!wordMode) {
    const t = clamp01((currentMs - active.startMs) / 360)
    content = (
      <span style={{ ...baseText, opacity: t, transform: `translateY(${Math.round((1 - easeOutCubic(t)) * 28)}px)` }}>
        {active.text}
      </span>
    )
  } else {
    // -1, not 0: before the first word's startMs nothing is spoken yet. Defaulting to 0 pre-highlights
    // word 1 at the start of every chunk (karaoke/marker styles key off isSpoken = i <= activeIdx).
    const activeIdx = active.words.reduce((acc, w, i) => (currentMs >= w.startMs ? i : acc), -1)
    content = (
      <span style={{ ...baseText, display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${Math.round(style.fontSizePx * 0.28)}px` }}>
        {active.words.map((w, i) => {
          const started = currentMs >= w.startMs
          const t = clamp01((currentMs - w.startMs) / ANIM_MS)
          const isActive = currentMs >= w.startMs && currentMs < w.endMs
          const isSpoken = i <= activeIdx

          let transform = 'none'
          let opacity = 1
          let color = style.color
          const wrap: React.CSSProperties = {}

          if (style.animation === 'pop' || style.animation === 'bounce') {
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.62 + 0.38 * easeOutBack(t) : 0.62
            const yV = style.animation === 'bounce' ? (1 - easeOutBack(t)) * -style.fontSizePx * 0.5 : 0
            transform = `translateY(${started ? yV : -style.fontSizePx * 0.5}px) scale(${scaleV})`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'punch') {
            opacity = started ? clamp01(t * 2) : 0
            const scaleV = started ? 1 + (1 - easeOutCubic(t)) * 0.55 : 1.55
            const shake = isActive ? Math.sin(frame * 0.9) * (1 - t) * 2.5 : 0
            transform = `scale(${scaleV}) rotate(${shake}deg)`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'rise') {
            opacity = started ? clamp01(t * 1.5) : 0
            const yV = started ? (1 - easeOutCubic(t)) * style.fontSizePx * 0.28 : style.fontSizePx * 0.28
            transform = `translateY(${yV}px)`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'karaoke') {
            color = isSpoken ? style.highlightColor : style.color
            opacity = isSpoken ? 1 : 0.5
          } else if (style.animation === 'highlight_box') {
            if (isActive) {
              color = style.activeColor
              Object.assign(wrap, {
                backgroundColor: style.highlightColor,
                borderRadius: `${Math.round(style.fontSizePx * 0.18)}px`,
                padding: `0 ${Math.round(style.fontSizePx * 0.16)}px`,
                transform: `scale(${0.9 + 0.1 * easeOutBack(clamp01((currentMs - w.startMs) / 160))})`,
                WebkitTextStrokeWidth: 0,
                textShadow: 'none',
              })
            }
          } else if (style.animation === 'comic') {
            // Playful "thrown-in" tilt that settles to flat (0°) so resting text stays readable.
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.6 + 0.4 * easeOutBack(t) : 0.6
            const tilt = (i % 2 === 0 ? -1 : 1) * 8 * (1 - easeOutCubic(t))
            transform = `rotate(${tilt}deg) scale(${scaleV})`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'marker') {
            opacity = 1
            color = style.color
            if (isSpoken) {
              const wipe = isActive ? clamp01((currentMs - w.startMs) / 220) : 1
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 88%',
                backgroundSize: `${Math.round(wipe * 100)}% 44%`,
                borderRadius: '3px',
              })
            }
          } else if (style.animation === 'glitch') {
            opacity = started ? clamp01(t * 2) : 0
            color = style.color
            if (isActive) {
              const jx = Math.round(Math.sin(frame * 0.7) * 5)
              transform = `translateX(${Math.round(Math.sin(frame * 1.3) * 3)}px)`
              wrap.textShadow = `${jx}px 0 0 rgba(255,0,72,0.9), ${-jx}px 0 0 ${style.highlightColor}`
            }
          }

          return (
            <span
              key={i}
              style={{ display: 'inline-block', color, opacity, transform, transformOrigin: 'center bottom', ...wrap }}
            >
              {w.text}
            </span>
          )
        })}
      </span>
    )
  }

  const plate: React.CSSProperties =
    style.backplate === 'bar'
      ? { background: 'rgba(0,0,0,0.55)', padding: `${Math.round(style.fontSizePx * 0.12)}px ${Math.round(style.fontSizePx * 0.34)}px`, borderRadius: 10 }
      : style.backplate === 'block'
        ? { background: style.highlightColor, padding: `${Math.round(style.fontSizePx * 0.1)}px ${Math.round(style.fontSizePx * 0.34)}px`, borderRadius: 6 }
        : {}

  const scrim = style.backplate === 'scrim'
    ? <div style={{ position: 'absolute', inset: '-180px -60px -60px', background: 'linear-gradient(0deg, rgba(0,0,0,0.72), rgba(0,0,0,0))', pointerEvents: 'none' }} />
    : null

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 60px',
        ...bandStyle(style.position, height, safeZonePct),
      }}
    >
      {scrim}
      <div style={{ transform: `rotate(${style.rotationDeg}deg)` }}>
        <div style={{ ...plate, display: 'inline-block' }}>{content}</div>
      </div>
    </div>
  )
}
