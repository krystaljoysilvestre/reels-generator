'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PostMeta } from '@reels/core'
import { captionHashtags, draftCaptionText } from './publishing-handoff'
import { useToast } from '@/components/Toast'

// Publish-side tools for the storyboard footer once a reel is approved:
//  - PostCaptionButton: view/edit/copy the reel's post package (title/thumbnail text/hook/caption/hashtags)
//  - LogPerformanceButton: paste platform numbers after posting (feeds what the channel learns from)

// Each trigger takes its skin from the caller: these buttons sit on a light bar in some places and on the
// dark finished-reel screen in others (`.btn-dark` there). The dialogs are always light cards.
export function PostCaptionButton({ reelId, triggerClass = 'btn-secondary', triggerLabel = 'Post caption' }: { reelId: string; triggerClass?: string; triggerLabel?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<PostMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hashtagsText, setHashtagsText] = useState('')
  const [imageCredits, setImageCredits] = useState('')
  const [fallbackCaption, setFallbackCaption] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const loadedReel = useRef<string | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  // Cleared on unmount so a pending cover refresh can't fire against a gone component.
  const coverRefresh = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (coverRefresh.current) clearTimeout(coverRefresh.current) }, [])

  useEffect(() => {
    // Keep this session's draft when the dialog closes or the parent refreshes.
    // The caller keys the editor by reel ID, so drafts never follow another reel.
    if (!open || loadedReel.current === reelId) return
    let current = true
    setLoading(true)
    setLoadError(false)
    fetch(`/api/pipeline/post-meta?reelId=${reelId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the caption.')
        return response.json() as Promise<{ postMeta: PostMeta | null; imageCredits: string; captionText: string }>
      })
      .then((json) => {
        if (!current) return
        loadedReel.current = reelId
        setMeta(json.postMeta)
        setSavedSignature(JSON.stringify(json.postMeta))
        setHashtagsText((json.postMeta?.hashtags ?? []).join(' '))
        setImageCredits(json.imageCredits ?? '')
        setFallbackCaption(json.captionText ?? '')
      })
      .catch(() => { if (current) setLoadError(true) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [open, reelId, loadAttempt])

  function update<K extends keyof PostMeta>(key: K, value: PostMeta[K]) {
    setMeta((m) => (m ? { ...m, [key]: value } : m))
  }

  function draftMeta() {
    if (!meta) return null
    return { ...meta, hashtags: captionHashtags(hashtagsText) }
  }

  const hasUnsavedChanges = meta !== null && savedSignature !== null && JSON.stringify(draftMeta()) !== savedSignature

  async function save() {
    const next = draftMeta()
    if (!next) return
    setSaving(true)
    try {
      const res = await fetch('/api/pipeline/post-meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId, postMeta: next }),
      })
      if (!res.ok) { toast('Could not save the caption — try again.', 'error'); return }
      setMeta(next)
      setSavedSignature(JSON.stringify(next))
      const body = (await res.json().catch(() => null)) as { coverRebuilding?: boolean; coverRebuildQueueFailed?: boolean } | null
      // Text is saved now; a slower cover rebuild must not leave the saved preview stale.
      router.refresh()
      if (body?.coverRebuildQueueFailed) {
        toast('Caption saved, but the cover could not update. Check it before posting.', 'error')
      } else if (body?.coverRebuilding) {
        toast('Saved — updating your cover.', 'success')
        if (coverRefresh.current) clearTimeout(coverRefresh.current)
        coverRefresh.current = setTimeout(() => router.refresh(), 6000)
      } else {
        toast('Caption saved.', 'success')
      }
    } catch { toast('Could not save. Check your connection and try again.', 'error') }
    finally { setSaving(false) }
  }

  async function copyAll() {
    const text = draftCaptionText(meta, hashtagsText, imageCredits, fallbackCaption)
    try {
      await navigator.clipboard.writeText(text)
      toast(hasUnsavedChanges ? 'Caption copied with any image credits. Save to keep your edits.' : 'Caption copied, including any image credits.', 'success')
    } catch { setManualCopy(true); toast('Select the complete caption below and copy it manually.', 'error') }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClass} title="The title, caption, and hashtags for this post">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {triggerLabel}{hasUnsavedChanges && <span className="text-[10px] opacity-75"> · Unsaved</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Post caption" onClick={() => setOpen(false)}>
          <div className="card animate-fade-in max-h-[90dvh] w-full max-w-lg overflow-y-auto p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">Post caption</h2>
            <p className="mt-1 text-sm text-muted">Edit your post details, then copy the caption. Save changes to use them in downloads and connected uploads.</p>

            {loading ? (
              <p className="mt-6 text-sm text-muted">Loading…</p>
            ) : loadError ? (
              <div className="mt-6 text-sm text-muted" role="alert"><p>Could not load the caption. Check your connection and try again.</p><button onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="btn-secondary mt-2">Try again</button></div>
            ) : !meta ? (
              <label className="mt-4 block"><span className="mb-2 block text-xs text-muted">Story caption</span><textarea readOnly value={fallbackCaption} rows={6} className="input resize-y" /></label>
            ) : (
              <fieldset disabled={saving} className="mt-4 flex min-w-0 flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Title</span>
                  <input value={meta.title} onChange={(e) => update('title', e.target.value)} className="input" maxLength={120} />
                </label>
                {/* The words burned onto the thumbnail — a SEPARATE field from the title, and editable
                    for two reasons. It compiles into something the creator would otherwise never see,
                    which the resolution discipline calls a defect rather than a convenience. And the
                    generator is measurably unreliable here: asked for the load-bearing specific, it
                    still reaches for the mood around it (post-meta.v1.3, n=4). This is the override. */}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">
                    Thumbnail text — the 3–5 huge words on the image, not the title again
                  </span>
                  <input
                    value={meta.thumbnailText}
                    onChange={(e) => update('thumbnailText', e.target.value)}
                    className="input"
                    maxLength={60}
                    placeholder={meta.title.slice(0, 40)}
                  />
                  <span className="mt-1 block text-xs text-muted">
                    Leave empty and the whole title gets burned on instead. Carry over the concrete
                    detail — the number, the name, the object.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Hook — the first line a scroller reads</span>
                  <input value={meta.hook} onChange={(e) => update('hook', e.target.value)} className="input" maxLength={200} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Caption</span>
                  <textarea value={meta.caption} onChange={(e) => update('caption', e.target.value)} className="input h-24 resize-y" maxLength={2200} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Hashtags</span>
                  <input value={hashtagsText} onChange={(e) => setHashtagsText(e.target.value)} className="input" placeholder="#…" />
                </label>
              </fieldset>
            )}

            {!loading && !loadError && hasUnsavedChanges && <p role="status" className="mt-4 text-xs text-muted">Unsaved changes. Your draft stays here when you close this window. Save before leaving the reel.</p>}
            {!loading && !loadError && imageCredits && <div className="mt-4 text-xs text-muted"><p className="font-semibold">Image credits included when copying</p><p className="mt-1 whitespace-pre-wrap">{imageCredits}</p></div>}
            {manualCopy && !loading && !loadError && <label className="mt-4 block"><span className="mb-1 block text-xs text-muted">Complete caption with credits</span><textarea readOnly value={draftCaptionText(meta, hashtagsText, imageCredits, fallbackCaption)} onFocus={(event) => event.target.select()} rows={6} className="input resize-y" /></label>}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">Close</button>
              {!loading && !loadError && (meta || fallbackCaption) && <button onClick={() => void copyAll()} className="btn-secondary btn-sm">Copy caption</button>}
              {!loading && !loadError && meta && (
                <>
                  <button onClick={() => void save()} disabled={saving} className="btn-accent btn-sm">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Uploads the approved reel to the connected YouTube channel (title/caption/AI label included).
// Rendered only when the YOUTUBE_* keys are configured.
export function PostToYouTubeButton({ reelId, triggerClass = 'btn-accent' }: { reelId: string; triggerClass?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [posting, setPosting] = useState(false)

  async function post() {
    setPosting(true)
    try {
      const res = await fetch('/api/pipeline/publish-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId }),
      })
      const json = (await res.json().catch(() => null)) as { videoUrl?: string; error?: string } | null
      if (!res.ok) { toast(json?.error ?? 'The upload didn’t go through — try again.', 'error'); return }
      toast('Uploaded to YouTube. Check visibility in YouTube Studio.', 'success')
      router.refresh()
    } catch { toast('Could not upload. Check your connection and try again.', 'error') }
    finally { setPosting(false) }
  }

  return (
    <button type="button" onClick={() => void post()} disabled={posting} className={triggerClass} title="Upload this reel to your YouTube channel">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23 12s0-3.85-.49-5.7a3 3 0 0 0-2.11-2.11C18.55 3.7 12 3.7 12 3.7s-6.55 0-8.4.49A3 3 0 0 0 1.49 6.3C1 8.15 1 12 1 12s0 3.85.49 5.7a3 3 0 0 0 2.11 2.11c1.85.49 8.4.49 8.4.49s6.55 0 8.4-.49a3 3 0 0 0 2.11-2.11C23 15.85 23 12 23 12ZM9.75 15.5v-7L15.5 12l-5.75 3.5Z" />
      </svg>
      {posting ? 'Uploading…' : 'Upload to YouTube'}
    </button>
  )
}

export function LogPerformanceButton({ reelId, initialViews, triggerClass = 'btn-secondary' }: { reelId: string; initialViews: number | null; triggerClass?: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [views, setViews] = useState(initialViews != null ? String(initialViews) : '')
  const [likes, setLikes] = useState('')
  const [comments, setComments] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const v = parseInt(views, 10)
    if (!Number.isFinite(v) || v < 0) {
      toast('Enter the view count first.', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/pipeline/record-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reelId,
          views: v,
          ...(likes.trim() ? { likes: parseInt(likes, 10) || 0 } : {}),
          ...(comments.trim() ? { comments: parseInt(comments, 10) || 0 } : {}),
        }),
      })
      if (!res.ok) {
        toast('Could not save the numbers — try again.', 'error')
        return
      }
      toast('Logged. Your channel learns from what performs.', 'success')
      setOpen(false)
      router.refresh()
    } catch { toast('Could not save. Check your connection and try again.', 'error') }
    finally { setSaving(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClass} title="Paste this post's numbers so the channel learns what works">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3v18h18M7 14l4-4 4 4 5-6" />
        </svg>
        {initialViews != null ? 'Update numbers' : 'Log performance'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="card animate-fade-in w-full max-w-sm p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">How did this one do?</h2>
            <p className="mt-1 text-sm text-muted">Paste the numbers from the platform. Stories that perform shape what gets written next.</p>
            <div className="mt-4 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Views</span>
                <input value={views} onChange={(e) => setViews(e.target.value)} inputMode="numeric" className="input" placeholder="0" autoFocus />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Likes (optional)</span>
                  <input value={likes} onChange={(e) => setLikes(e.target.value)} inputMode="numeric" className="input" placeholder="—" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Comments (optional)</span>
                  <input value={comments} onChange={(e) => setComments(e.target.value)} inputMode="numeric" className="input" placeholder="—" />
                </label>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">Cancel</button>
              <button onClick={() => void save()} disabled={saving} className="btn-accent btn-sm">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
