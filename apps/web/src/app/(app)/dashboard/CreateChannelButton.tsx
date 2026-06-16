import Link from 'next/link'

export function CreateChannelButton() {
  return (
    <Link href="/channel/new" className="btn-accent">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      Create channel
    </Link>
  )
}
