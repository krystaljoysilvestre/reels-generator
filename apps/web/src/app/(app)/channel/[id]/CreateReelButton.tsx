'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Creates a reel for this channel and kicks off the pipeline (generate_story → stops at the story
// review gate), then sends the operator to the review queue to approve it.
export function CreateReelButton({ channelId, compact = false }: { channelId: string; compact?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline/create-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not create reel')
      router.push('/review')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create reel')
      setLoading(false)
    }
  }

  return (
    <div className={compact ? '' : 'flex flex-col items-center'}>
      <button onClick={create} disabled={loading} className={compact ? 'btn-secondary btn-sm' : 'btn-accent'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {loading ? 'Creating…' : 'Create reel'}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
