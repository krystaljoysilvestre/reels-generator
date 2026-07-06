'use client'
import { useEffect, useRef } from 'react'
import { useToast } from '@/components/Toast'
import { playChime, notifyReel } from '@/lib/reel-alert'

// App-wide "reel is done" alert. Mounted once in the Shell, it polls active/recent renders on EVERY page
// and fires when any reel transitions out of a working (render) state into ready/failed — a chime always,
// plus a desktop notification + tab-title badge when the tab is backgrounded, plus an in-app toast.
// Audio + notification permission are primed on the Render click (primeReelAlert); this only fires.

const WORKING = new Set(['rendering', 'render_qa'])
type Row = { id: string; title: string; status: string }

export function RenderAlertWatcher() {
  const { toast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const statuses = useRef<Map<string, string>>(new Map())
  const seeded = useRef(false) // first poll seeds the map without firing (don't alert for pre-existing state)
  const stashedTitle = useRef<string | null>(null)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const fire = (row: Row, ready: boolean) => {
      playChime(ready)
      toastRef.current(
        ready ? `✅ “${row.title}” is ready to review.` : `⚠️ “${row.title}” hit a snag during render.`,
        ready ? 'success' : 'error',
      )
      if (typeof document !== 'undefined' && document.hidden) {
        notifyReel(
          ready ? '✅ Reel ready' : '⚠️ Render failed',
          `${row.title} — ${ready ? 'ready to review.' : 'hit a snag during render.'}`,
        )
        if (stashedTitle.current === null) stashedTitle.current = document.title
        document.title = ready ? '✅ Reel ready' : '⚠️ Render failed'
      }
    }

    const poll = async () => {
      if (stopped) return
      let anyWorking = false
      try {
        const res = await fetch('/api/pipeline/active-renders', { cache: 'no-store' })
        if (res.ok) {
          const { reels: rows } = (await res.json()) as { reels: Row[] }
          const prev = statuses.current
          const next = new Map<string, string>()
          for (const r of rows) {
            next.set(r.id, r.status)
            if (WORKING.has(r.status)) anyWorking = true
            if (seeded.current) {
              const was = prev.get(r.id)
              if (was && WORKING.has(was) && !WORKING.has(r.status)) {
                if (r.status === 'spot_check') fire(r, true)
                else if (r.status === 'failed') fire(r, false)
              }
            }
          }
          statuses.current = next
          seeded.current = true
        }
      } catch { /* transient — try again next tick */ }
      // Poll briskly while something's rendering; idle back off when nothing is (background tabs are
      // throttled to ~60s by the browser regardless, which is fine — renders take minutes).
      if (!stopped) timer = setTimeout(() => void poll(), anyWorking ? 8000 : 30000)
    }
    void poll()

    const restore = () => {
      if (!document.hidden && stashedTitle.current !== null) {
        document.title = stashedTitle.current
        stashedTitle.current = null
      }
    }
    window.addEventListener('focus', restore)
    document.addEventListener('visibilitychange', restore)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', restore)
      document.removeEventListener('visibilitychange', restore)
    }
  }, [])

  return null
}
