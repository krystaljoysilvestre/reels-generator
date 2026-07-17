// Maps the canonical PIPELINE_STEPS into 5 human-readable phases for progress UI, plus channel-themed
// "what's happening" ticker copy for the loaders. reelStatus is authoritative for the high-level phase;
// per-step rows refine which phase is actively running. A missing step row counts as pending.

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
  neutral: '#1A1A2E',
}

const WRITING_TICKERS: Record<ChannelMood, string[]> = {
  dark: ['Reading your channel’s voice…', 'Lighting the candles…', 'Listening for footsteps…', 'Letting the dread settle in…', 'Finding where it all goes wrong…', 'Holding the silence one beat longer…'],
  warm: ['Reading your channel’s voice…', 'Warming up the room…', 'Finding the heart of it…', 'Setting an easy pace…', 'Landing a gentle turn…'],
  neutral: ['Reading your channel’s voice…', 'Studying your reference stories…', 'Sketching the hook…', 'Finding the turn…', 'Tightening every line…'],
}

// Mood-keyed so the whole render is in character — the "dark" set leans into dread, the others stay
// neutral/warm. (Only 'writing' was themed before; the render phases now get the same treatment.)
const PHASE_TICKERS: Record<Exclude<PhaseKey, 'writing'>, Record<ChannelMood, string[]>> = {
  storyboarding: {
    dark: ['Breaking the script into scenes…', 'Blocking each shot in the dark…', 'Deciding when to look away…'],
    warm: ['Breaking the script into scenes…', 'Framing each moment…'],
    neutral: ['Breaking the script into scenes…', 'Framing each shot…'],
  },
  filming: {
    dark: ['Painting the shadows…', 'Recording the whisper…', 'Timing the scare…', 'Letting the dark bleed in…', 'Holding the frame a beat too long…'],
    warm: ['Painting the scenes…', 'Recording the narration…', 'Timing every beat…', 'Layering in sound…'],
    neutral: ['Painting the scenes…', 'Recording the narration…', 'Timing every beat…', 'Layering in sound…'],
  },
  scoring: {
    dark: ['Scoring the dread…', 'Tuning the strings to unease…', 'Folding the voice into the dark…'],
    warm: ['Composing a warm score…', 'Mixing voice and music…'],
    neutral: ['Composing an original score…', 'Mixing voice and music…'],
  },
  finishing: {
    dark: ['Developing the final cut…', 'One last look over your shoulder…', 'Sealing it shut…'],
    warm: ['Rendering the video…', 'Checking the final cut…'],
    neutral: ['Rendering the video…', 'Checking the final cut…'],
  },
}

export function phaseTicker(key: PhaseKey, mood: ChannelMood): string[] {
  return key === 'writing' ? WRITING_TICKERS[mood] : PHASE_TICKERS[key][mood]
}
