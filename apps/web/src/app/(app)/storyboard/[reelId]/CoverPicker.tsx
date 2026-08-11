'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'

// CHOOSE A COVER — pick which of the reel's own frames the cover is built from.
//
// The frame used to be decided by one line at compose time (`first scene with isHero && an image`), which
// on a 42-scene reel meant a blind pick out of 42. Kendrix now ranks the frames and recommends a few, and
// this is where the creator agrees or disagrees. Switching frames costs nothing: they are already generated
// and already paid for, so this is a re-point, and only the cover is rebuilt.
//
// The recommendations carry their REASON deliberately. A shortlist with no explanation is an opaque
// ordering the creator has to either trust or ignore; with the reason attached it is an argument they can
// disagree with, which is the difference between a recommendation and a decision made for them.

export interface CoverFrame {
  assetId: string
  sceneIdx: number
  url: string
}

export interface CoverShortlistItem extends CoverFrame {
  score: number
  reason: string
}

export interface CoverSelection {
  frameAssetId: string
  source: 'ranked' | 'creator'
  shortlist: CoverShortlistItem[]
  sampled: number
  total: number
}

export function CoverPicker({
  reelId,
  cover,
  frames,
  vertical,
}: {
  reelId: string
  cover: CoverSelection | null
  frames: CoverFrame[]
  vertical: boolean
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const chosenId = cover?.frameAssetId ?? null
  // Recommended tiles carry a score and a reason; the full grid is every frame the reel owns. A reel that
  // was never ranked has no shortlist, so it opens straight onto all frames.
  const recommended = cover?.shortlist ?? []
  const showingAll = showAll || recommended.length === 0
  const tiles: Array<CoverFrame & { score?: number; reason?: string }> = showingAll ? frames : recommended

  async function choose(assetId: string) {
    if (assetId === chosenId) return
    setSaving(assetId)
    const res = await fetch('/api/pipeline/set-cover-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, assetId }),
    })
    setSaving(null)
    if (!res.ok) {
      toast('Could not change the cover — try again.', 'error')
      return
    }
    toast('Cover updated.', 'success')
    setOpen(false)
    // The cover keeps the same URL and only its timestamp changes, so give the rebuild time to land.
    setTimeout(() => router.refresh(), 6000)
    router.refresh()
  }

  if (frames.length === 0) return null

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary" title="Pick which frame your cover uses">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        Choose cover
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="card animate-fade-in flex max-h-[85vh] w-full max-w-3xl flex-col p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">Choose a cover</h2>
            <p className="mt-1 text-sm text-muted">
              {showingAll
                ? 'Every shot from this reel. Pick the one that makes someone want to watch.'
                : 'The shots that work best as a cover. Pick one, or see every frame.'}
            </p>

            <div className="mt-4 flex-1 overflow-y-auto">
              <div className={`grid gap-3 ${vertical ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {tiles.map((t) => {
                  const isChosen = t.assetId === chosenId
                  return (
                    <button
                      key={t.assetId}
                      onClick={() => void choose(t.assetId)}
                      disabled={saving !== null}
                      className={`group relative overflow-hidden rounded-lg border-2 text-left transition-all disabled:cursor-wait ${
                        isChosen ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-muted'
                      }`}
                      title={t.reason ?? `Shot ${t.sceneIdx}`}
                    >
                      <img
                        src={t.url}
                        alt={`Shot ${t.sceneIdx}`}
                        className={`w-full object-cover ${vertical ? 'aspect-[9/16]' : 'aspect-video'}`}
                      />
                      {isChosen && (
                        <span className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Cover
                        </span>
                      )}
                      {saving === t.assetId && (
                        <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-xs font-medium text-white">
                          Updating…
                        </span>
                      )}
                      <span className="block px-2 py-1.5">
                        <span className="block text-[11px] font-medium text-muted">Shot {t.sceneIdx}</span>
                        {/* The reason is why this is a recommendation and not an instruction. */}
                        {t.reason && <span className="mt-0.5 block text-[11px] leading-snug text-faint">{t.reason}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
              <p className="text-xs text-muted">
                {cover?.source === 'creator'
                  ? 'You picked this cover — Kendrix won’t change it.'
                  : recommended.length > 0
                    // Say plainly when the recommendation looked at a subset. A shortlist drawn from 12 of
                    // 42 frames must not read as "these are the best of everything".
                    ? `Recommended from ${cover && cover.sampled < cover.total ? `${cover.sampled} of ${cover.total}` : `all ${frames.length}`} shots.`
                    : `${frames.length} shots.`}
              </p>
              <div className="flex items-center gap-2">
                {recommended.length > 0 && (
                  <button onClick={() => setShowAll((v) => !v)} className="btn-ghost btn-sm">
                    {showingAll ? 'Show recommended' : `Show all ${frames.length}`}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
