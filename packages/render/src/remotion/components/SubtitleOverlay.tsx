import React from 'react'
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CaptionStyle, SubtitleChunk } from '../types.js'
import { CAPTION_FONT_FACES } from '../fonts/caption-faces.js'
// Deep import, not the barrel: this is a value import, and `@reels/core/timings` would pull
// zod into the browser bundle (see the note at the top of ../types.ts).
import { pickEmphasis } from '@reels/core/timings/emphasis'

interface SubtitleOverlayProps {
  subtitles: SubtitleChunk[]
  captionStyle: CaptionStyle
  safeZonePct: number // platform safe-zone: % of frame height to keep the caption clear of platform UI
}

const ANIM_MS = 260 // per-word entrance duration

// The caption faces, embedded in the bundle and blocked on before the first frame is captured.
//
// Nothing in the render package used to load a font at all, so every preset resolved to whatever
// the headless Chromium had: twenty presets across eight families came out as Arial ×15,
// Georgia ×3, Impact and the default mono. A missing family is silent — the render succeeds and
// simply looks generic — so the wait is deliberate: `delayRender` holds frame 0 until the faces
// are parsed, otherwise the opening frames would burn in the fallback and the rest would not.
// Mounted by ReelComposition rather than by this overlay: the overlay renders nothing on the
// frames between two chunks, so mounting it here would tear the faces down and re-block the
// render at every gap in the narration.
export const CaptionFonts: React.FC = () => {
  const [handle] = React.useState(() => delayRender('Loading caption typefaces'))
  React.useEffect(() => {
    let live = true
    document.fonts.ready.then(() => { if (live) continueRender(handle) })
    return () => { live = false }
  }, [handle])
  return <style>{CAPTION_FONT_FACES}</style>
}
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2 }
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

// Shadow ratios are the design's, measured off the reference: a soft shadow there is
// `0 2px 9px rgba(0,0,0,.45)` on 27px type — offset ≈ 0.07em, blur ≈ 0.33em, and never
// more than half-opaque. The previous values (0.05em / 0.14em at 78% black) read as a
// tight dark halo rather than a lift off the footage.
function shadowCss(style: CaptionStyle, fs: number): string {
  const alpha = style.shadowAlpha ?? 0.45
  switch (style.shadow) {
    case 'none': return 'none'
    case 'soft':
    case 'glow': // the line itself is soft; the glow belongs to the accent word (see below)
      return `0 ${Math.max(1, Math.round(fs * 0.07))}px ${Math.round(fs * 0.32)}px rgba(0,0,0,${alpha})`
    case 'hard':
    default: {
      const d = Math.max(2, Math.round(fs * 0.05))
      // Single crisp drop shadow — the stroke already outlines the glyphs; a 4-direction
      // offset would double the black behind the text.
      return `${d}px ${d}px 0 rgba(0,0,0,0.85)`
    }
  }
}

// The accent word's electric halo (volt). Design: `0 0 12px rgba(a,.75), 0 0 26px rgba(a,.4)`
// on 29px type → 0.41em and 0.9em.
function glowCss(accent: string, fs: number): string {
  return `0 0 ${Math.round(fs * 0.41)}px ${withAlpha(accent, 0.75)}, 0 0 ${Math.round(fs * 0.9)}px ${withAlpha(accent, 0.4)}`
}

// #rgb / #rrggbb → rgba(). Preset accents are always hex; anything else passes through so a
// creator-supplied colour can never crash a render.
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return color
  const h = m[1]!
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

// The lift under gradient type. Accent-tinted at the design's own shadow value; black once the
// legibility pass has raised it, because a tinted halo cannot separate pale type from a lit wall.
function gradientLift(style: CaptionStyle): string {
  const alpha = style.shadowAlpha ?? 0.45
  return alpha > 0.45
    ? `rgba(0,0,0,${Math.min(0.9, alpha)})`
    : withAlpha(style.highlightColor, 0.35)
}

// The guttering of a failing bulb — seance. Transcribed from the design's `capFlicker`:
// a 4.5s loop that dims to 84% and 90% and snaps back, interpolated linearly between stops
// exactly as CSS would. Driven by absolute time, so it reads as ambient across chunks
// rather than restarting with every line.
const FLICKER_STOPS: [number, number][] = [[0, 1], [0.44, 0.84], [0.47, 1], [0.91, 0.9], [0.93, 1], [1, 1]]
function flickerOpacity(ms: number): number {
  const t = (ms % 4500) / 4500
  for (let i = 1; i < FLICKER_STOPS.length; i++) {
    const [t1, v1] = FLICKER_STOPS[i]!
    const [t0, v0] = FLICKER_STOPS[i - 1]!
    if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0))
  }
  return 1
}

// A block-mode line's contents. Normally just the text — the whole point of block mode is that
// the line behaves as one object. But a preset may still mark the word the line lands on
// (`accentWord`), and that cannot be expressed on a single span, so those lines are laid out
// word by word with the accent applied and the animation left at block level.
function blockWords(chunk: SubtitleChunk, style: CaptionStyle): React.ReactNode {
  if (!style.accentWord || chunk.words.length === 0) return chunk.text
  const accentIdx = pickEmphasis(chunk.words)
  return chunk.words.map((w, i) => (
    <React.Fragment key={i}>
      {i > 0 ? ' ' : ''}
      <span style={i === accentIdx ? { color: style.highlightColor } : undefined}>{w.text}</span>
    </React.Fragment>
  ))
}

// THE SCRIM IS A PROPERTY OF THE FRAME, NOT OF THE TEXT BOX — a gradient wash, full width, with
// no edge you can see. It used to be sized as an inset box around the caption (`inset: -180px
// -60px -60px`), so its opaque bottom terminated mid-picture and drew a hard horizontal line
// across the footage. That grey band, not the typography, was the first thing you saw.
//
// Its SHAPE follows the caption. A bottom caption gets the design's own wash, rising from the
// bottom edge. A centred one cannot use that — the darkening would sit hundreds of pixels below
// the words — so it gets a band feathered to nothing at both edges instead. Without this, the
// legibility pass reported success on chrome and dance while changing nothing a viewer could see.
function scrimStyle(style: CaptionStyle): React.CSSProperties {
  const pct = style.scrimPct ?? 46
  const alpha = style.scrimAlpha ?? 0.62
  const solid = `rgba(0,0,0,${alpha})`
  const clear = 'rgba(0,0,0,0)'
  const base: React.CSSProperties = { position: 'absolute', left: 0, right: 0, pointerEvents: 'none' }

  if (style.position === 'center') {
    // An elliptical pool of shade under the words — feathered on every side, so it reads as the
    // picture getting quieter behind the caption rather than as a bar laid across the frame. A
    // full-width band at this alpha letterboxes the shot.
    return {
      ...base,
      top: 0,
      bottom: 0,
      background: `radial-gradient(ellipse 58% ${Math.round(pct * 0.55)}% at 50% 50%, ${solid}, ${clear} 66%)`,
    }
  }
  if (style.position === 'top') {
    return { ...base, top: 0, height: `${pct}%`, background: `linear-gradient(180deg, ${solid}, ${clear})` }
  }
  return { ...base, bottom: 0, height: `${pct}%`, background: `linear-gradient(180deg, ${clear}, ${solid})` }
}

// Caption band offset by the platform safe-zone (% of frame height), so captions clear
// the platform UI. A preset may raise a bottom caption further with `bottomInsetPct` when its
// placement is a design decision; the safe zone still wins if it is larger.
function bandStyle(style: CaptionStyle, height: number, safeZonePct: number): React.CSSProperties {
  const safePct = safeZonePct > 0 ? safeZonePct : 12.5
  const pct = style.position === 'bottom' ? Math.max(safePct, style.bottomInsetPct ?? 0) : safePct
  const inset = Math.round(height * pct / 100)
  switch (style.position) {
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
    style.animation !== 'fade' && style.animation !== 'typewriter' && style.animation !== 'flicker'

  // Every length in the preset table is authored against a 1080-wide frame, so a 16:9 render
  // (1920 wide, 1080 tall) would otherwise get captions 1.78× larger relative to the picture.
  // Scaling by frame HEIGHT keeps a preset the same shape in either frame.
  const scale = height / 1920
  const fs = Math.max(8, Math.round(style.fontSizePx * scale))
  const padX = Math.round(width * 0.056) // the design's 20–22px gutter on a 374px card

  const baseText: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontSize: fs,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacingEm}em`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    color: style.color,
    textShadow: shadowCss(style, fs),
    WebkitTextStrokeWidth: style.stroke.widthPx ? `${style.stroke.widthPx * scale}px` : undefined,
    WebkitTextStrokeColor: style.stroke.widthPx ? style.stroke.color : undefined,
    paintOrder: 'stroke fill',
  }

  if (style.gradient) {
    const { from, to, mid, midStop } = style.gradient
    const stops = mid ? `${from}, ${mid} ${midStop ?? 45}%, ${to}` : `${from}, ${to}`
    baseText.backgroundImage = `linear-gradient(180deg, ${stops})`
    baseText.WebkitBackgroundClip = 'text'
    baseText.backgroundClip = 'text'
    baseText.WebkitTextFillColor = 'transparent'
    baseText.color = 'transparent'
    // A text-shadow paints behind a transparent fill as a dark ghost of the glyph box, so
    // gradient type takes its lift from a drop-shadow filter tinted with the accent instead.
    baseText.textShadow = 'none'
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
  } else if (style.animation === 'flicker') {
    // Slower than a fade and with no slide — an apparition rather than a card sliding up.
    const t = clamp01((currentMs - active.startMs) / 700)
    content = (
      <span style={{ ...baseText, opacity: t * flickerOpacity(currentMs) }}>
        {blockWords(active, style)}
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
    // word 1 at the start of every chunk (karaoke keys off isSpoken = i <= activeIdx).
    const activeIdx = active.words.reduce((acc, w, i) => (currentMs >= w.startMs ? i : acc), -1)
    // TWO different clocks, and keeping them apart is the whole of the design's third rule —
    // "motion settles; ONE accent word moves". Entrance timing follows the voice, so words
    // arrive as they are spoken. The ACCENT does not travel with them: it belongs to the word
    // the line lands on, and stays there. Accenting the spoken word instead meant every word
    // in the line took the accent in turn, so no preset ever had a single emphasis.
    const accentIdx = pickEmphasis(active.words)
    content = (
      <span style={{ ...baseText, display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${Math.round(fs * 0.28)}px` }}>
        {active.words.map((w, i) => {
          const started = currentMs >= w.startMs
          const t = clamp01((currentMs - w.startMs) / ANIM_MS)
          const isActive = currentMs >= w.startMs && currentMs < w.endMs
          const isSpoken = i <= activeIdx
          // The accent lands once the word it belongs to has been reached, and stays — a
          // takeaway the viewer can still read at the end of the line.
          const isAccent = i === accentIdx && started

          let transform = 'none'
          let opacity = 1
          let color = style.color
          const wrap: React.CSSProperties = {}
          // The accent is not only a colour. sable italicises the word it lands on; kick sets its
          // punchline larger than the rest of the line. Treating accent as colour alone made
          // presets that differ in the design read identically on screen.
          if (isAccent) {
            if (style.accentItalic) wrap.fontStyle = 'italic'
            if (style.accentScale) wrap.fontSize = Math.round(fs * style.accentScale)
          }

          if (style.animation === 'pop' || style.animation === 'bounce') {
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.62 + 0.38 * easeOutBack(t) : 0.62
            const yV = style.animation === 'bounce' ? (1 - easeOutBack(t)) * -fs * 0.5 : 0
            transform = `translateY(${started ? yV : -fs * 0.5}px) scale(${scaleV})`
            color = isAccent ? style.highlightColor : style.color
            if (style.shadow === 'glow' && isAccent) wrap.textShadow = glowCss(style.highlightColor, fs)
          } else if (style.animation === 'punch') {
            opacity = started ? clamp01(t * 2) : 0
            const scaleV = started ? 1 + (1 - easeOutCubic(t)) * 0.55 : 1.55
            const shake = isActive ? Math.sin(frame * 0.9) * (1 - t) * 2.5 : 0
            transform = `scale(${scaleV}) rotate(${shake}deg)`
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'rise') {
            opacity = started ? clamp01(t * 1.5) : 0
            const yV = started ? (1 - easeOutCubic(t)) * fs * 0.28 : fs * 0.28
            transform = `translateY(${yV}px)`
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'karaoke') {
            // Three states, as the design draws them: words already sung sit in the base colour,
            // the word being sung takes the accent and an underline that sweeps in beneath it,
            // and words still to come wait at 38%. Accenting everything already sung — which is
            // what this did — ends every line as one solid bar of colour.
            color = isActive ? style.highlightColor : style.color
            opacity = isSpoken ? 1 : 0.38
            if (isActive) {
              const sweep = clamp01((currentMs - w.startMs) / 260)
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 100%',
                backgroundSize: `${Math.round(sweep * 100)}% ${Math.max(2, Math.round(fs * 0.055))}px`,
              })
            }
          } else if (style.animation === 'highlight_box') {
            // One pill, on the word the line lands on — not a pill hopping word to word.
            if (isAccent) {
              color = style.activeColor
              Object.assign(wrap, {
                backgroundColor: style.highlightColor,
                borderRadius: `${Math.round(fs * 0.33)}px`,   // design: 10px radius on 30px type
                padding: `${Math.round(fs * 0.07)}px ${Math.round(fs * 0.4)}px ${Math.round(fs * 0.13)}px`,
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
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'marker') {
            opacity = 1
            // "A highlighter swipe under the takeaway." It marks the word the line lands on —
            // swiping in as that word is said and STAYING, the way you highlight a book. It
            // carries dark ink, because white on a yellow highlighter is unreadable.
            const marked = isAccent
            color = marked ? style.activeColor : style.color
            if (marked) {
              const wipe = isActive ? clamp01((currentMs - w.startMs) / 220) : 1
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 90%',
                backgroundSize: `${Math.round(wipe * 100)}% 42%`,
                borderRadius: '3px',
                padding: `0 ${Math.round(fs * 0.11)}px`,
                textShadow: 'none',
              })
            }
          } else if (style.animation === 'glitch') {
            opacity = started ? clamp01(t * 2) : 0
            color = style.color
            if (isAccent) {
              // Design: a tight ±2px RGB split in the palette's coral and blue — a printing
              // misregistration, not a seizure. No positional jitter.
              const off = Math.sin(frame * 0.9) > 0 ? Math.round(fs * 0.05) : -Math.round(fs * 0.07)
              wrap.textShadow = `${off}px 0 rgba(240,128,107,0.85), ${-off}px 0 ${withAlpha(style.highlightColor, 0.85)}`
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

  // 'bar' — the mono chyron: a translucent plate ruled down its left edge in the accent.
  // 'block' — the news lower third: a full-bleed bar under a hairline accent rule.
  const plate: React.CSSProperties =
    style.backplate === 'bar'
      ? {
          background: 'rgba(10,14,18,0.62)',
          borderLeft: `${Math.max(2, Math.round(fs * 0.105))}px solid ${style.highlightColor}`,
          padding: `${Math.round(fs * 0.53)}px ${Math.round(fs * 0.74)}px`,
          borderRadius: Math.round(fs * 0.21),
        }
      : style.backplate === 'block'
        ? {
            background: 'rgba(12,14,17,0.82)',
            borderTop: `${Math.max(2, Math.round(fs * 0.03))}px solid ${style.highlightColor}`,
            padding: `${Math.round(fs * 0.52)}px ${Math.round(fs * 0.78)}px ${Math.round(fs * 0.61)}px`,
          }
        : {}

  return (
    <>
      {/* THE SCRIM IS A PROPERTY OF THE FRAME, NOT OF THE TEXT BOX.
          It is a gradient wash pinned to the BOTTOM EDGE of the picture, full width, rising
          `scrimPct` of the frame height and fading to nothing — which is why it has no visible
          edge. It used to be sized as an inset box around the caption (`inset: -180px -60px
          -60px`), so its opaque bottom terminated mid-picture and drew a hard horizontal line
          across the footage. That grey band, not the typography, was the first thing you saw. */}
      {style.backplate === 'scrim' ? <div style={scrimStyle(style)} /> : null}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          display: 'flex',
          // A chyron is anchored to the left edge of the frame; everything else centres.
          justifyContent: style.backplate === 'bar' ? 'flex-start' : 'center',
          padding: style.backplate === 'block' ? 0 : `0 ${padX}px`,
          ...bandStyle(style, height, safeZonePct),
        }}
      >
        <div style={{ transform: `rotate(${style.rotationDeg}deg)`, maxWidth: '100%' }}>
          {/* A BLOCK, not an inline span: `text-align` only governs block containers and
              `max-width` does nothing on a non-replaced inline element, so setting either on the
              text span (as this did) silently no-ops — every caption that wrapped to two lines
              went flush left. The lower third is the one case that stays full-bleed. */}
          <div
            style={{
              ...plate,
              // A lower third and a chyron both read from the left; everything else centres.
              textAlign: style.backplate === 'block' || style.backplate === 'bar' ? 'left' : 'center',
              ...(style.backplate === 'block' ? { width: width } : { maxWidth: width - padX * 2 }),
              // Gradient type takes its lift from a filter, since a text-shadow paints as a ghost
              // behind a transparent fill. The tint is the accent while the footage is kind — that
              // cool halo is chrome's look — but a blue shadow on a white wall adds no darkness at
              // all, so once the legibility pass has deepened the shadow the lift goes BLACK. This
              // is what actually rescues chrome; a deeper tinted glow changed nothing a viewer
              // could see.
              ...(style.gradient
                ? { filter: `drop-shadow(0 ${Math.round(fs * 0.07)}px ${Math.round(fs * 0.32)}px ${gradientLift(style)})` }
                : {}),
            }}
          >
            {content}
          </div>
        </div>
      </div>
    </>
  )
}
