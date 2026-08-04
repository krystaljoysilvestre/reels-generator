// The reel's pipeline status as a dot-and-label pill. Colour groups the twelve statuses into
// what an operator actually cares about: live, working, waiting on you, or broken.
// Pure render (no hooks) so it works in server components too.

type Tone = 'live' | 'working' | 'waiting' | 'broken' | 'idle'

const TONE: Record<Tone, string> = {
  live: 'bg-success-soft text-success',
  working: 'bg-accent-soft text-accent',
  waiting: 'bg-[#FBF1DD] text-[#9A6B12]',
  broken: 'bg-danger-soft text-danger',
  idle: 'bg-subtle-strong text-muted',
}

const STATUS_TONE: Record<string, Tone> = {
  published: 'live',
  scheduled: 'live',
  approved: 'live',
  rendering: 'working',
  render_qa: 'working',
  storyboard: 'working',
  drafting: 'working',
  story_review: 'waiting',
  bible_review: 'waiting',
  spot_check: 'waiting',
  failed: 'broken',
  rejected: 'broken',
}

// The one creator-facing vocabulary for reel states — never show a raw status. Working states borrow
// the phase strip's words; waiting states read as "your move"; nothing here names an internal step.
const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  scheduled: 'Scheduled',
  approved: 'Approved',
  rendering: 'In production',
  render_qa: 'Final check',
  storyboard: 'Storyboarding',
  drafting: 'Writing',
  story_review: 'Review the story',
  bible_review: 'Review continuity',
  spot_check: 'Spot-check',
  failed: 'Failed',
  rejected: 'Not approved',
}

export function ReelStatusPill({ status, className = '' }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'idle'
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-2xl px-2.5 py-1 text-[11px] font-600 ${TONE[tone]} ${className}`}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
      {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  )
}
