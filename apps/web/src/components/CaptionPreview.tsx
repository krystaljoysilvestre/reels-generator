'use client'

import { useEffect, useRef, useState } from 'react'
import type { CaptionStyle } from '@reels/core'

// Animated, looping caption preview — simulates how the burned-in captions actually
// play in the finished reel (word-by-word, with the preset's signature motion). The
// motion rules here mirror the Remotion SubtitleOverlay so what the operator sees in
// the wizard is what ships in the video.

interface CaptionPreviewProps {
  style: CaptionStyle
  text?: string
  /** Maps 1080×1920 font px → preview px. */
  scale?: number
  /** Selected channel style image — shown behind the captions so the operator sees them over real footage. */
  backgroundImageUrl?: string | undefined
  /** Platform caption safe-zone (% of frame height kept clear of the platform UI). Offsets the caption band. */
  safeZonePct?: number
  className?: string
}

const DEFAULT_TEXT = 'you need to see this'
const WORD_MS = 360 // time each word "speaks"
const ANIM_MS = 280 // entrance duration of a word
const HOLD_MS = 1200 // pause on the full line before looping

const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

function shadowCss(style: CaptionStyle, s: number): string {
  const fs = style.fontSizePx * s
  const d = Math.max(1, Math.round(fs * 0.06))
  switch (style.shadow) {
    case 'none':
      return 'none'
    case 'soft':
      return `0 ${d}px ${Math.round(fs * 0.14)}px rgba(0,0,0,0.78)`
    case 'glow':
      return `0 0 ${Math.round(fs * 0.18)}px ${style.highlightColor}, 0 0 ${Math.round(fs * 0.4)}px ${style.highlightColor}, 0 1px 2px rgba(0,0,0,0.9)`
    case 'hard':
    default:
      // Single crisp drop shadow. The WebkitTextStroke already draws the outline, so a
      // 4-direction offset would render as a doubled black "ghost" behind the text.
      return `${d}px ${d}px 0 rgba(0,0,0,0.85)`
  }
}

export function CaptionPreview({ style, text = DEFAULT_TEXT, scale = 0.42, backgroundImageUrl, safeZonePct = 0, className }: CaptionPreviewProps) {
  const words = text.trim().split(/\s+/)
  const cycle = words.length * WORD_MS + HOLD_MS
  const [now, setNow] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      setNow((ts - startRef.current) % cycle)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [cycle])

  const fontSize = Math.round(style.fontSizePx * scale)
  // Thick, even outline (paintOrder keeps the fill crisp on top). Scaled up from the raw
  // 1080px stroke so the heavy presets read as bold here too — no offset, so no doubling.
  const strokeW = Math.max(1, Math.round(style.stroke.widthPx * scale * 1.7))
  const activeIdx = Math.min(words.length - 1, Math.floor(now / WORD_MS))

  const baseText: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontSize,
    lineHeight: 1.25,
    letterSpacing: `${style.letterSpacingEm}em`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    color: style.color,
    textShadow: shadowCss(style, scale),
    WebkitTextStrokeWidth: strokeW ? `${strokeW}px` : undefined,
    WebkitTextStrokeColor: strokeW ? style.stroke.color : undefined,
    paintOrder: 'stroke fill',
  }

  // Gradient text fill (chrome / synthwave) — clip a gradient to the glyphs; the stroke
  // still paints (paintOrder), so the outline survives.
  if (style.gradient) {
    baseText.backgroundImage = `linear-gradient(180deg, ${style.gradient.from}, ${style.gradient.to})`
    baseText.WebkitBackgroundClip = 'text'
    baseText.backgroundClip = 'text'
    baseText.WebkitTextFillColor = 'transparent'
    baseText.color = 'transparent'
  }

  const justify = style.position === 'top' ? 'flex-start' : style.position === 'center' ? 'center' : 'flex-end'

  // ── Block animations (fade, typewriter) ──────────────────────────────────
  const isBlock = style.mode === 'block' || style.animation === 'fade' || style.animation === 'typewriter'

  let content: React.ReactNode
  if (style.animation === 'typewriter') {
    const full = words.join(' ')
    const revealMs = words.length * WORD_MS
    const chars = Math.round(clamp01(now / revealMs) * full.length)
    const cursorOn = now % 900 < 470
    content = (
      <span style={baseText}>
        {full.slice(0, chars)}
        <span style={{ color: style.highlightColor, opacity: cursorOn ? 1 : 0 }}>▌</span>
      </span>
    )
  } else if (isBlock) {
    const t = clamp01(now / 480)
    content = (
      <span
        style={{
          ...baseText,
          opacity: t,
          transform: `translateY(${Math.round((1 - easeOutCubic(t)) * 14)}px)`,
        }}
      >
        {words.join(' ')}
      </span>
    )
  } else {
    // ── Word animations (pop, bounce, punch, karaoke, highlight_box) ────────
    content = (
      <span style={{ ...baseText, display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${Math.round(fontSize * 0.28)}px` }}>
        {words.map((w, i) => {
          const started = now >= i * WORD_MS
          const t = clamp01((now - i * WORD_MS) / ANIM_MS)
          const isActive = i === activeIdx
          const isSpoken = i <= activeIdx

          let transform = 'none'
          let opacity = 1
          let color = style.color
          const wrap: React.CSSProperties = {}

          if (style.animation === 'pop' || style.animation === 'bounce') {
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.62 + 0.38 * easeOutBack(t) : 0.62
            const yV = style.animation === 'bounce' ? (1 - easeOutBack(t)) * -fontSize * 0.5 : 0
            transform = `translateY(${started ? yV : -fontSize * 0.5}px) scale(${scaleV})`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'punch') {
            opacity = started ? clamp01(t * 2) : 0
            const scaleV = started ? 1 + (1 - easeOutCubic(t)) * 0.55 : 1.55
            const shake = isActive ? Math.sin(now / 32) * (1 - t) * 2.5 : 0
            transform = `scale(${scaleV}) rotate(${shake}deg)`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'karaoke') {
            opacity = 1
            color = isSpoken ? style.highlightColor : style.color
            if (!isSpoken) opacity = 0.5
          } else if (style.animation === 'highlight_box') {
            opacity = 1
            if (isActive) {
              color = style.activeColor
              Object.assign(wrap, {
                backgroundColor: style.highlightColor,
                borderRadius: `${Math.round(fontSize * 0.18)}px`,
                padding: `0 ${Math.round(fontSize * 0.16)}px`,
                transform: `scale(${0.9 + 0.1 * easeOutBack(clamp01((now - i * WORD_MS) / 180))})`,
                WebkitTextStrokeWidth: 0,
                textShadow: 'none',
              })
            } else {
              color = style.color
            }
          } else if (style.animation === 'comic') {
            // Playful "thrown-in" tilt that settles to flat (0°) so resting text stays readable.
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.6 + 0.4 * easeOutBack(t) : 0.6
            const tilt = (i % 2 === 0 ? -1 : 1) * 8 * (1 - easeOutCubic(t))
            transform = `rotate(${tilt}deg) scale(${scaleV})`
            color = isActive ? style.highlightColor : style.color
          } else if (style.animation === 'marker') {
            // Highlighter stroke wiping in behind the lower half of each spoken word.
            opacity = 1
            color = style.color
            if (isSpoken) {
              const wipe = isActive ? clamp01((now - i * WORD_MS) / 220) : 1
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 88%',
                backgroundSize: `${Math.round(wipe * 100)}% 44%`,
                borderRadius: '2px',
              })
            }
          } else if (style.animation === 'glitch') {
            opacity = started ? clamp01(t * 2) : 0
            color = style.color
            if (isActive) {
              const jx = Math.round(Math.sin(now / 38) * 3)
              transform = `translateX(${Math.round(Math.sin(now / 21) * 2)}px)`
              wrap.textShadow = `${jx}px 0 0 rgba(255,0,72,0.9), ${-jx}px 0 0 ${style.highlightColor}`
            }
          }

          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                color,
                opacity,
                transform,
                transformOrigin: 'center bottom',
                willChange: 'transform, opacity',
                ...wrap,
              }}
            >
              {w}
            </span>
          )
        })}
      </span>
    )
  }

  // Optional panel behind the line: translucent dark bar (cinematic/terminal) or a solid
  // accent lower-third (breaking news).
  const plate: React.CSSProperties =
    style.backplate === 'bar'
      ? { background: 'rgba(0,0,0,0.55)', padding: `${Math.round(fontSize * 0.12)}px ${Math.round(fontSize * 0.34)}px`, borderRadius: 8 }
      : style.backplate === 'block'
        ? { background: style.highlightColor, padding: `${Math.round(fontSize * 0.1)}px ${Math.round(fontSize * 0.34)}px`, borderRadius: 4 }
        : {}

  const hasBg = !!backgroundImageUrl
  // Platform safe-zone: keep the caption clear of the platform UI. The band is a % of
  // FRAME HEIGHT; CSS padding-% is width-relative, and this stage is 16:10, so scale by
  // height/width (0.625) to approximate. Applied to whichever edge the caption sits on.
  const szPad = safeZonePct > 0 ? `${(safeZonePct * 0.625).toFixed(1)}%` : '0px'
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        // Dim "video frame" so light captions read like they would over footage.
        background: hasBg ? '#0a0b0e' : 'radial-gradient(120% 80% at 50% 0%, #2a2f3a 0%, #15171d 55%, #0a0b0e 100%)',
        aspectRatio: '16 / 10',
        display: 'flex',
        alignItems: justify,
        justifyContent: 'center',
        paddingLeft: '22px',
        paddingRight: '22px',
        paddingTop: `calc(18px + ${style.position === 'top' ? szPad : '0px'})`,
        paddingBottom: `calc(18px + ${style.position === 'bottom' ? szPad : '0px'})`,
        textAlign: 'center',
      }}
    >
      {/* Selected channel style image — the real footage the captions sit over. */}
      {hasBg && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${backgroundImageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* Legibility scrim over the footage (darker toward the caption band). */}
      {hasBg && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.42) 100%)',
          }}
        />
      )}
      {/* faint vignette + grain so it feels like real footage, not a swatch */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 60px 12px rgba(0,0,0,0.55)',
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27/></filter><rect width=%2740%27 height=%2740%27 filter=%27url(%23n)%27 opacity=%270.04%27/></svg>")',
        }}
      />
      <div style={{ transform: `rotate(${style.rotationDeg}deg)`, position: 'relative', zIndex: 1, maxWidth: '100%' }}>
        <div style={{ ...plate, display: 'inline-block' }}>{content}</div>
      </div>
    </div>
  )
}
