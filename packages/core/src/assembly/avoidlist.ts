// Rejection → anti-pattern lines (docs/04 §2.2)
// Frequencies of rejection reason codes map to specific avoid instructions.

export interface RejectionCount {
  reasonCode: string
  count: number
}

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
