// Maps the canonical PIPELINE_STEPS into 5 human-readable phases for progress UI, plus channel-themed
// "what's happening" ticker copy for the loaders. reelStatus is authoritative for the high-level phase;
// per-step rows refine which phase is actively running. A missing step row counts as pending.

import { asGenreModule, type GenreModule } from '@reels/core/prompts/scenes.v1'

export type PhaseKey = 'writing' | 'storyboarding' | 'filming' | 'scoring' | 'finishing'

export const PHASES: Array<{ key: PhaseKey; label: string; steps: string[] }> = [
  { key: 'writing', label: 'Writing', steps: ['generate_story', 'review_story'] },
  { key: 'storyboarding', label: 'Storyboarding', steps: ['analyze_story', 'generate_post_meta', 'breakdown_scenes'] },
  { key: 'filming', label: 'Filming', steps: ['generate_images', 'generate_tts', 'compute_timings', 'generate_sfx', 'animate_scenes'] },
  { key: 'scoring', label: 'Scoring', steps: ['generate_music', 'mix_audio'] },
  { key: 'finishing', label: 'Finishing', steps: ['render', 'render_qa', 'spot_check'] },
]

export interface PhaseView {
  key: PhaseKey
  label: string
  state: 'done' | 'active' | 'pending'
}

const STATUS_PHASE: Record<string, PhaseKey> = {
  drafting: 'writing', story_review: 'writing', rejected: 'writing',
  bible_review: 'storyboarding', storyboard: 'storyboarding',
  rendering: 'filming', render_qa: 'finishing', spot_check: 'finishing',
  approved: 'finishing', scheduled: 'finishing', published: 'finishing',
}

export function phaseProgress(
  reelStatus: string,
  steps: Array<{ stepName: string; status: string }>,
): { phases: PhaseView[]; currentPhase: PhaseKey; done: boolean; failed: boolean } {
  const failed = reelStatus === 'failed' || steps.some((s) => s.status === 'failed')
  const done = ['approved', 'scheduled', 'published'].includes(reelStatus)

  let currentPhase: PhaseKey = STATUS_PHASE[reelStatus] ?? 'writing'
  // A currently-running step is the most precise signal of the active phase (e.g. status='storyboard'
  // while generate_images runs → we're really in 'filming').
  const running = steps.find((s) => s.status === 'running')
  if (running) {
    const ph = PHASES.find((p) => p.steps.includes(running.stepName))
    if (ph) currentPhase = ph.key
  }

  const order = PHASES.map((p) => p.key)
  const curIdx = order.indexOf(currentPhase)
  const phases: PhaseView[] = PHASES.map((p, i) => ({
    key: p.key,
    label: p.label,
    state: done ? 'done' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending',
  }))
  return { phases, currentPhase, done, failed }
}

// ── Characterful, channel-themed loader copy ─────────────────────────────────
export type ChannelMood = 'dark' | 'warm' | 'neutral'

export function channelMood(tone: { intensity?: number; warmth?: number } | null | undefined): ChannelMood {
  const intensity = Number(tone?.intensity ?? 5)
  const warmth = Number(tone?.warmth ?? 5)
  if (intensity >= 6) return 'dark'
  if (warmth >= 6) return 'warm'
  return 'neutral'
}

// Subtle tint used for the loader's glow/gradient (applied at low opacity, never garish).
export const MOOD_TINT: Record<ChannelMood, string> = {
  dark: '#c01616',
  warm: '#d98324',
  // Channel character keeps its own dread/warmth hues; the default is the brand accent.
  neutral: '#9B3BFF',
}

// Ticker copy is keyed on GENRE, not mood. Mood (derived from tone.intensity) still drives the loader's
// COLOR — words from genre, colour from tone. It used to drive the words too, which meant every channel
// with intensity >= 6 read as horror: a hard-hitting documentary was told we were "lighting the candles"
// and "letting the dread settle in". Intensity says how charged a channel is, never that it's haunted.
const BASE_TICKERS: Record<PhaseKey, string[]> = {
  writing: ['Reading your channel’s voice…', 'Studying what works on your channel…', 'Sketching the hook…', 'Finding the turn…', 'Tightening every line…'],
  storyboarding: ['Breaking the script into scenes…', 'Framing each shot…'],
  filming: ['Painting the scenes…', 'Recording the narration…', 'Timing every beat…', 'Layering in sound…'],
  scoring: ['Composing an original score…', 'Mixing voice and music…'],
  finishing: ['Rendering the video…', 'Checking the final cut…'],
}

// Per-genre overrides — only the phases where the genre genuinely changes the register. Anything not
// listed falls back to BASE_TICKERS, so a new genre never owes five arrays and no phrase gets copied
// across genres just to fill the table.
const GENRE_TICKERS: Partial<Record<GenreModule, Partial<Record<PhaseKey, string[]>>>> = {
  horror: {
    writing: ['Reading your channel’s voice…', 'Listening for footsteps…', 'Letting the dread settle in…', 'Finding where it all goes wrong…', 'Holding the silence one beat longer…'],
    storyboarding: ['Breaking the script into scenes…', 'Blocking each shot in the dark…', 'Deciding when to look away…'],
    filming: ['Painting the shadows…', 'Recording the whisper…', 'Timing the scare…', 'Holding the frame a beat too long…'],
    scoring: ['Scoring the dread…', 'Tuning the strings to unease…', 'Folding the voice into the dark…'],
    finishing: ['Developing the final cut…', 'One last look over your shoulder…', 'Sealing it shut…'],
  },
  informational: {
    writing: ['Reading your channel’s voice…', 'Getting the facts straight…', 'Sharpening the opening question…', 'Ordering the explanation…', 'Cutting what doesn’t earn its place…'],
    storyboarding: ['Breaking the script into scenes…', 'Choosing what to show instead of tell…', 'Framing each step…'],
    scoring: ['Composing a clean score…', 'Keeping the music under the point…'],
  },
  lifestyle: {
    writing: ['Reading your channel’s voice…', 'Setting the mood…', 'Finding the moment worth keeping…', 'Making it feel effortless…'],
    storyboarding: ['Breaking the script into scenes…', 'Framing each moment…', 'Finding the light…'],
    filming: ['Painting the scenes…', 'Recording the narration…', 'Catching the small details…', 'Layering in sound…'],
    scoring: ['Composing an easy score…', 'Mixing voice and music…'],
  },
  drama: {
    writing: ['Reading your channel’s voice…', 'Finding what they want…', 'Setting two wants against each other…', 'Building to the choice…', 'Letting the turn land…'],
    storyboarding: ['Breaking the script into scenes…', 'Staying on the face that matters…', 'Framing the turn…'],
    filming: ['Painting the scenes…', 'Recording the narration…', 'Holding on the quiet beats…', 'Layering in sound…'],
    scoring: ['Scoring the ache…', 'Letting the strings breathe…', 'Mixing voice and music…'],
  },
  comedy: {
    writing: ['Reading your channel’s voice…', 'Finding the funny…', 'Setting up the turn…', 'Trimming to the punchline…', 'Landing it and getting out…'],
    storyboarding: ['Breaking the script into scenes…', 'Timing the reveal…', 'Framing the reaction…'],
    scoring: ['Composing a light score…', 'Keeping the music playful…'],
  },
  reddit_story: {
    writing: ['Reading your channel’s voice…', 'Getting the voice right…', 'Setting up the dilemma…', 'Saving the detail that flips it…', 'Keeping it sounding real…'],
    scoring: ['Composing an understated score…', 'Mixing voice and music…'],
  },
  childrens: {
    writing: ['Reading your channel’s voice…', 'Choosing simple words…', 'Giving them something to want…', 'Keeping it kind…', 'Landing a happy close…'],
    storyboarding: ['Breaking the script into scenes…', 'Drawing the picture book…', 'Keeping every face friendly…'],
    filming: ['Painting the scenes…', 'Recording the narration…', 'Adding a little sparkle…', 'Layering in sound…'],
    scoring: ['Composing a gentle score…', 'Mixing voice and music…'],
  },
  fairytale: {
    writing: ['Reading your channel’s voice…', 'Once upon a time…', 'Setting the old rules…', 'Sending them into the woods…', 'Bringing them home changed…'],
    storyboarding: ['Breaking the script into scenes…', 'Illustrating each turn…', 'Framing the enchantment…'],
    filming: ['Painting the scenes…', 'Recording the narration…', 'Gilding the edges…', 'Layering in sound…'],
    scoring: ['Composing a storybook score…', 'Mixing voice and music…'],
  },
  commentary: {
    writing: ['Reading your channel’s voice…', 'Finding the angle…', 'Making the case…', 'Anticipating the pushback…', 'Sharpening every line…'],
    storyboarding: ['Breaking the script into scenes…', 'Choosing what to show…', 'Framing each point…'],
    scoring: ['Composing a spare score…', 'Mixing voice and music…'],
  },
}

export function phaseTicker(key: PhaseKey, genre?: string | null): string[] {
  const g = asGenreModule(genre ?? null)
  return (g && GENRE_TICKERS[g]?.[key]) ?? BASE_TICKERS[key]
}
