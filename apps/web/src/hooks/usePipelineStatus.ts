'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface PipelineStatus {
  reelStatus: string
  costCents: number
  storyId: string | null
  steps: Array<{ stepName: string; status: string }>
  step: { name: string; status: string; attempt: number } | null
  failedStep: string | null
  scenes?: Array<{ idx: number; hasImage: boolean; imageAssetId: string | null }>
}

// Polls /api/pipeline/status while `enabled`. Powers the live story-loading + render-progress UX.
// Hygiene: one request in flight at a time; pauses on a hidden tab; exponential backoff on errors;
// AbortController + timer cleanup on unmount. Calls router.refresh() once whenever reelStatus changes so
// the server component re-hydrates with full data. `stopWhen` lets the consumer end polling at its own
// rest boundary (e.g. story_review for the Story Studio, spot_check for the render view).
export function usePipelineStatus(
  reelId: string,
  opts: { enabled?: boolean; scenes?: boolean; intervalMs?: number; stopWhen?: (s: PipelineStatus) => boolean } = {},
): PipelineStatus | null {
  const { enabled = true, scenes = false, intervalMs = 2200 } = opts
  const router = useRouter()
  const [status, setStatus] = useState<PipelineStatus | null>(null)
  const stopWhenRef = useRef(opts.stopWhen)
  stopWhenRef.current = opts.stopWhen
  const lastSigRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !reelId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false
    let errs = 0
    const ac = new AbortController()

    const loop = async () => {
      if (cancelled) return
      if (document.hidden || inFlight) {
        timer = setTimeout(loop, intervalMs)
        return
      }
      inFlight = true
      try {
        const res = await fetch(`/api/pipeline/status?reelId=${reelId}${scenes ? '&scenes=1' : ''}`, { signal: ac.signal })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as PipelineStatus
        if (cancelled) return
        errs = 0
        setStatus(data)
        // Refresh the server view on ANY progress — top-level status, a step changing state, a new
        // scene image landing, OR an existing image being replaced (reshoot / re-render) — not just
        // reelStatus. (During the storyboard build the status stays 'storyboard' while scenes/images
        // stream in, so a status-only check would never update.) Keying on each scene's imageAssetId
        // (not just a hasImage count) is what lets a swapped image auto-appear: the id changes even
        // though the count doesn't.
        const sig =
          data.reelStatus +
          '|' + data.steps.map((s) => `${s.stepName}:${s.status}`).join(',') +
          '|' + (data.scenes ? data.scenes.map((s) => `${s.idx}:${s.imageAssetId ?? ''}`).join(',') : '')
        if (sig !== lastSigRef.current) {
          lastSigRef.current = sig
          router.refresh()
        }
        inFlight = false
        if (stopWhenRef.current?.(data)) return // reached a rest boundary → stop polling
        timer = setTimeout(loop, intervalMs)
      } catch (e) {
        inFlight = false
        if (cancelled || (e as Error).name === 'AbortError') return
        errs = Math.min(errs + 1, 3)
        timer = setTimeout(loop, intervalMs * 2 ** errs)
      }
    }

    void loop()
    const onVis = () => {
      if (!document.hidden && !cancelled && !inFlight) {
        if (timer) clearTimeout(timer)
        void loop()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      ac.abort()
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reelId, enabled, scenes, intervalMs, router])

  return status
}
