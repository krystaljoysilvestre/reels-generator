'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PostMeta } from '@reels/core'
import { useToast } from '@/components/Toast'

// Publish-side tools for the storyboard footer once a reel is approved:
//  - PostCaptionButton: view/edit/copy the reel's post package (title/hook/caption/hashtags)
//  - LogPerformanceButton: paste platform numbers after posting (feeds what the channel learns from)

export function PostCaptionButton({ reelId }: { reelId: string }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<PostMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hashtagsText, setHashtagsText] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/pipeline/post-meta?reelId=${reelId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { postMeta: PostMeta | null } | null) => {
        setMeta(json?.postMeta ?? null)
        setHashtagsText((json?.postMeta?.hashtags ?? []).join(' '))
      })
      .finally(() => setLoading(false))
  }, [open, reelId])

  function update<K extends keyof PostMeta>(key: K, value: PostMeta[K]) {
    setMeta((m) => (m ? { ...m, [key]: value } : m))
  }

  async function save() {
    if (!meta) return
    setSaving(true)
    const hashtags = hashtagsText
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`))
      .slice(0, 8)
    const next = { ...meta, hashtags }
    const res = await fetch('/api/pipeline/post-meta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, postMeta: next }),
    })
    setSaving(false)
    if (!res.ok) {
      toast('Could not save the caption — try again.', 'error')
      return
    }
    setMeta(next)
    toast('Caption saved.', 'success')
  }

  function copyAll() {
    if (!meta) return
    const text = [meta.title, '', meta.hook, meta.caption, meta.hashtags.join(' ')]
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n')
    void navigator.clipboard.writeText(text).then(
      () => toast('Copied — paste it into your upload.', 'success'),
      () => toast('Could not copy.', 'error'),
    )
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary" title="The title, caption, and hashtags for this post">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Post caption
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="card animate-fade-in w-full max-w-lg p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">Post caption</h2>
            <p className="mt-1 text-sm text-muted">What viewers read before they press play. Edit anything, then copy it into your upload.</p>

            {loading ? (
              <p className="mt-6 text-sm text-muted">Loading…</p>
            ) : !meta ? (
              <p className="mt-6 text-sm text-muted">No caption yet — it&apos;s written when the story is approved.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Title</span>
                  <input value={meta.title} onChange={(e) => update('title', e.target.value)} className="input" maxLength={120} />
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
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-ghost btn-sm">Close</button>
              {meta && (
                <>
                  <button onClick={copyAll} className="btn-secondary btn-sm">Copy all</button>
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
export function PostToYouTubeButton({ reelId }: { reelId: string }) {
  const { toast } = useToast()
  const router = useRouter()
  const [posting, setPosting] = useState(false)

  async function post() {
    setPosting(true)
    const res = await fetch('/api/pipeline/publish-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId }),
    })
    const json = (await res.json().catch(() => null)) as { videoUrl?: string; error?: string } | null
    setPosting(false)
    if (!res.ok) {
      toast(json?.error ?? 'The upload didn’t go through — try again.', 'error')
      return
    }
    toast(`Live on YouTube${json?.videoUrl ? ` — ${json.videoUrl}` : ''}`, 'success')
    router.refresh()
  }

  return (
    <button onClick={() => void post()} disabled={posting} className="btn-accent" title="Upload this reel to your YouTube channel">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23 12s0-3.85-.49-5.7a3 3 0 0 0-2.11-2.11C18.55 3.7 12 3.7 12 3.7s-6.55 0-8.4.49A3 3 0 0 0 1.49 6.3C1 8.15 1 12 1 12s0 3.85.49 5.7a3 3 0 0 0 2.11 2.11c1.85.49 8.4.49 8.4.49s6.55 0 8.4-.49a3 3 0 0 0 2.11-2.11C23 15.85 23 12 23 12ZM9.75 15.5v-7L15.5 12l-5.75 3.5Z" />
      </svg>
      {posting ? 'Uploading…' : 'Post to YouTube'}
    </button>
  )
}

export function LogPerformanceButton({ reelId, initialViews }: { reelId: string; initialViews: number | null }) {
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
    setSaving(false)
    if (!res.ok) {
      toast('Could not save the numbers — try again.', 'error')
      return
    }
    toast('Logged. Your channel learns from what performs.', 'success')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary" title="Paste this post's numbers so the channel learns what works">
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
