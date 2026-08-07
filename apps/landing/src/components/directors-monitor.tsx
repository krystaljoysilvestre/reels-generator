'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { CropMarks } from './crop-marks'

/**
 * The monitor cycles one horror reel, scene by scene, showing the DIRECTION behind each frame.
 *
 * ── The writing guide ────────────────────────────────────────────────────────────────────────
 * Every string a viewer reads here must sound like ONE DIRECTOR TALKING — not an AI, not
 * metadata, not a screenplay. The test for any line: could a person on set act on this sentence?
 *
 *   Avoid                        Prefer
 *   Increase tension.            Hold one beat longer.
 *   Make it scary.               Don't let them see what's making the sound.
 *   Cinematic lighting.          Keep the hallway darker than feels comfortable.
 *   Slow Push In · 35mm          Push toward the door. Don't reveal what's behind it yet.
 *   Dark Ambient · Sub Pulse     Sub pulse only. Low enough to feel, not hear.
 *
 * Name the physical action, never the feeling it should produce. One or two short sentences. No
 * lens numbers, preset names, model names or parameter values. No commentary about the craft
 * ("that's the horror") — just the instruction. One voice across all six scenes. And every
 * revision needs an implied reason: a director changes their mind FOR something.
 *
 * The moment a line reads like a settings panel, this section stops working — configuration is
 * what every other AI video product shows, and nobody remembers settings.
 */

type Craft = 'CAPTION' | 'CAMERA' | 'VOICE' | 'MUSIC' | 'SFX'

type Note = {
  craft: Craft
  text: string
  /** At most ONE per scene: the instruction the director visibly changes mid-scene. */
  revisedTo?: string
}

type Scene = {
  id: string
  n: string
  /** The timeline's real label. The story is readable from these six words alone. */
  purpose: string
  image: string
  alt: string
  caption: string
  objectPosition: string
  intent: string
  /** Chip, first half of the slot. */
  thinking: string
  /** Chip, second half. */
  resolving: string
  /** Written in order — the caption first, because the words are what the crafts serve. */
  notes: Note[]
}

const SCENES: Scene[] = [
  {
    id: 'door',
    n: '01',
    purpose: 'Arrival',
    image: '/monitor/scene-01.jpg',
    alt: 'A front door at the end of a dark hallway, lit by a single warm lamp',
    caption: 'The first one came at 11:04.',
    objectPosition: '50% 45%',
    intent: 'Let the audience trust the house.',
    thinking: 'Letting the room breathe…',
    resolving: 'Saving the music…',
    notes: [
      { craft: 'CAPTION', text: 'Hold “11:04” one extra beat.' },
      {
        craft: 'CAMERA',
        text: 'Push toward the door. Don’t reveal what’s behind it yet.',
        revisedTo: 'Push slower. Let them look at everything else first.',
      },
      { craft: 'VOICE', text: 'Emma, whisper. Start mid-thought, like a secret.' },
      { craft: 'MUSIC', text: 'Room tone only. Don’t bring the bed in yet.' },
      { craft: 'SFX', text: 'Two knocks, far away. Leave air after the second.' },
    ],
  },
  {
    id: 'window',
    n: '02',
    purpose: 'Evidence',
    image: '/monitor/scene-02.jpg',
    alt: 'A rain-streaked living-room window at night, three pale handprints on the glass',
    caption: 'By midnight, there were three.',
    objectPosition: '50% 42%',
    intent: 'Reward whoever is still paying attention.',
    thinking: 'Balancing rain against the voice…',
    resolving: 'Burying the footsteps…',
    notes: [
      { craft: 'CAPTION', text: 'Highlight “three”. Nothing else.' },
      { craft: 'CAMERA', text: 'Locked off. Let the window do the work.' },
      { craft: 'VOICE', text: 'Flatten the read on “three”. Say it like a fact.' },
      {
        craft: 'MUSIC',
        text: 'Bring the bed under the rain. Barely.',
        revisedTo: 'Hold the bed. The rain is already the score.',
      },
      { craft: 'SFX', text: 'Rain steady. Footsteps beneath it, almost missed.' },
    ],
  },
  {
    id: 'closet',
    n: '03',
    purpose: 'Doubt',
    image: '/monitor/scene-03.jpg',
    alt: 'A closet door open a hand’s width in a child’s bedroom, warm light spilling from the gap',
    caption: 'We told the kids it was the wind.',
    objectPosition: '50% 44%',
    intent: 'Make the viewer question their own memory.',
    thinking: 'Letting the lie settle…',
    resolving: 'Holding the reassurance…',
    notes: [
      { craft: 'CAPTION', text: 'Leave “wind” on screen after she’s moved on.' },
      { craft: 'CAMERA', text: 'Creep zoom on the closet. Slower than feels right.' },
      {
        craft: 'VOICE',
        text: 'Warmer here — she’s reassuring herself.',
        revisedTo: 'Warmer, but let it crack on “wind”.',
      },
      { craft: 'MUSIC', text: 'Sub pulse only. Low enough to feel, not hear.' },
      { craft: 'SFX', text: 'One floor creak, with a hall’s reverb — wrong for a bedroom.' },
    ],
  },
  {
    id: 'doorknob',
    n: '04',
    purpose: 'Discovery',
    image: '/monitor/scene-04.jpg',
    alt: 'An extreme close-up of a brass doorknob mid-turn, the door chain hanging slack behind it',
    caption: 'It learned the locks by Tuesday.',
    objectPosition: '50% 50%',
    intent: 'Shift from mystery to dread.',
    thinking: 'Choosing the reveal…',
    resolving: 'Delaying the chain…',
    notes: [
      {
        craft: 'CAPTION',
        text: 'Highlight “learned”. Let the word land alone.',
        revisedTo: 'Hold “learned” one extra beat. Then cut.',
      },
      { craft: 'CAMERA', text: 'Macro on the knob. Fill the frame.' },
      { craft: 'VOICE', text: 'Quicken slightly. She’s done pretending.' },
      { craft: 'MUSIC', text: 'Tighten to a ticking pulse.' },
      { craft: 'SFX', text: 'Metal strain. Delay the chain until after the pause.' },
    ],
  },
  {
    id: 'hallway',
    n: '05',
    purpose: 'Silence',
    image: '/monitor/scene-05.jpg',
    alt: 'A child’s nightlight glowing at the far end of a long dark hallway',
    caption: 'The nightlight went out at 3:33.',
    objectPosition: '50% 48%',
    intent: 'Let silence become the scare.',
    thinking: 'Removing the bed…',
    resolving: 'Protecting the silence…',
    notes: [
      { craft: 'CAPTION', text: 'Cut the caption before the light dies.' },
      { craft: 'CAMERA', text: 'Handheld, barely. The house is breathing.' },
      { craft: 'VOICE', text: 'Drop to half volume on “3:33”.' },
      { craft: 'MUSIC', text: 'Pull everything out. Nothing under this shot.' },
      {
        craft: 'SFX',
        text: 'Filament click. Then nothing — don’t fill it.',
        revisedTo: 'Lose the click too. Start the silence early.',
      },
    ],
  },
  {
    id: 'stairs',
    n: '06',
    purpose: 'Reveal',
    image: '/monitor/scene-06.jpg',
    alt: 'The foot of a wooden staircase in darkness, one tread catching a sliver of light',
    caption: 'Then the knocking stopped. Something else started.',
    objectPosition: '50% 52%',
    intent: 'Don’t answer the mystery.',
    thinking: 'Placing the last sound…',
    resolving: 'Holding the pause…',
    notes: [
      { craft: 'CAPTION', text: '“Something else started” arrives alone.' },
      { craft: 'CAMERA', text: 'Tilt up the stairs. Stop before the top.' },
      { craft: 'VOICE', text: 'Slowest read of the night. Land “started”.' },
      {
        craft: 'MUSIC',
        text: 'Full swell, then hard out.',
        revisedTo: 'No swell. Let it end dry.',
      },
      { craft: 'SFX', text: 'One stair. From inside the house.' },
    ],
  },
]

/** One slot per scene. Slow on purpose: this sells confidence, it doesn't deliver information. */
const INTERVAL_MS = 5000

/** Enter offsets, ms into the slot. The order is the argument: intent, then the words, then the
 *  crafts that serve them. Notes land 380ms apart — a pen writing, not a stagger. */
const AT_INTENT = 700
const AT_CAPTION = 1150
// The page reserves its full height so it never reflows as notes land — which means anything the
// pen hasn't reached yet is visible emptiness. Starting later than this read as a loading
// placeholder rather than as a director about to write.
const AT_FIRST_NOTE = 1300
const NOTE_STEP = 340

export function DirectorsMonitor() {
  const [active, setActive] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  // A background tab throttles timers, which would slide the CSS choreography out of step with
  // the advance; parking the whole thing is simpler than resynchronising on return.
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // The section sits below the fold: idle until it's actually on screen, so nothing composites
  // during the hero's first paint.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Chained timeout rather than an interval: retargeting from the timeline restarts a whole slot,
  // so a scene you jumped to always gets its full choreography.
  useEffect(() => {
    if (paused || tabHidden || !inView || reduced) return
    const t = setTimeout(() => setActive((a) => (a + 1) % SCENES.length), INTERVAL_MS)
    return () => clearTimeout(t)
  }, [active, cycle, paused, tabHidden, inView, reduced])

  // Parallax, written straight to the node — routing pointer moves through state would re-render
  // the whole monitor on every frame.
  useEffect(() => {
    if (reduced) return
    // Listeners live on the wrapper, not the frame: below md the notebook sits outside the frame,
    // and frame-bound handlers would treat reading it as leaving the monitor.
    const wrap = wrapRef.current
    const frame = frameRef.current
    const stack = stackRef.current
    if (!wrap || !frame || !stack) return

    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let raf = 0

    const tick = () => {
      current.x += (target.x - current.x) * 0.08
      current.y += (target.y - current.y) * 0.08
      stack.style.transform = `translate3d(${(current.x * 6).toFixed(2)}px, ${(current.y * 4).toFixed(2)}px, 0)`
      raf = requestAnimationFrame(tick)
    }
    const onMove = (e: PointerEvent) => {
      const r = frame.getBoundingClientRect()
      target.x = ((e.clientX - r.left) / r.width) * 2 - 1
      target.y = ((e.clientY - r.top) / r.height) * 2 - 1
    }
    const onEnter = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => {
      target.x = 0
      target.y = 0
      setTimeout(() => {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        stack.style.transform = ''
      }, 600)
    }

    wrap.addEventListener('pointerenter', onEnter)
    wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerleave', onLeave)
    return () => {
      wrap.removeEventListener('pointerenter', onEnter)
      wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reduced])

  const show = (i: number) => {
    setActive(i)
    setCycle((c) => c + 1)
  }

  const scene = SCENES[active]
  // Keys every slot-length animation so it restarts exactly when the fresh timeout starts. Bar,
  // chip and revision all read the same duration, so they cannot drift apart.
  const slotKey = `${active}-${cycle}`
  const slot = { animationDuration: `${INTERVAL_MS}ms` }
  const frozen = paused ? '[animation-play-state:paused]' : ''

  return (
    <div
      ref={wrapRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="relative"
    >
      <div
        ref={frameRef}
        // 21:9 only where there's width for it. A 16:9 frame on a phone is ~200px tall — the chip,
        // caption and timeline alone fill it, which is why the notebook drops out of the frame below md.
        className="group relative aspect-[3/2] overflow-hidden rounded-[18px] border border-white/[0.12] bg-night shadow-[0_40px_100px_-40px_rgba(155,59,255,0.4)] sm:aspect-video md:aspect-[21/9]"
      >
      {/* ── The scene ─────────────────────────────────────────────────────────────────────── */}
      {/* Overscanned so the parallax translate never exposes an edge. */}
      <div ref={stackRef} className="absolute -inset-3">
        {SCENES.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-0 transition-opacity duration-[800ms] ease-in-out ${
              i === active ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Pausing rather than unmounting keeps each layer's Ken Burns clock running, so a
                scene resumes mid-drift instead of snapping back to 1.04 when it returns. */}
            <div
              className={`kx-kenburns h-full w-full ${i === active ? '' : '[animation-play-state:paused]'}`}
              style={{ animationDelay: `${-i * 7}s` }}
            >
              <Image
                src={s.image}
                alt={s.alt}
                fill
                sizes="(min-width: 1220px) 1156px, calc(100vw - 48px)"
                className="object-cover"
                style={{ objectPosition: s.objectPosition }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* grade: bloom, vignette, grain */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_78%_-12%,rgba(155,59,255,0.20),transparent_60%),radial-gradient(700px_380px_at_8%_112%,rgba(47,164,255,0.12),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgba(4,3,8,0.62))]" />
      <div className="kx-grain pointer-events-none absolute inset-0" />
      <CropMarks />

      {/* ── The chip: what the director is deciding, and then that they've decided ─────────── */}
      <div className="absolute left-4 top-4 z-[3] w-[212px] rounded-2xl border border-white/[0.20] bg-black/40 px-3 py-2 backdrop-blur-[6px]">
        <div className="flex items-center gap-[6px]">
          <span className="kx-blink h-1.5 w-1.5 rounded-full bg-brand-pink" />
          <span className="mono text-[9px] font-700 uppercase tracking-[0.14em] text-white">
            Directing · {scene.purpose}
          </span>
        </div>
        <div className="relative mt-2 h-[2px] overflow-hidden rounded-[2px] bg-white/[0.14]">
          <div
            key={slotKey}
            className={`kx-progress absolute inset-0 rounded-[2px] bg-[linear-gradient(90deg,#9B3BFF,#FF2D9B)] ${frozen}`}
            style={slot}
          />
        </div>
        {/* Two lines' worth of room: the longest craft lines wrap, and a fixed one-line box
            spilled them straight out through the chip's bottom edge. */}
        <div className="relative mt-2 h-[28px]">
          <span
            key={`a-${slotKey}`}
            className={`kx-think-a mono absolute inset-0 text-[10px] leading-[13px] text-white/55 ${frozen}`}
            style={slot}
          >
            {scene.thinking}
          </span>
          <span
            key={`b-${slotKey}`}
            className={`kx-think-b mono absolute inset-0 text-[10px] leading-[13px] text-white/55 ${frozen}`}
            style={slot}
          >
            {scene.resolving}
          </span>
          {/* The payoff that makes the whole line read as decision-making rather than loading. */}
          <span
            key={`c-${slotKey}`}
            className={`kx-commit mono absolute inset-0 text-[10px] font-700 leading-[13px] text-white/90 ${frozen}`}
            style={slot}
          >
            Commit.
          </span>
        </div>
      </div>

      {/* ── The caption: the words the whole scene is built to deliver ─────────────────────── */}
      {/* Clears the chip on narrow frames — at 24% the two shared the same band and the caption
          read through the glass. */}
      <div className="pointer-events-none absolute inset-x-5 top-[46%] z-[2] sm:inset-x-6 sm:top-[38%] md:right-[344px] md:top-[30%]">
        {SCENES.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-x-0 top-0 text-center font-display text-[19px] font-900 leading-[1.2] tracking-[-0.02em] text-white transition-[opacity,transform] duration-500 ease-out [text-shadow:0_4px_30px_rgba(0,0,0,0.55)] sm:text-[30px] lg:text-[40px] ${
              i === active ? 'opacity-100' : 'translate-y-2 opacity-0'
            }`}
            style={{ transitionDelay: i === active ? `${AT_CAPTION}ms` : '0ms' }}
          >
            &ldquo;{s.caption}&rdquo;
          </div>
        ))}
      </div>

      {/* ── The cut: this scene is finished ───────────────────────────────────────────────── */}
      <div
        key={`lock-${slotKey}`}
        className="kx-locked pointer-events-none absolute bottom-[64px] left-1/2 z-[3] -translate-x-1/2 rounded-full border border-white/[0.20] bg-black/55 px-3 py-1 backdrop-blur-[6px] md:left-[calc(50%-160px)]"
      >
        <span className="mono text-[9px] font-700 tracking-[0.18em] text-white/80">
          SCENE LOCKED
        </span>
      </div>

      {/* ── The storyboard ────────────────────────────────────────────────────────────────── */}
      {/* Named by purpose, not numbered: the story is readable before it plays. */}
      <div className="absolute inset-x-0 bottom-0 z-[4] flex h-[46px] items-stretch border-t border-white/[0.08] bg-black/45 backdrop-blur-[10px]">
        {SCENES.map((s, i) => {
          const on = i === active
          return (
            <button
              key={s.id}
              type="button"
              onPointerEnter={() => show(i)}
              onFocus={() => show(i)}
              onClick={() => show(i)}
              aria-current={on || undefined}
              aria-label={`Preview scene ${s.n}: ${s.purpose}`}
              className="relative flex min-w-0 flex-1 flex-col justify-center gap-1.5 overflow-hidden px-1.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70 sm:px-3"
            >
              {on && (
                // The Resolve scrub flash — the frame you just landed on, for a moment.
                <span
                  key={`t-${slotKey}`}
                  aria-hidden
                  className="kx-thumbflash absolute inset-0"
                  style={{ backgroundImage: `url(${s.image})` }}
                />
              )}
              <span className="relative">
                <span className="mono hidden text-[8px] tracking-[0.12em] text-white/25 sm:block">
                  {s.n}
                </span>
                {/* Six purpose names have to fit a phone's width — at 11px "DISCOVERY" clipped
                    mid-word, which turned the story spine into noise. */}
                <span
                  className={`mono block text-[8px] uppercase tracking-[0.02em] sm:text-[11px] sm:tracking-[0.1em] ${
                    on ? 'text-white/90' : 'text-white/40'
                  }`}
                >
                  {s.purpose}
                </span>
              </span>
              <span className="relative h-[2px] overflow-hidden rounded-[2px] bg-white/[0.14]">
                {on && (
                  <span
                    key={`p-${slotKey}`}
                    className={`kx-progress absolute inset-0 rounded-[2px] bg-[linear-gradient(90deg,#9B3BFF,#FF2D9B)] ${frozen}`}
                    style={slot}
                  />
                )}
              </span>
            </button>
          )
        })}
        </div>
      </div>

      <Notebook active={active} slotKey={slotKey} slot={slot} frozen={frozen} />
    </div>
  )
}

/**
 * The Director's Notebook — one page, not five cards: five cards is five reading targets.
 *
 * It overlays the frame from md up and sits beneath the monitor below that, because a phone-sized
 * frame has no room to give a page away. Living outside the frame element is also why the monitor's
 * pause handlers are bound to the wrapper.
 */
function Notebook({
  active,
  slotKey,
  slot,
  frozen,
}: {
  active: number
  slotKey: string
  slot: { animationDuration: string }
  frozen: string
}) {
  return (
    <div className="relative mt-3 md:absolute md:right-4 md:top-1/2 md:z-[3] md:mt-0 md:w-[300px] md:-translate-y-1/2">
      {SCENES.map((s, i) => {
        const on = i === active
        return (
          <div
            key={s.id}
            className={`rounded-[20px] border border-white/[0.10] bg-black/[0.30] px-[18px] py-[16px] backdrop-blur-[12px] transition-[opacity,transform,border-color,box-shadow] duration-500 ease-out hover:border-white/[0.18] hover:shadow-[0_0_30px_-8px_rgba(155,59,255,0.40)] md:py-[20px] ${
              on ? 'opacity-100' : 'pointer-events-none absolute inset-0 translate-y-2 opacity-0'
            }`}
            style={{ transitionDelay: on ? `${AT_INTENT}ms` : '0ms' }}
          >
            <div className="mono text-[9px] uppercase tracking-[0.14em] text-white/40">
              Creative intent
            </div>
            <div className="mt-1.5 text-[14px] leading-[1.5] text-white/85">{s.intent}</div>

            {/* A rule on a page, not a border between panels. */}
            <div className="my-[15px] h-px bg-white/[0.07]" />

            <div className="mono text-[9px] uppercase tracking-[0.14em] text-white/40">
              Direction
            </div>
            {s.notes.map((note, j) => (
              <div
                key={note.craft}
                // Uneven vertical rhythm on purpose: a page that was written, not laid out.
                className={`flex gap-2 transition-[opacity,transform] duration-500 ease-out ${
                  j % 2 ? 'mt-[13px]' : 'mt-[11px]'
                } ${on ? 'opacity-100' : 'translate-y-1 opacity-0'}`}
                style={{ transitionDelay: on ? `${AT_FIRST_NOTE + j * NOTE_STEP}ms` : '0ms' }}
              >
                {/* The gutter is sized for the longest label — at 34px "CAPTION" ran into its own
                    note and the page read as a broken table instead of a margin. */}
                <span className="mono w-[46px] shrink-0 pt-[3px] text-[8px] tracking-[0.12em] text-white/[0.22]">
                  {note.craft}
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-[1.55] text-white/70">
                  {note.revisedTo ? (
                    // The change of mind. Held in one slot at a fixed height so the page never
                    // reflows: the original leaves, a beat of nothing, then the new instruction.
                    <span className="relative block min-h-[40px]">
                      <span
                        key={`o-${slotKey}`}
                        className={`kx-revise-out absolute inset-0 ${frozen}`}
                        style={slot}
                      >
                        {note.text}
                      </span>
                      <span
                        key={`r-${slotKey}`}
                        className={`kx-revise-in absolute inset-0 text-white/85 ${frozen}`}
                        style={slot}
                      >
                        {note.revisedTo}
                      </span>
                    </span>
                  ) : (
                    note.text
                  )}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
