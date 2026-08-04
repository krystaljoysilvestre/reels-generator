'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ReelStatusPill } from '@/components/ReelStatusPill'

type Script = { id: string; title: string; body: string; source: string; isReference: boolean }
type Reel = { id: string; status: string }

// One script on the shelf: read it, fix a line, duplicate it, or send it into production.
// A script a reel is already building from is locked here — the reel owns the script from then on
// (scene edits write back to it), so we point at the reel instead of offering a second place to edit.
export function ScriptRow({ script, channelId, reel, isEbn = false }: { script: Script; channelId: string; reel: Reel | null; isEbn?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(script.title)
  const [body, setBody] = useState(script.body)
  const [busy, setBusy] = useState<null | 'save' | 'reel' | 'copy' | 'delete'>(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const inProduction = reel !== null

  async function call(url: string, init: RequestInit, fallbackError: string) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(json?.error ?? fallbackError)
    return json
  }

  async function save() {
    if (!body.trim()) {
      setError('A script needs some words.')
      return
    }
    setBusy('save')
    setError('')
    try {
      await call(
        `/api/story/${script.id}`,
        { method: 'PATCH', body: JSON.stringify({ title: title.trim() || script.title, body: body.trim() }) },
        'Couldn’t save that — try again.',
      )
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save that — try again.')
    } finally {
      setBusy(null)
    }
  }

  async function makeReel() {
    setBusy('reel')
    setError('')
    try {
      const json = await call('/api/pipeline/provide-story', { method: 'POST', body: JSON.stringify({ storyId: script.id }) }, 'Couldn’t start the reel — try again.')
      // We wrote it → it stops for your approval first. You wrote it → straight to the shoot.
      router.push(json.status === 'story_review' ? '/review' : `/storyboard/${json.reelId}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t start the reel — try again.')
      setBusy(null)
    }
  }

  async function duplicate() {
    setBusy('copy')
    setError('')
    try {
      await call(
        '/api/story/create',
        { method: 'POST', body: JSON.stringify({ channelId, title: `${script.title} (copy)`.slice(0, 120), body: script.body }) },
        'Couldn’t duplicate that — try again.',
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t duplicate that — try again.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    setError('')
    try {
      await call(`/api/story/${script.id}`, { method: 'DELETE' }, 'Couldn’t delete that — try again.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete that — try again.')
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3.5 px-[18px] py-3 text-left transition-colors hover:bg-row-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-600 text-ink">{script.title}</span>
        </span>
        <span className="badge flex-shrink-0 bg-subtle text-muted">
          {script.source === 'user' ? 'written by you' : 'written for you'}
        </span>
        {reel && <ReelStatusPill status={reel.status} />}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border-soft px-[18px] py-4">
          {editing ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="input" />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-muted">The narration, exactly as you want it spoken</span>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} className="input h-64 resize-y" />
              </label>
              {script.isReference && (
                <p className="mt-2 text-xs text-muted">This one teaches the channel its voice — changes shape how future scripts sound.</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => void save()} disabled={busy !== null} className="btn-accent btn-sm">
                  {busy === 'save' ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setTitle(script.title)
                    setBody(script.body)
                    setError('')
                  }}
                  disabled={busy !== null}
                  className="btn-ghost btn-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{script.body}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {inProduction ? (
                  <>
                    <Link href={reel.status === 'story_review' || reel.status === 'drafting' ? '/review' : `/storyboard/${reel.id}`} className="btn-secondary btn-sm">
                      Open its reel
                    </Link>
                    <p className="text-xs text-muted">This script is in production — edit it from its reel.</p>
                  </>
                ) : (
                  <>
                    {/* EBN: the shelf is a writing space, not a production door — reels on this channel
                        are built from source material, never from a pasted script (2026-08-03-001). */}
                    {!isEbn && (
                      <button type="button" onClick={() => void makeReel()} disabled={busy !== null} className="btn-accent btn-sm">
                        {busy === 'reel' ? 'Starting…' : 'Make a reel'}
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing(true)} disabled={busy !== null} className="btn-secondary btn-sm">
                      Edit
                    </button>
                  </>
                )}
                <button type="button" onClick={() => void duplicate()} disabled={busy !== null} className="btn-ghost btn-sm">
                  {busy === 'copy' ? 'Copying…' : 'Duplicate'}
                </button>
                {!inProduction &&
                  (confirmDelete ? (
                    <span className="flex items-center gap-2 text-xs text-muted">
                      Delete this script?
                      <button type="button" onClick={() => void remove()} disabled={busy !== null} className="font-semibold text-danger hover:underline">
                        {busy === 'delete' ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy !== null} className="hover:text-ink">
                        Keep it
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} className="btn-ghost btn-sm text-danger">
                      Delete
                    </button>
                  ))}
              </div>
              {isEbn && !inProduction && (
                <p className="mt-3 text-xs text-muted">
                  Scripts here are notes — this channel&apos;s reels are built from source material when you create one.
                </p>
              )}
            </>
          )}
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
