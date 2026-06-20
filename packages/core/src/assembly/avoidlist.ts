// Rejection → anti-pattern lines (docs/04 §2.2)
// Frequencies of rejection reason codes map to specific avoid instructions.

export interface RejectionCount {
  reasonCode: string
  count: number
}

// Operator-facing labels for rejection reason codes — shared by the review UI and the worker, so the
// feedback injected into the regeneration prompt reads in the same words the operator picked.
export const REJECTION_REASON_LABELS: Record<string, string> = {
  weak_hook: 'Weak hook',
  twist_predictable: 'Twist too predictable',
  pacing: 'Pacing drags',
  off_culture: 'Not believable / off-culture',
  voice_mismatch: 'Voice mismatch',
  visual_off: 'Visuals off',
  other: 'Other',
}

// The story-relevant reason codes shown when rejecting/regenerating a STORY (visual_off is a visual
// reason, not a story one). The review surfaces render these in order.
export const STORY_REJECTION_REASONS = [
  { code: 'weak_hook', label: 'Weak hook' },
  { code: 'twist_predictable', label: 'Twist too predictable' },
  { code: 'pacing', label: 'Pacing drags' },
  { code: 'off_culture', label: 'Not believable / off-culture' },
  { code: 'voice_mismatch', label: 'Voice mismatch' },
  { code: 'other', label: 'Other' },
] as const

const AVOID_LINES: Record<string, string> = {
  twist_predictable:
    'Avoid: twist where the narrator was the creature all along; avoid dream reveals; avoid "it was just the wind" fake-outs.',
  weak_hook:
    'Avoid: opening with setting description or time-of-day; avoid starting with a greeting.',
  pacing:
    'Avoid: more than two paragraphs of build before the first unusual detail.',
  voice_mismatch:
    'Avoid: formal or journalistic register; keep confessional, 2AM intimacy.',
  visual_off:
    'Avoid: generic western horror imagery; stay rooted in Philippine provincial setting.',
  off_culture:
    'Avoid: cultural details that do not fit rural Philippine context; keep entities local.',
}

// Threshold: reason must appear ≥3 times in the past 14 days to inject an avoid line.
const THRESHOLD = 3

export function buildAvoidList(recentRejections: RejectionCount[]): string {
  const lines = recentRejections
    .filter((r) => r.count >= THRESHOLD)
    .map((r) => AVOID_LINES[r.reasonCode])
    .filter(Boolean)

  return lines.length > 0 ? lines.join('\n') : ''
}
