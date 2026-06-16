// Reel state machine (docs/02 §4, CLAUDE.md non-negotiable rule).
// Illegal transitions throw — never silently accept bad state.

export type ReelStatus =
  | 'drafting'
  | 'story_review'
  | 'storyboard'
  | 'rendering'
  | 'render_qa'
  | 'spot_check'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'failed'

// Explicit allowed-transition table. Every valid edge is listed.
const TRANSITIONS: Record<ReelStatus, ReadonlyArray<ReelStatus>> = {
  drafting:     ['story_review', 'failed'],
  story_review: ['storyboard', 'rejected', 'failed'],
  storyboard:   ['rendering', 'story_review', 'failed'],  // can send back for re-review
  rendering:    ['render_qa', 'failed'],
  render_qa:    ['spot_check', 'failed'],
  spot_check:   ['approved', 'failed', 'rendering'],      // can re-render from spot_check
  approved:     ['scheduled', 'published'],
  scheduled:    ['published', 'failed'],
  published:    [],                                        // terminal (kill-switch is a platform call, not a status transition)
  rejected:     ['drafting'],                              // retry after rejection
  failed:       ['drafting', 'rendering'],                 // resume: restart from top or from render step
}

export class IllegalTransitionError extends Error {
  constructor(from: ReelStatus, to: ReelStatus) {
    super(`Illegal reel state transition: ${from} → ${to}`)
    this.name = 'IllegalTransitionError'
  }
}

export function transition(from: ReelStatus, to: ReelStatus): ReelStatus {
  const allowed = TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new IllegalTransitionError(from, to)
  }
  return to
}

export function canTransition(from: ReelStatus, to: ReelStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function getAllowedTransitions(from: ReelStatus): ReadonlyArray<ReelStatus> {
  return TRANSITIONS[from]
}

export function isTerminal(status: ReelStatus): boolean {
  return TRANSITIONS[status].length === 0
}
