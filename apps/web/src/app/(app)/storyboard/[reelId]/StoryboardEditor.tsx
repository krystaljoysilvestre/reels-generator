'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'
import type { ChannelVoice, VoiceSettings, IntensityKey, MotionSettings } from '@reels/core'
import { CAMERA_MOVES, INTENSITIES, parseMotion, composeMotion, resolveMotionSettings, motionCostCents } from '@reels/core'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { PipelinePhaseStepper } from '@/components/PipelinePhaseStepper'
import { useToast } from '@/components/Toast'

type Scene = InferSelectModel<typeof scenes>
type Story = InferSelectModel<typeof stories>

// Voices stored on the channel are ChannelVoice: { providerId, name, gender, description }.
// providerId IS the ElevenLabs voice id used at render — never use a non-existent `id`.
type Voice = ChannelVoice
// In the picker, a recommended voice also carries a "why it fits this reel" reason (per_story
// recommendations). Single-channel pool voices are plain ChannelVoice (no reason).
type PickerVoice = ChannelVoice & { reason?: string | undefined }

const fmtSecs = (secs: number) => `${Math.round(secs * 10) / 10}s`

interface StoryboardEditorProps {
  reel: { id: string; status: string; voiceId: string | null; costCents: number; operatorMinutes: number; language: string }
  story: Story | null
  scenes: Scene[]
  voicePool: Voice[]
  // Context for recommending a narrator on the fly when voicePool is empty (per_story channels).
  voiceRecommend: { nicheDescription: string; language: string; toneConfig: unknown; searchKeyword: string }
  sceneImages: Record<number, string>
  sceneVideoVariations: Record<number, string[]>
  renderUrl: string | null
  musicUrl: string | null // this reel's AI-composed bed (musicMode='ai'), for hearing/vetting on review
  initialVoiceSettings: VoiceSettings // starting point for the delivery sliders
  voiceSettingsOverridden: boolean // reel already has a saved manual override
  channelName: string
  moodTint: string // channel-mood accent (dark=red / warm=amber / neutral=midnight) for ambient touches
  failure: { step: string; error: string } | null
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool, voiceRecommend,
  sceneImages, sceneVideoVariations, renderUrl: initialRenderUrl, musicUrl,
  initialVoiceSettings, voiceSettingsOverridden,
  channelName, moodTint, failure,
}: StoryboardEditorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [scenes, setScenes] = useState(initialScenes)
  const [sceneSaving, setSceneSaving] = useState<Record<number, 'saving' | 'saved'>>({}) // per-scene script-edit status
  const [activeVar, setActiveVar] = useState<Record<number, number>>({}) // which video variation plays per scene tile
  const [loadedMedia, setLoadedMedia] = useState<Set<number>>(new Set()) // scenes whose image/video has loaded (for develop-in)
  const markLoaded = (idx: number) => setLoadedMedia((s) => (s.has(idx) ? s : new Set(s).add(idx)))
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null) // master-detail: which scene the inspector shows
  const [timelineView, setTimelineView] = useState<'strip' | 'grid'>('strip') // thumbnail rail layout
  const shrinkRaf = useRef<number | null>(null) // throttles the scroll→--shrink write to one per frame
  const scrollRef = useRef<HTMLDivElement>(null) // the single scene scroll container; holds --shrink + --hold for the rail
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = 0
    el.style.setProperty('--shrink', '0')
    el.style.setProperty('--hold', '0px')
  }, [timelineView]) // reset rail collapse on view switch
  const tierBusyRef = useRef<Set<number>>(new Set()) // scenes with an in-flight motion toggle (drops rapid flips)
  const [selectedVoice, setSelectedVoice] = useState(reel.voiceId ?? voicePool[0]?.providerId ?? '')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  // Narrator delivery: the picker's sliders edit this; `voiceTouched` = the operator overrode the
  // per-story auto-tuning, so we send it to the render (else generate_tts auto-derives from mood).
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(initialVoiceSettings)
  const [voiceTouched, setVoiceTouched] = useState(voiceSettingsOverridden)
  const [renderUrl] = useState(initialRenderUrl)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opMinutes, setOpMinutes] = useState(reel.operatorMinutes)
  const startedAt = useRef(Date.now())

  // per_story channels store no voicePool; recommend narrators on the fly (same call the
  // creation wizard uses) so this reel has something to pick and render isn't dead-ended.
  const [recommendedPool, setRecommendedPool] = useState<PickerVoice[]>([])
  const [recsLoading, setRecsLoading] = useState(false)
  const [recsError, setRecsError] = useState<string | null>(null)
  const recsFetchedRef = useRef(false)
  const needsRecs = voicePool.length === 0 && !!voiceRecommend.nicheDescription
  // Single-voice channels use their stored pool; per_story falls back to recommendations.
  const effectiveVoices: PickerVoice[] = voicePool.length > 0 ? voicePool : recommendedPool

  async function fetchRecommendedVoices() {
    setRecsLoading(true)
    setRecsError(null)
    try {
      const res = await fetch('/api/voices/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheDescription: voiceRecommend.nicheDescription,
          language: voiceRecommend.language,
          toneConfig: voiceRecommend.toneConfig,
          searchKeyword: voiceRecommend.searchKeyword || undefined,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not load voices.')
      const recs = (json.voices ?? []) as Array<{ id: string; name: string; gender: string; description: string; reason?: string }>
      const pool: PickerVoice[] = recs.map((v) => ({ providerId: v.id, name: v.name, gender: v.gender, description: v.description, reason: v.reason }))
      setRecommendedPool(pool)
      // Auto-select the top recommendation if the reel has no voice yet (operator can change it).
      setSelectedVoice((cur) => cur || pool[0]?.providerId || '')
    } catch (e) {
      setRecsError(e instanceof Error ? e.message : 'Could not load voices.')
    } finally {
      setRecsLoading(false)
    }
  }

  useEffect(() => {
    if (recsFetchedRef.current || !needsRecs) return
    recsFetchedRef.current = true
    void fetchRecommendedVoices()
  }, [needsRecs])

  // Keep a valid selection: default to the first scene once scenes land; recover to the first if the
  // selected scene ever disappears. Defaults to null (not 1) since scenes can be empty mid-build.
  useEffect(() => {
    if (scenes.length === 0) { if (selectedIdx !== null) setSelectedIdx(null); return }
    if (selectedIdx === null || !scenes.some((s) => s.idx === selectedIdx)) setSelectedIdx(scenes[0]!.idx)
  }, [scenes, selectedIdx])

  // Operator-minutes: tick every 30s, but best-effort only — skip hidden tabs (no point spamming while
  // the operator's away), stop once the reel is terminal (minutes no longer accrue), and swallow errors
  // quietly (a missed ping isn't worth a toast). [E5.6]
  useEffect(() => {
    if (['published', 'scheduled'].includes(reel.status)) return
    const interval = setInterval(async () => {
      if (document.hidden) return
      const elapsed = Math.round((Date.now() - startedAt.current) / 60000)
      const next = reel.operatorMinutes + elapsed
      setOpMinutes(next)
      try {
        await fetch('/api/pipeline/update-op-minutes', {
          method: 'POST',
          body: JSON.stringify({ reelId: reel.id, opMinutes: next }),
          headers: { 'Content-Type': 'application/json' },
        })
      } catch { /* best-effort telemetry — ignore */ }
    }, 30_000)
    return () => clearInterval(interval)
  }, [reel.id, reel.operatorMinutes, reel.status])

  // Pull a friendly message off a failed response; a 429 is a calm "busy, try again" (we never auto-retry).
  async function failMessage(res: Response, fallback: string) {
    const j = await res.json().catch(() => null)
    return (j && typeof j.error === 'string' ? j.error : fallback)
  }

  // Regenerate a scene's image. The optional `instruction` (composed from the Shot/Lighting pickers, e.g.
  // "a wider shot, darker moodier lighting") is rewritten by the LLM into a proper image prompt; with no
  // instruction it's a plain fresh re-roll.
  async function handleRegenImage(sceneIdx: number, opts?: { instruction?: string; improve?: boolean }) {
    setLoading(`regen-${sceneIdx}`)
    const res = await fetch('/api/pipeline/regen-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, instruction: opts?.instruction?.trim() || undefined, improve: opts?.improve || undefined }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      toast(await failMessage(res, 'Could not reshoot this scene.'), res.status === 429 ? 'info' : 'error')
      return
    }
    // The regenerated image gets a NEW asset id → a new URL (page.tsx cache-busts on it), so the tile
    // swaps once it lands. Clear this scene's loaded flag so the develop-in reveal plays for the fresh
    // image instead of holding the stale one. A new image also invalidates any motion (the clip was
    // animated off the old image): the route reset the scene to a still, so reflect that locally too.
    setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier: 'still' } : s)))
    setLoading(null)
    router.refresh()
  }

  // The Motion switch = pure intent: does this beat animate at render? Toggling is instant + free — it
  // just sets the scene's tier (no generation, no spend). Optimistic local update so the tile flips at
  // once. A per-scene in-flight guard drops rapid flips so we don't burst the endpoint. A cached clip is
  // kept when switching off, so flipping back on instantly plays it again.
  async function toggleMotion(sceneIdx: number, currentlyVideo: boolean) {
    if (tierBusyRef.current.has(sceneIdx)) return
    tierBusyRef.current.add(sceneIdx)
    const tier = currentlyVideo ? 'still' : 'video'
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier } : s)))
    try {
      await fetch('/api/pipeline/set-scene-tier', {
        method: 'POST',
        body: JSON.stringify({ reelId: reel.id, sceneIdx, tier }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch { /* optimistic — the next render reconciles tier anyway */ }
    finally { tierBusyRef.current.delete(sceneIdx) }
  }

  // Preview = the single paid generate action: animate this (video-tier) scene now so you can watch the
  // motion before render (Kling i2v, ~50¢). The clip is reused at render. Shown for any video-tier scene
  // without a clip yet — hero or one you just switched on. (At render, animate_scenes generates any that
  // were never previewed, so previewing is always optional.)
  async function handlePreview(sceneIdx: number) {
    setLoading(`animate-${sceneIdx}`)
    const res = await fetch('/api/pipeline/preview-animation', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(null)
    if (!res.ok) {
      toast(await failMessage(res, 'Could not animate this scene.'), res.status === 429 ? 'info' : 'error')
      return
    }
    toast('This scene’s moving now.', 'success')
    router.refresh() // pull in the new video asset so the tile starts playing it
  }

  // Persist a scene's motion — how it moves (motionPrompt) and/or quality + length (motionSettings).
  // Applies to both the on-demand preview and the render-time animation. Optimistic local update; any
  // change clears the stale clip server-side, so we refresh + drop the loaded flag to re-animate.
  async function saveSceneMotion(sceneIdx: number, payload: { motionPrompt?: string; motionSettings?: MotionSettings }) {
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, ...payload } : s)))
    const res = await fetch('/api/pipeline/set-scene-motion', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, ...payload }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null)
    const j = res && res.ok ? await res.json().catch(() => null) : null
    if (j?.changed) {
      setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
      router.refresh()
    }
  }

  // Persist an edited scene's narration (on blur). The route rebuilds story.body from all scenes so the
  // render's audio + timings match the edited script. Re-render to apply.
  async function saveSceneText(sceneIdx: number, narrationText: string) {
    if (!narrationText.trim()) return
    setSceneSaving((s) => ({ ...s, [sceneIdx]: 'saving' }))
    const res = await fetch('/api/pipeline/edit-scene-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, sceneIdx, narrationText: narrationText.trim() }),
    })
    setSceneSaving((s) => ({ ...s, [sceneIdx]: res.ok ? 'saved' : 'saving' }))
  }

  // Persist a scene's optional on-screen text (a title burned at render, separate from the captions).
  // Optimistic local update; fire-and-forget save. Re-render to apply.
  async function saveSceneOnScreen(sceneIdx: number, onScreenText: string) {
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, onScreenText } : s)))
    await fetch('/api/pipeline/set-scene-onscreen', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, onScreenText }),
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})
  }

  async function handleRender() {
    // Guard: TTS hard-fails with no voice, so never queue a render without one.
    if (!selectedVoice) { setShowVoicePicker(true); return }
    setError(null)
    setLoading('render')
    const res = await fetch('/api/pipeline/trigger-render', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, voiceId: selectedVoice, ...(voiceTouched ? { voiceSettings } : {}) }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      setError(await failMessage(res, 'Could not start the render.'))
      return
    }
    setLoading(null)
    toast('Render started — your reel will be ready soon.', 'success')
    router.push('/dashboard')
  }

  // Spot-check gate: operator watches the rendered reel and signs it off.
  async function handleApprove() {
    setLoading('approve')
    setError(null)
    const res = await fetch('/api/pipeline/approve-spot-check', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, opMinutes }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      setError(await failMessage(res, 'Could not approve this reel.'))
      return
    }
    setLoading(null)
    toast('Reel approved.', 'success')
    router.refresh()
  }

  // Operator has uploaded the exported package → mark it published (terminal).
  async function handlePublish() {
    setLoading('publish')
    setError(null)
    const res = await fetch('/api/pipeline/mark-published', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      setError(await failMessage(res, 'Could not mark this reel published.'))
      return
    }
    setLoading(null)
    toast('Published.', 'success')
    router.refresh()
  }

  // Recover a hard-failed reel: re-run the failed step (prior steps are cached) and resume the chain.
  async function handleRetry() {
    setLoading('retry')
    setError(null)
    const res = await fetch('/api/pipeline/retry-reel', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      setError(await failMessage(res, 'Could not retry this reel.'))
      return
    }
    setLoading(null)
    toast('Picking up where it stopped…', 'info')
    router.refresh()
  }

  // Move the selection one scene left/right (keyboard nav on the timeline rail).
  function selectDelta(d: number) {
    if (selectedIdx == null || scenes.length === 0) return
    const i = scenes.findIndex((s) => s.idx === selectedIdx)
    const next = scenes[Math.min(scenes.length - 1, Math.max(0, i + d))]
    if (next) setSelectedIdx(next.idx)
  }

  const currentVoice = effectiveVoices.find((v) => v.providerId === selectedVoice)
  const selectedScene = selectedIdx != null ? scenes.find((s) => s.idx === selectedIdx) ?? null : null
  const isRenderable = ['storyboard', 'story_review', 'approved', 'failed'].includes(reel.status)
  const canRender = isRenderable && !!selectedVoice
  // Post-render gates (spot-check → approved → published) get their own action bar, not the voice/render one.
  const isPostRender = ['spot_check', 'approved', 'scheduled', 'published'].includes(reel.status)

  // Live build/render progress: scenes/images still generating (status='storyboard' before they land), or
  // the render chain running. Poll while active — the hook refreshes the server so images + status update.
  const imagesReady = scenes.length > 0 && scenes.every((s) => sceneImages[s.idx])
  const showProgress = (reel.status === 'storyboard' && !imagesReady) || reel.status === 'rendering' || reel.status === 'render_qa'
  const live = usePipelineStatus(reel.id, { enabled: showProgress, scenes: true })
  const sceneProgress = live?.scenes?.length
    ? { done: live.scenes.filter((s) => s.hasImage).length, total: live.scenes.length }
    : scenes.length > 0
      ? { done: scenes.filter((s) => sceneImages[s.idx]).length, total: scenes.length }
      : undefined

  // Ambient "work in progress" bar — mood-tinted, only while the pipeline runs
  const ambient = showProgress ? (
    <div className="h-0.5 flex-shrink-0 animate-think" style={{ ['--think-tint' as string]: moodTint }} aria-hidden />
  ) : null

  // The selected scene's editor (or a fallback) — shared between the strip + grid layouts below
  const detail = selectedScene ? (
    <SceneInspector
      key={selectedScene.idx}
      scene={selectedScene}
      imgSrc={sceneImages[selectedScene.idx]}
      variations={sceneVideoVariations[selectedScene.idx] ?? []}
      activeVar={activeVar[selectedScene.idx] ?? 0}
      setActiveVar={setActiveVar}
      loaded={loadedMedia.has(selectedScene.idx)}
      markLoaded={markLoaded}
      loading={loading}
      moodTint={moodTint}
      sceneSaving={sceneSaving[selectedScene.idx]}
      setScenes={setScenes}
      setSceneSaving={setSceneSaving}
      onToggleMotion={toggleMotion}
      onPreview={handlePreview}
      onReshoot={handleRegenImage}
      onSaveText={saveSceneText}
      onSaveMotion={saveSceneMotion}
      onSaveOnScreen={saveSceneOnScreen}
    />
  ) : (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 px-8 py-16 text-center text-sm text-muted">
      <span className="h-2.5 w-2.5 animate-breathe rounded-full" style={{ backgroundColor: moodTint }} />
      {scenes.length === 0 ? 'Your scenes are being shot…' : 'Pick a scene to start.'}
    </div>
  )

  // Final render preview + its music bed (only once a render exists)
  const preview = renderUrl ? (
    <div id="preview" className="border-t border-border px-4 py-6 sm:px-8">
      <p className="mb-3 text-xs font-medium text-muted">Render preview</p>
      <video
        src={renderUrl}
        controls
        className="max-h-[28rem] rounded-xl border border-border shadow-sm"
        style={{ aspectRatio: '9/16' }}
      />

      {/* AI-composed bed for this reel — hear the music on its own to vet it (it's mixed under the
          narration in the video above). Only present for AI-music channels. */}
      {musicUrl && (
        <div className="mt-4 max-w-md rounded-lg border border-border bg-subtle/40 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            Music · composed for this reel
          </p>
          <audio src={musicUrl} controls preload="none" className="h-9 w-full" />
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">An original track composed for this story&apos;s mood — heard on its own here, mixed under the narration in the video.</p>
        </div>
      )}
    </div>
  ) : null

  // Collapsing-rail scroll model (strip view), all in ONE scroll container, rAF-throttled, written as CSS
  // vars (no React re-render → tracks scroll 1:1):
  //   --shrink 0→1 over the first COLLAPSE_PX → the rail shrinks to a filmstrip
  //   --hold = min(scrollTop, COLLAPSE_PX)px → translateY that PINS the rail+panel in place while it shrinks;
  //     once past COLLAPSE_PX the hold maxes out, so further scroll carries the whole thing up and away.
  // Because rail + panel sit in the same translated flow, the panel is always BELOW the rail — never under it.
  const onCollapseScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (shrinkRaf.current != null) return
    shrinkRaf.current = requestAnimationFrame(() => {
      shrinkRaf.current = null
      const COLLAPSE_PX = 200
      const st = el.scrollTop
      el.style.setProperty('--shrink', Math.min(1, Math.max(0, st / COLLAPSE_PX)).toFixed(3))
      el.style.setProperty('--hold', Math.min(st, COLLAPSE_PX).toFixed(1) + 'px')
    })
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-40 flex flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/dashboard" className="btn-ghost btn-sm -ml-1.5" title="Back to reels">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </a>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-ink">{story?.title ?? 'Untitled reel'}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="hidden font-mono sm:inline">{reel.id.slice(0, 8)}</span>
              <span className="hidden text-faint sm:inline">·</span>
              <span className="badge bg-subtle text-muted">{reel.status.replace(/_/g, ' ')}</span>
              <span className="hidden text-faint sm:inline">·</span>
              <span className="hidden truncate sm:inline">{channelName}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4 font-mono text-xs tabular-nums text-muted">
          {/* key={value} replays the flash on each change, so live cost/time updates read as live */}
          <span key={`c${reel.costCents}`} className="animate-value-flash" title="Spend so far">${(reel.costCents / 100).toFixed(2)}</span>
          <span key={`m${opMinutes}`} className="animate-value-flash" title="Operator minutes">{opMinutes} min</span>
        </div>
      </div>

      {/* Failure banner — surfaces a hard pipeline failure so the reel isn't a silent stall */}
      {reel.status === 'failed' && failure && (
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-danger/30 bg-danger-soft px-4 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">This reel failed at “{failure.step.replace(/_/g, ' ')}”</p>
            <p className="mt-0.5 break-words text-xs text-danger/80">{failure.error}</p>
          </div>
          <button onClick={handleRetry} disabled={loading === 'retry'} className="btn-secondary btn-sm flex-shrink-0">
            {loading === 'retry' ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Live build / render progress — phases + scene readiness while the pipeline runs */}
      {showProgress && (
        <PipelinePhaseStepper reelStatus={live?.reelStatus ?? reel.status} steps={live?.steps ?? []} sceneProgress={sceneProgress} />
      )}

      {/* Scene area — a compact thumbnail TIMELINE on top, the selected scene's INSPECTOR below. In STRIP
          view the timeline keeps its own lane at the top while the inspector scrolls in a SEPARATE region
          below (so its content never tucks under the rail); the rail shrinks as that inspector scrolls. In
          GRID view the whole area scrolls as one. */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [overflow-anchor:none]"
        onScroll={timelineView === 'strip' ? onCollapseScroll : undefined}
      >
        {/* ONE scroll. In STRIP view the rail + selected-scene panel share a single translated wrapper:
            scrolling first collapses the rail in place (the panel stays glued to its bottom — same flow, so
            it can never slide under it), then once collapsed the whole wrapper scrolls up together. GRID
            view just scrolls normally. */}
        <div
          className="flex flex-col will-change-transform"
          style={timelineView === 'strip' ? { transform: 'translateY(var(--hold, 0px))' } : undefined}
        >
          {ambient}
          <SceneTimeline
            scenes={scenes}
            sceneImages={sceneImages}
            sceneVideoVariations={sceneVideoVariations}
            loadedMedia={loadedMedia}
            markLoaded={markLoaded}
            loading={loading}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            onArrow={selectDelta}
            moodTint={moodTint}
            view={timelineView}
            onViewChange={setTimelineView}
          />
          {detail}
          {preview}
        </div>

        {/* Strip-only spacer: the first ~200px gives the rail room to collapse-in-place (the "hold"); it then
            grows with --shrink so the scroll height never DROPS mid-collapse (which would clamp the scroll,
            re-expand the rail, and shake). */}
        {timelineView === 'strip' && (
          <div aria-hidden className="flex-shrink-0" style={{ height: 'calc(200px + 280px * var(--shrink, 0))' }} />
        )}
      </div>

      {/* Bottom bar — voice + render (storyboard flow only) */}
      {!isPostRender && (
      <div className="sticky bottom-0 z-40 flex flex-shrink-0 flex-wrap items-center gap-4 border-t border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
        <button onClick={() => setShowVoicePicker(true)} className={`btn-secondary ${!selectedVoice ? 'ring-1 ring-accent' : ''}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" />
          </svg>
          {currentVoice ? (currentVoice.description ? `${currentVoice.name} · ${currentVoice.description}` : currentVoice.name) : 'Pick voice'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {isRenderable && !selectedVoice && !error && (
          <p className="text-xs text-muted">
            {recsLoading
              ? 'Finding a narrator voice for this reel…'
              : recsError
                ? 'Could not load voices — open the picker to retry.'
                : 'Pick a voice to render.'}
          </p>
        )}
        <div className="flex-1" />
        <button onClick={handleRender} disabled={loading === 'render' || !canRender} className="btn-accent active:scale-[.98]" title={!selectedVoice ? 'Pick a narrator voice first' : undefined}>
          {loading === 'render' ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
              Queuing…
            </>
          ) : (
            <>
              Render reel
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
      )}

      {/* Spot-check → approved → published gate */}
      {isPostRender && (
        <div className="sticky bottom-0 z-40 flex flex-shrink-0 flex-wrap items-center gap-3 border-t border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
          {reel.status === 'spot_check' && (
            <>
              <div className="mr-auto">
                <p className="text-sm font-semibold text-ink">Spot-check</p>
                <p className="text-xs text-muted">Watch the render below, then sign it off.</p>
              </div>
              <button onClick={handleApprove} disabled={loading === 'approve'} className="btn-accent active:scale-[.98]">
                {loading === 'approve' ? 'Approving…' : (
                  <>
                    Approve reel
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </>
                )}
              </button>
            </>
          )}
          {reel.status === 'approved' && (
            <>
              <div className="mr-auto">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Approved
                </p>
                <p className="text-xs text-muted">Download the package, upload to your platforms, then mark it published.</p>
              </div>
              <a href={`/api/pipeline/export-post-package?reelId=${reel.id}`} className="btn-secondary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download post package
              </a>
              <button onClick={handlePublish} disabled={loading === 'publish'} className="btn-accent active:scale-[.98]">
                {loading === 'publish' ? 'Publishing…' : 'Mark published'}
              </button>
            </>
          )}
          {(reel.status === 'published' || reel.status === 'scheduled') && (
            <>
              <div className="mr-auto">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {reel.status === 'published' ? 'Published' : 'Scheduled'}
                </p>
                <p className="text-xs text-muted">Re-download the post package anytime.</p>
              </div>
              <a href={`/api/pipeline/export-post-package?reelId=${reel.id}`} className="btn-secondary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download post package
              </a>
            </>
          )}
          {error && <p className="w-full text-sm text-danger">{error}</p>}
        </div>
      )}

      {/* Voice picker modal */}
      {showVoicePicker && (
        <VoicePicker
          voices={effectiveVoices}
          recommended={voicePool.length === 0}
          loadingVoices={recsLoading}
          voicesError={recsError}
          onRetry={fetchRecommendedVoices}
          selected={selectedVoice}
          storyFirstLine={story?.body.split('\n')[0] ?? ''}
          voiceSettings={voiceSettings}
          voiceTouched={voiceTouched}
          onVoiceSettingsChange={(s) => { setVoiceSettings(s); setVoiceTouched(true) }}
          onResetVoiceSettings={() => { setVoiceSettings(initialVoiceSettings); setVoiceTouched(false) }}
          onSelect={(id) => { setSelectedVoice(id); setShowVoicePicker(false) }}
          onClose={() => setShowVoicePicker(false)}
        />
      )}
    </div>
  )
}

// ── Scene media stack ───────────────────────────────────────────────────────
// The shared image/video canvas: shimmer skeleton while generating/loading, the "shooting" placeholder,
// reshoot + animate busy overlays, and the develop-in (blur→sharp) reveal once the media loads. Callers
// layer their own badges/controls via `children`. Timeline tiles pass playVideo={false} so only the
// inspector autoplays video (no fleet of autoplaying clips).
function SceneMedia({
  scene, imgSrc, videoKey, showVideo, playVideo, loaded, onLoaded, onDuration, regenerating, animating, frameClass, adaptAspect, children,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; showVideo: boolean; playVideo: boolean
  loaded: boolean; onLoaded: () => void; onDuration?: ((secs: number) => void) | undefined
  regenerating: boolean; animating: boolean
  frameClass?: string | undefined; adaptAspect?: boolean; children?: React.ReactNode
}) {
  const hasMedia = Boolean(videoKey || imgSrc)
  const developClass = `style-develop ${loaded ? 'style-develop-in' : ''}`
  // With adaptAspect on, the frame matches the media's real aspect ratio (so non-9:16 reels aren't
  // cropped); otherwise it stays 9:16 for uniform timeline tiles. Defaults to 9:16 until the media loads.
  const [mediaAspect, setMediaAspect] = useState<string | null>(null)
  return (
    <div
      className={`group relative isolate w-full overflow-hidden rounded-xl border bg-subtle shadow-sm ${frameClass ?? 'border-border'}`}
      style={{ aspectRatio: adaptAspect && mediaAspect ? mediaAspect : '9 / 16' }}
    >
      {/* Shimmer sits behind the media (z-0) — shown while still generating or loading */}
      {(!hasMedia || !loaded) && (
        <div className="absolute inset-0 z-0 animate-shimmer bg-gradient-to-r from-subtle via-surface to-subtle bg-[length:200%_100%]" />
      )}
      {!hasMedia && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-[11px] text-faint">
          <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-accent/70" />
          Shooting scene {scene.idx}…
        </div>
      )}
      {showVideo && playVideo ? (
        <video
          key={videoKey}
          src={`/api/asset?key=${encodeURIComponent(videoKey!)}`}
          autoPlay muted loop playsInline
          onLoadedData={onLoaded}
          onLoadedMetadata={(e) => { onDuration?.(e.currentTarget.duration); if (adaptAspect && e.currentTarget.videoWidth) setMediaAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
          // Cached media completes before React attaches the handler, so onLoadedData never fires —
          // catch the already-ready case on mount so the reveal isn't stuck waiting for an event.
          ref={(el) => { if (el && el.readyState >= 2) { onLoaded(); if (el.duration) onDuration?.(el.duration); if (adaptAspect && el.videoWidth) setMediaAspect(`${el.videoWidth} / ${el.videoHeight}`) } }}
          className={`absolute inset-0 z-10 h-full w-full object-cover ${developClass}`}
        />
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={`Scene ${scene.idx}`}
          onLoad={(e) => { onLoaded(); if (adaptAspect && e.currentTarget.naturalWidth) setMediaAspect(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`) }}
          // Same guard for images: a cached image is already `complete` on mount and won't fire onLoad.
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) { onLoaded(); if (adaptAspect) setMediaAspect(`${el.naturalWidth} / ${el.naturalHeight}`) } }}
          className={`absolute inset-0 z-10 h-full w-full object-cover ${developClass}`}
        />
      ) : null}
      {/* Reshoot overlay */}
      {regenerating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-ink/45 text-xs font-medium text-white backdrop-blur-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          Reshooting…
        </div>
      )}
      {/* Animate overlay — long op, set a gentle expectation */}
      {animating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-ink/45 px-3 text-center text-xs font-medium text-white backdrop-blur-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          Bringing this scene to life…
          <span className="text-[10px] font-normal text-white/70">takes about a minute</span>
        </div>
      )}
      {children}
    </div>
  )
}

// A motion scene's actual clip length — probed from the generated video's own metadata (not an estimate).
// Shows just the play glyph until the duration loads, or for a motion scene with no clip generated yet.
function MotionDurationChip({ clipKey }: { clipKey?: string | undefined }) {
  const [secs, setSecs] = useState<number | null>(null)
  return (
    <>
      <span
        className="absolute right-1.5 top-1.5 z-20 inline-flex items-center gap-0.5 rounded-full bg-accent/85 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur"
        title="Moves in the final reel"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l11-7L7 5Z" /></svg>
        {secs != null ? fmtSecs(secs) : null}
      </span>
      {clipKey && (
        <video
          src={`/api/asset?key=${encodeURIComponent(clipKey)}`}
          preload="metadata"
          muted
          playsInline
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0"
          onLoadedMetadata={(e) => setSecs(e.currentTarget.duration)}
        />
      )}
    </>
  )
}

// ── Timeline (master) ─────────────────────────────────────────────────────────
function SceneTimeline({
  scenes, sceneImages, sceneVideoVariations, loadedMedia, markLoaded, loading, selectedIdx, onSelect, onArrow, moodTint, view, onViewChange,
}: {
  scenes: Scene[]; sceneImages: Record<number, string>; sceneVideoVariations: Record<number, string[]>; loadedMedia: Set<number>
  markLoaded: (idx: number) => void; loading: string | null
  selectedIdx: number | null; onSelect: (idx: number) => void; onArrow: (d: number) => void; moodTint: string
  view: 'strip' | 'grid'; onViewChange: (v: 'strip' | 'grid') => void
}) {
  const thumbs = (
    <>
      {scenes.length === 0 && (
        <div className="flex aspect-[9/16] w-40 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-border-strong px-2 text-center text-xs text-faint">
          No scenes yet
        </div>
      )}
      {scenes.map((scene) => (
        <SceneThumb
          key={scene.idx}
          scene={scene}
          imgSrc={sceneImages[scene.idx]}
          videoKey={(sceneVideoVariations[scene.idx] ?? [])[0]}
          selected={scene.idx === selectedIdx}
          loaded={loadedMedia.has(scene.idx)}
          markLoaded={markLoaded}
          regenerating={loading === `regen-${scene.idx}`}
          animating={loading === `animate-${scene.idx}`}
          moodTint={moodTint}
          onSelect={onSelect}
          layout={view}
        />
      ))}
    </>
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
    if (e.key === 'ArrowRight') { e.preventDefault(); onArrow(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onArrow(-1) }
  }

  return (
    <div className="flex-shrink-0 border-b border-border">
      {/* Header — scene count + strip/grid view toggle (top-right). In strip view it collapses + fades out
          as the rail shrinks, so the pinned compact state is just the filmstrip. */}
      <div
        className="flex items-center justify-between gap-2 overflow-hidden px-4 pt-3 sm:px-8"
        style={view === 'strip' ? { maxHeight: 'calc(2.5rem * (1 - var(--shrink, 0)))', paddingTop: 'calc(0.75rem * (1 - var(--shrink, 0)))', opacity: 'calc(1 - var(--shrink, 0))' } : undefined}
      >
        <span className="text-xs font-medium text-muted">{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}</span>
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
          {([
            ['strip', 'Strip view', <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="16" rx="1" /><rect x="17" y="4" width="5" height="16" rx="1" /></>],
            ['grid', 'Grid view', <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>],
          ] as const).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              aria-pressed={view === v}
              title={label}
              aria-label={label}
              className={`rounded-md px-2 py-1 transition-colors ${view === v ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>{icon}</svg>
            </button>
          ))}
        </div>
      </div>

      {view === 'strip' ? (
        <div className="overflow-x-auto [scrollbar-width:thin]" role="listbox" aria-label="Scenes" tabIndex={0} onKeyDown={onKeyDown}>
          <div
            className="flex min-w-max items-start px-4 sm:px-8"
            style={{
              paddingTop: 'calc(1.5rem - 0.95rem * var(--shrink, 0))',
              paddingBottom: 'calc(1.5rem - 0.95rem * var(--shrink, 0))',
              gap: 'calc(1rem - 0.4rem * var(--shrink, 0))',
            }}
          >{thumbs}</div>
        </div>
      ) : (
        <div role="listbox" aria-label="Scenes" tabIndex={0} onKeyDown={onKeyDown}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] items-start gap-x-4 gap-y-5 px-4 py-6 sm:px-8">{thumbs}</div>
        </div>
      )}
    </div>
  )
}

function SceneThumb({
  scene, imgSrc, videoKey, selected, loaded, markLoaded, regenerating, animating, moodTint, onSelect, layout,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; selected: boolean; loaded: boolean; markLoaded: (idx: number) => void
  regenerating: boolean; animating: boolean; moodTint: string; onSelect: (idx: number) => void; layout: 'strip' | 'grid'
}) {
  const isGrid = layout === 'grid'
  const isStrip = layout === 'strip' // strip tiles shrink with the --shrink scroll var; grid tiles are fixed
  const isVideo = scene.tier === 'video'
  // On neutral channels the mood tint IS the brand midnight — identical to the selection accent — so a
  // hero number wash would read as "selected". Swap in a distinct highlight hue there; dark/warm channels
  // keep their real mood color (red / amber), which already differs from the selection accent.
  const heroTint = /^#1a1a2e$/i.test(moodTint) ? '#5E6AD2' : moodTint
  // A super-short scene descriptor — the place it's set (capped at 2 words), falling back to its lead mood word.
  const shortDesc = (scene.location || scene.mood?.[0] || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  // Selected wins the frame with the accent ring; a hero gets only a whisper-faint mood halo (below).
  const frameClass = selected
    ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-bg'
    : 'border-border'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(scene.idx)}
      ref={(el) => { if (selected && el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' }) }}
      className={`group flex flex-col text-left focus:outline-none ${isGrid ? 'w-full gap-2' : 'flex-shrink-0'}`}
      style={isStrip ? { width: 'calc(10rem - 5rem * var(--shrink, 0))', gap: 'calc(0.5rem - 0.5rem * var(--shrink, 0))' } : undefined}
    >
      <div
        className="rounded-xl"
        style={scene.isHero ? { boxShadow: `0 0 0 2px ${moodTint}4d, 0 0 9px -1px ${moodTint}40` } : undefined}
      >
        <SceneMedia
          scene={scene}
          imgSrc={imgSrc}
          showVideo={false}
          playVideo={false}
          loaded={loaded}
          onLoaded={() => markLoaded(scene.idx)}
          regenerating={regenerating}
          animating={animating}
          frameClass={frameClass}
        >
          {/* Scene number — top-left corner. Hero scenes keep the dark chip with a super-subtle mood-color
              wash (same whether active or not); others use the accent when selected, else the plain chip. */}
          <span
            className={`absolute left-1.5 top-1.5 z-20 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-[11px] font-semibold text-white backdrop-blur ${scene.isHero ? 'bg-ink/70' : selected ? 'bg-accent' : 'bg-ink/70'}`}
            style={scene.isHero ? { boxShadow: `inset 0 0 0 999px ${heroTint}55` } : undefined}
          >{scene.idx}</span>
          {/* Motion scenes show the play glyph + the actual clip length (top-right); stills show no duration. */}
          {isVideo && <MotionDurationChip clipKey={videoKey} />}
        </SceneMedia>
      </div>
      <div
        className="flex flex-col gap-0.5 overflow-hidden px-0.5"
        style={isStrip ? { maxHeight: 'calc(5rem * (1 - var(--shrink, 0)))', opacity: 'calc(1 - var(--shrink, 0))' } : undefined}
      >
        {shortDesc && <p className="truncate text-xs font-medium capitalize text-ink">{shortDesc}</p>}
        <p className={`${isGrid ? 'line-clamp-1' : 'line-clamp-2'} text-[11px] leading-snug text-muted`}>{scene.narrationText}</p>
      </div>
    </button>
  )
}

// ── Inspector (detail) ─────────────────────────────────────────────────────────
function SceneInspector({
  scene, imgSrc, variations, activeVar, setActiveVar, loaded, markLoaded, loading, moodTint,
  sceneSaving, setScenes, setSceneSaving, onToggleMotion, onPreview, onReshoot, onSaveText, onSaveMotion, onSaveOnScreen,
}: {
  scene: Scene; imgSrc?: string | undefined; variations: string[]; activeVar: number
  setActiveVar: React.Dispatch<React.SetStateAction<Record<number, number>>>
  loaded: boolean; markLoaded: (idx: number) => void; loading: string | null; moodTint: string
  sceneSaving: 'saving' | 'saved' | undefined
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>
  setSceneSaving: React.Dispatch<React.SetStateAction<Record<number, 'saving' | 'saved'>>>
  onToggleMotion: (idx: number, currentlyVideo: boolean) => void
  onPreview: (idx: number) => void
  onReshoot: (idx: number, opts?: { instruction?: string; improve?: boolean }) => void
  onSaveText: (idx: number, text: string) => void
  onSaveMotion: (idx: number, payload: { motionPrompt?: string; motionSettings?: MotionSettings }) => void
  onSaveOnScreen: (idx: number, text: string) => void
}) {
  const isVideo = scene.tier === 'video'
  const videoKey = variations[activeVar]
  const showVideo = isVideo && Boolean(videoKey)
  const animating = loading === `animate-${scene.idx}`
  const regenerating = loading === `regen-${scene.idx}`
  // Actual clip length, read from the playing preview's metadata (state resets per scene via the key prop).
  const [clipSecs, setClipSecs] = useState<number | null>(null)
  // Hero badge uses the mood color (distinct indigo on neutral channels, where mood == selection accent).
  const heroTint = /^#1a1a2e$/i.test(moodTint) ? '#5E6AD2' : moodTint
  const [showFull, setShowFull] = useState(false) // large preview lightbox
  const [fullLoaded, setFullLoaded] = useState(false) // lightbox media has loaded
  const [lightboxAspect, setLightboxAspect] = useState<string | null>(null) // real aspect of the open media
  const [reshootShot, setReshootShot] = useState('') // reshoot: framing/angle change (empty = keep)
  const [reshootLight, setReshootLight] = useState('') // reshoot: lighting change (empty = keep)
  const [reshootText, setReshootText] = useState('') // reshoot: free-text "anything else"

  return (
    <div className="animate-fade-in flex w-full flex-col gap-5 p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Scene {scene.idx}</h2>
        {scene.idx === 1 ? (
          <span className="badge bg-info-soft text-info">Hook</span>
        ) : scene.isHero ? (
          <span className="badge" style={{ backgroundColor: `${heroTint}1f`, color: heroTint }}>Hero</span>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-6 lg:flex-row">
      {/* Preview — its own stage, far left; the image fills the column */}
      <div className="order-1 flex w-full flex-shrink-0 flex-col lg:w-56">
        <div
          onClick={() => imgSrc && (setFullLoaded(false), setLightboxAspect(null), setShowFull(true))}
          title={imgSrc ? 'Open preview' : undefined}
          className={`group/preview w-full ${imgSrc ? 'cursor-zoom-in' : ''}`}
        >
          <SceneMedia
            scene={scene}
            imgSrc={imgSrc}
            videoKey={videoKey}
            showVideo={showVideo}
            playVideo
            loaded={loaded}
            onLoaded={() => markLoaded(scene.idx)}
            onDuration={setClipSecs}
            regenerating={regenerating}
            animating={animating}
            frameClass="!border-0"
            adaptAspect
          >
            {/* Hover hint that the visual opens a larger preview */}
            {imgSrc && (
              <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity group-hover/preview:opacity-100">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                </span>
              </span>
            )}
            {/* Actual clip length — only for a motion scene whose preview has loaded */}
            {showVideo && clipSecs != null && (
              <span className="badge absolute bottom-2 left-2 z-20 bg-black/55 font-mono text-white backdrop-blur">{fmtSecs(clipSecs)}</span>
            )}
            {/* Variation cycler — only when an animated scene has 2+ clips (after a render) */}
            {showVideo && variations.length > 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveVar((m) => ({ ...m, [scene.idx]: ((m[scene.idx] ?? 0) + 1) % variations.length })) }}
                className="badge absolute right-2 top-2 z-20 bg-black/55 text-white backdrop-blur hover:bg-black/70"
                title={`Take ${activeVar + 1} of ${variations.length} — click to switch`}
              >
                ▶ {activeVar + 1}/{variations.length}
              </button>
            )}
          </SceneMedia>
        </div>
      </div>
      {/* Narration — middle, wider; the primary edit */}
      <div className="order-2 flex min-w-0 flex-1 flex-col">
        <label className="mb-1.5 block text-xs font-medium text-muted">Narration/Voiceover</label>
        <textarea
          value={scene.narrationText}
          onChange={(e) => {
            const val = e.target.value
            setScenes((prev) => prev.map((s) => (s.idx === scene.idx ? { ...s, narrationText: val } : s)))
            setSceneSaving((s) => { const n = { ...s }; delete n[scene.idx]; return n })
          }}
          onBlur={(e) => void onSaveText(scene.idx, e.target.value)}
          rows={5}
          className="input max-h-64 resize-y text-sm leading-relaxed"
          placeholder="What the narrator says in this scene…"
          aria-label={`Scene ${scene.idx} narration`}
        />
        {sceneSaving && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-faint">
            {sceneSaving === 'saving' ? 'Saving…' : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pop-in text-positive" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                Saved · re-render to apply
              </>
            )}
          </p>
        )}

        {/* On-screen text — optional title/overlay burned on this scene, separate from the captions */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted">On-screen text <span className="font-normal text-faint">(optional)</span></label>
          <textarea
            defaultValue={scene.onScreenText ?? ''}
            key={`ost-${scene.idx}`}
            onBlur={(e) => onSaveOnScreen(scene.idx, e.target.value)}
            rows={2}
            className="input resize-y text-sm leading-relaxed"
            placeholder="A title or hook shown on screen — leave blank for none"
            aria-label={`Scene ${scene.idx} on-screen text`}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-faint">Burned onto the video as a title (separate from the spoken captions). Re-render to apply.</p>
        </div>
      </div>

      {/* Scene settings — right */}
      <div className="order-3 flex w-full flex-shrink-0 flex-col gap-4 lg:w-72">
        {/* Scene settings — regenerate the image and set the motion, together in one place */}
        {imgSrc && (() => {
          const { moveKey, intensity } = parseMotion(scene.motionPrompt)
          const costStr = `$${(motionCostCents(resolveMotionSettings(scene.motionSettings)) / 100).toFixed(2)}`
          const hasChange = Boolean(reshootShot || reshootLight || reshootText.trim())
          const runReshoot = () => {
            onReshoot(scene.idx, { instruction: [reshootShot, reshootLight, reshootText.trim()].filter(Boolean).join(', ') })
            setReshootShot(''); setReshootLight(''); setReshootText('')
          }
          return (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
              {/* Image — regenerate this scene's still */}
              <div className="flex flex-col gap-2 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Image</p>
                <SettingRow label="Shot">
                  <IconSelect ariaLabel={`Scene ${scene.idx} shot change`} value={reshootShot} onChange={setReshootShot} options={SHOT_OPTIONS} />
                </SettingRow>
                <SettingRow label="Lighting">
                  <IconSelect ariaLabel={`Scene ${scene.idx} lighting change`} value={reshootLight} onChange={setReshootLight} options={LIGHT_OPTIONS} />
                </SettingRow>
                <SettingRow label="Note" alignTop>
                  <textarea
                    value={reshootText}
                    onChange={(e) => setReshootText(e.target.value)}
                    rows={2}
                    placeholder="Anything else? (optional)"
                    aria-label={`Scene ${scene.idx} reshoot note`}
                    className="input resize-y text-xs leading-relaxed"
                  />
                </SettingRow>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button type="button" onClick={runReshoot} disabled={regenerating} className="btn-accent btn-sm flex-1 active:scale-[.98] disabled:cursor-wait">
                    {regenerating ? 'Reshooting…' : hasChange ? 'Reshoot' : 'Fresh take'}
                  </button>
                  <button type="button" onClick={() => { onReshoot(scene.idx, { improve: true }); setReshootShot(''); setReshootLight(''); setReshootText('') }} disabled={regenerating} title="Keep this exact composition, just refine the image" className="btn-secondary btn-sm flex-1 active:scale-[.98] disabled:cursor-wait">
                    Improve
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-faint">Fresh = a new version · Improve = same composition, refined.</p>
              </div>

              {/* Motion — animate this scene */}
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Motion</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted">{isVideo ? 'Video' : 'Still'}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isVideo}
                      disabled={animating}
                      onClick={() => onToggleMotion(scene.idx, isVideo)}
                      aria-label={isVideo ? 'Motion on — switch off to keep a still' : 'Motion off — switch on to animate'}
                      title={isVideo ? 'Animates at render — switch off to keep a still' : 'Still image — switch on to animate'}
                      className={`inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full ring-1 ring-inset transition-colors disabled:cursor-wait ${isVideo ? 'bg-accent ring-white/30' : 'bg-black/20 ring-black/10'}`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform ${isVideo ? 'translate-x-[18px]' : 'translate-x-[2px]'}`}>
                        {isVideo ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4V8Z" /></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="1.6" /><path d="m20 16-4.5-4.5L7 20" /></svg>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
                {isVideo ? (
                  <>
                    <SettingRow label="Camera">
                      <IconSelect ariaLabel={`Scene ${scene.idx} camera movement`} value={moveKey} onChange={(v) => onSaveMotion(scene.idx, { motionPrompt: composeMotion(v, intensity) })} options={[{ value: '', label: 'Auto', icon: ICON_SPARKLE }, ...CAMERA_MOVES.map((m) => ({ value: m.key, label: m.label, icon: cameraMoveIcon(m.key) }))]} />
                    </SettingRow>
                    <SettingRow label="Level">
                      <IconSelect ariaLabel={`Scene ${scene.idx} motion level`} value={intensity} disabled={!moveKey} onChange={(v) => onSaveMotion(scene.idx, { motionPrompt: composeMotion(moveKey, v as IntensityKey) })} options={INTENSITIES.map((i, n) => ({ value: i.key, label: i.label, icon: intensityIcon(n + 1) }))} />
                    </SettingRow>
                    {variations.length === 0 ? (
                      <div className="flex flex-col gap-1 pt-0.5">
                        <button type="button" onClick={() => onPreview(scene.idx)} disabled={animating} className="btn-secondary btn-sm w-full active:scale-[.98] disabled:cursor-wait">
                          {animating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Animating…</>) : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l11-7L7 5Z" /></svg>Preview motion · ~{costStr}</>)}
                        </button>
                        <span className="text-[11px] text-faint">or it animates when you render</span>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-positive" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                        Motion ready — click the scene to watch it.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-faint">Switch on to animate this scene when you render.</p>
                )}
              </div>

              {/* Details — read-only scene info */}
              <div className="flex flex-col gap-2 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Details</p>
                <SettingRow label="Mood" alignTop>
                  <div className="flex flex-wrap gap-1 pt-px">
                    {(scene.mood ?? []).length > 0 ? (scene.mood ?? []).map((m) => (
                      <span key={m} className="badge bg-subtle text-muted">{m}</span>
                    )) : <span className="text-xs text-faint">—</span>}
                  </div>
                </SettingRow>
                <SettingRow label="Setting"><span className="text-xs text-muted">{scene.location || '—'}</span></SettingRow>
                {showVideo && clipSecs != null && (
                  <SettingRow label="Clip"><span className="font-mono text-xs text-muted">{fmtSecs(clipSecs)}</span></SettingRow>
                )}
              </div>
            </div>
          )
        })()}
      </div>
      </div>

      {/* Large preview lightbox */}
      {showFull && imgSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm" onClick={() => setShowFull(false)}>
          <div className="relative h-[88vh] max-w-[94vw] overflow-hidden rounded-xl bg-ink shadow-lg" style={{ aspectRatio: lightboxAspect ?? '9 / 16' }} onClick={(e) => e.stopPropagation()}>
            {/* Loading spinner — until the media reports it's ready */}
            {!fullLoaded && (
              <div className="absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </div>
            )}
            <ZoomPan>
              {showVideo ? (
                <video
                  src={`/api/asset?key=${encodeURIComponent(videoKey!)}`}
                  autoPlay muted loop playsInline
                  onLoadedData={() => setFullLoaded(true)}
                  onLoadedMetadata={(e) => { if (e.currentTarget.videoWidth) setLightboxAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
                  ref={(el) => { if (el && el.readyState >= 2) { setFullLoaded(true); if (el.videoWidth) setLightboxAspect(`${el.videoWidth} / ${el.videoHeight}`) } }}
                  className="pointer-events-none h-full w-full select-none object-contain transition-opacity duration-200"
                  style={{ opacity: fullLoaded ? 1 : 0 }}
                />
              ) : (
                <img
                  src={imgSrc}
                  alt={`Scene ${scene.idx}`}
                  draggable={false}
                  onLoad={(e) => { setFullLoaded(true); if (e.currentTarget.naturalWidth) setLightboxAspect(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`) }}
                  ref={(el) => { if (el?.complete && el.naturalWidth > 0) { setFullLoaded(true); setLightboxAspect(`${el.naturalWidth} / ${el.naturalHeight}`) } }}
                  className="pointer-events-none h-full w-full select-none object-contain transition-opacity duration-200"
                  style={{ opacity: fullLoaded ? 1 : 0 }}
                />
              )}
            </ZoomPan>
            <button
              type="button"
              onClick={() => setShowFull(false)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur transition-colors hover:bg-ink/75"
              aria-label="Close preview"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Zoom + pan wrapper for the preview lightbox: scroll wheel or ± buttons to zoom, drag to pan when
// zoomed, double-click to toggle. Resets to fit when zoomed back to 1×.
function ZoomPan({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const clamp = (s: number) => Math.min(5, Math.max(1, Math.round(s * 100) / 100))
  const setZoom = (s: number) => {
    const ns = clamp(s)
    setScale(ns)
    if (ns === 1) { setTx(0); setTy(0) }
  }

  return (
    <div
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      onWheel={(e) => { setZoom(scale - e.deltaY * 0.003) }}
      onDoubleClick={() => setZoom(scale > 1 ? 1 : 2.5)}
      onPointerDown={(e) => { if (scale === 1) return; drag.current = { x: e.clientX, y: e.clientY, tx, ty }; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={(e) => { if (!drag.current) return; setTx(drag.current.tx + (e.clientX - drag.current.x)); setTy(drag.current.ty + (e.clientY - drag.current.y)) }}
      onPointerUp={() => { drag.current = null; setDragging(false) }}
      onPointerCancel={() => { drag.current = null; setDragging(false) }}
    >
      <div
        className="h-full w-full"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: dragging ? 'none' : 'transform 0.12s ease-out' }}
      >
        {children}
      </div>
      {/* Zoom controls — bottom center; stop propagation so clicks don't start a pan or close the modal */}
      <div
        className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-ink/55 p-0.5 text-white backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={() => setZoom(scale - 0.5)} disabled={scale <= 1} className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Zoom out">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
        </button>
        <button type="button" onClick={() => setZoom(1)} className="min-w-[3rem] rounded-full px-2 text-xs font-medium tabular-nums hover:bg-white/15" aria-label="Reset zoom">{Math.round(scale * 100)}%</button>
        <button type="button" onClick={() => setZoom(scale + 0.5)} disabled={scale >= 5} className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Zoom in">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
}

// ── Icons + custom select for the motion settings ──────────────────────────────
function Ic({ children, fill }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
      {children}
    </svg>
  )
}
const ICON_SPARKLE = <Ic fill><path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3Z" /></Ic>
const ICON_SUN =<Ic><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Ic>
const ICON_KEEP = <Ic><path d="M5 12h14" /></Ic>

// Reshoot pickers — friendly framing/lighting changes that compose into the LLM reshoot instruction.
// Empty value = keep as-is; both empty = a plain fresh take.
const SHOT_OPTIONS: SelectOption[] = [
  { value: '', label: 'Keep framing', icon: ICON_KEEP },
  { value: 'a wider shot', label: 'Wider', icon: <Ic><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Ic> },
  { value: 'a tighter, closer shot', label: 'Closer', icon: <Ic><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></Ic> },
  { value: 'a lower camera angle looking up', label: 'Low angle', icon: <Ic><path d="M12 19V5M5 12l7-7 7 7" /></Ic> },
  { value: 'a higher camera angle looking down', label: 'High angle', icon: <Ic><path d="M12 5v14M19 12l-7 7-7-7" /></Ic> },
]
const LIGHT_OPTIONS: SelectOption[] = [
  { value: '', label: 'Keep lighting', icon: ICON_KEEP },
  { value: 'brighter lighting', label: 'Brighter', icon: ICON_SUN },
  { value: 'darker, moodier lighting with deeper shadows', label: 'Darker', icon: <Ic><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Ic> },
  { value: 'softer, diffused lighting', label: 'Softer', icon: <Ic><circle cx="12" cy="12" r="3.5" /><path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21" /></Ic> },
]

function cameraMoveIcon(key: string): React.ReactNode {
  switch (key) {
    case 'push_in': return <Ic><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M11 8v6M8 11h6" /></Ic>
    case 'pull_out': return <Ic><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3M8 11h6" /></Ic>
    case 'pan_left': return <Ic><path d="M19 12H5M12 19l-7-7 7-7" /></Ic>
    case 'pan_right': return <Ic><path d="M5 12h14M12 5l7 7-7 7" /></Ic>
    case 'tilt_up': return <Ic><path d="M12 19V5M5 12l7-7 7 7" /></Ic>
    case 'tilt_down': return <Ic><path d="M12 5v14M19 12l-7 7-7-7" /></Ic>
    case 'handheld': return <Ic><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Ic>
    case 'locked': return <Ic><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Ic>
    default: return <Ic><path d="M3 8h11a3 3 0 1 0-3-3M3 16h9a3 3 0 1 1-3 3M3 12h18" /></Ic> // drift
  }
}
function intensityIcon(level: number): React.ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0" aria-hidden>
      <rect x="3" y="13" width="4" height="7" rx="1" opacity={level >= 1 ? 1 : 0.3} />
      <rect x="10" y="9" width="4" height="11" rx="1" opacity={level >= 2 ? 1 : 0.3} />
      <rect x="17" y="5" width="4" height="15" rx="1" opacity={level >= 3 ? 1 : 0.3} />
    </svg>
  )
}

interface SelectOption { value: string; label: string; icon: React.ReactNode }
function IconSelect({ value, options, onChange, disabled, ariaLabel }: {
  value: string; options: SelectOption[]; onChange: (value: string) => void; disabled?: boolean; ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="input flex items-center justify-between gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-ink">{current?.icon}<span className="truncate">{current?.label}</span></span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div role="listbox" className="animate-dropdown absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface p-1 shadow-md">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${o.value === value ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-subtle'}`}
            >
              <span className="flex-shrink-0">{o.icon}</span>
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Figma-style property row: a fixed-width label on the left, the control filling the rest.
function SettingRow({ label, alignTop, children }: { label: string; alignTop?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2 ${alignTop ? 'items-start' : 'items-center'}`}>
      <span className={`w-14 flex-shrink-0 text-[11px] font-medium text-muted ${alignTop ? 'pt-2' : ''}`}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function VoicePicker({ voices, recommended, loadingVoices, voicesError, onRetry, selected, storyFirstLine, voiceSettings, voiceTouched, onVoiceSettingsChange, onResetVoiceSettings, onSelect, onClose }: {
  voices: PickerVoice[]
  recommended: boolean
  loadingVoices: boolean
  voicesError: string | null
  onRetry: () => void
  selected: string
  storyFirstLine: string
  voiceSettings: VoiceSettings
  voiceTouched: boolean
  onVoiceSettingsChange: (s: VoiceSettings) => void
  onResetVoiceSettings: () => void
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [gender, setGender] = useState<'any' | 'female' | 'male'>('any')
  const [showAll, setShowAll] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null) // voice loaded in the now-playing bar
  const [playing, setPlaying] = useState(false)                   // is it actively playing (drives ▶/⏸)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  // Cache each voice's synthesized preview for this session — replaying is then instant + free (a synth
  // is ~4¢, so we pay it at most once per voice). One audio element; only one preview plays at a time.
  const cacheRef = useRef<Map<string, string>>(new Map())
  const previewText = (storyFirstLine || 'Ito ang boses para sa reel mo.').slice(0, 120)
  const [showDelivery, setShowDelivery] = useState(voiceTouched)
  // Change a delivery setting + stop the current preview, so the next ▶ re-synths with the new delivery.
  const setSlider = (patch: Partial<VoiceSettings>) => {
    onVoiceSettingsChange({ ...voiceSettings, ...patch })
    audioRef.current?.pause()
    setCurrentId(null)
    setPlaying(false)
  }

  async function preview(v: PickerVoice) {
    const audio = audioRef.current
    if (!audio) return
    // Already loaded in the bar → toggle pause/resume (onPlay/onPause sync `playing`).
    if (currentId === v.providerId) {
      if (playing) audio.pause()
      else void audio.play().catch(() => {})
      return
    }
    setPreviewError(null)
    // Cache by voice + delivery settings — a tweak yields a new key so the preview re-synths with the
    // new delivery, while replaying the same voice+settings stays free.
    const cacheKey = `${v.providerId}|${voiceSettings.stability}|${voiceSettings.style}|${voiceSettings.speed}`
    const load = (url: string) => { setCurrentId(v.providerId); audio.src = url; void audio.play().catch(() => {}) }
    const cached = cacheRef.current.get(cacheKey)
    if (cached) { load(cached); return }
    setLoadingId(v.providerId)
    try {
      const res = await fetch('/api/pipeline/preview-voice', {
        method: 'POST',
        body: JSON.stringify({ voiceId: v.providerId, text: previewText, voiceSettings }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setPreviewError(j?.error ?? 'Couldn’t play that preview — try again.')
        return
      }
      const url = URL.createObjectURL(await res.blob())
      cacheRef.current.set(cacheKey, url)
      load(url)
    } catch {
      setPreviewError('Couldn’t play that preview — try again.')
    } finally {
      setLoadingId(null)
    }
  }

  const currentVoiceName = voices.find((v) => v.providerId === currentId)?.name ?? 'Voice'

  // Default to the best-fit recommendations (with reasons) so the operator isn't scanning 45; a toggle
  // reveals the full pool. Gender filter narrows either set.
  const hasRecommended = recommended && voices.some((v) => v.reason)
  const genderOk = (v: PickerVoice) => gender === 'any' || (v.gender || '').toLowerCase() === gender
  const shown = voices.filter(genderOk).filter((v) => showAll || !hasRecommended || !!v.reason)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-96 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Choose narrator voice</p>
            {recommended && (
              <p className="mt-0.5 text-xs text-muted">
                {hasRecommended && !showAll ? 'Best fits for this reel.' : 'Preview, then pick.'}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-subtle p-0.5">
            {(['any', 'female', 'male'] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGender(g)} className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${gender === g ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'}`}>{g}</button>
            ))}
          </div>
        </div>

        {loadingVoices && voices.length === 0 && (
          <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2.5 text-xs text-muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Finding voices that fit this channel…
          </p>
        )}
        {voicesError && voices.length === 0 && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs text-danger">
            {voicesError}
            <button onClick={onRetry} className="btn-secondary btn-sm mt-2">Try again</button>
          </div>
        )}
        {!loadingVoices && !voicesError && voices.length === 0 && (
          <p className="mb-4 rounded-lg border border-border bg-subtle px-3 py-2.5 text-xs text-muted">
            No voices available. Set a voice in channel settings, or use a single-voice channel.
          </p>
        )}
        {voices.length > 0 && shown.length === 0 && (
          <p className="mb-3 rounded-lg border border-border bg-subtle px-3 py-2.5 text-xs text-muted">No {gender} voices in this set — try a different filter or “Show all”.</p>
        )}

        <div className="mb-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
          {shown.map((v) => {
            const active = selected === v.providerId
            const isPlaying = currentId === v.providerId && playing
            const isLoading = loadingId === v.providerId
            return (
              <div
                key={v.providerId}
                onClick={() => onSelect(v.providerId)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors ${active ? 'border-accent bg-accent-soft ring-1 ring-inset ring-accent' : 'border-border-strong hover:bg-subtle'}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{v.name}</p>
                  <p className="line-clamp-2 text-xs text-muted">{v.reason || v.description || v.gender}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void preview(v) }}
                  className="btn-secondary btn-sm flex-shrink-0"
                  title={isPlaying ? 'Stop' : 'Preview'}
                >
                  {isLoading ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : isPlaying ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l11-7L7 5Z" /></svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {hasRecommended && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="btn-ghost btn-sm mb-3 w-full">
            {showAll ? 'Show best fits only' : `Show all ${voices.length} voices`}
          </button>
        )}
        {previewError && <p className="mb-3 text-xs text-danger">{previewError}</p>}

        {/* Now-playing bar — shows which voice is speaking, with scrub + pause. Always mounted (hidden
            until a preview starts) so the audio ref exists when preview() runs. */}
        <div className={currentId ? 'mb-3 rounded-lg border border-border bg-subtle/50 px-3 py-2' : 'hidden'}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            <span className="truncate">{playing ? 'Now playing' : 'Paused'} · {currentVoiceName}</span>
          </p>
          <audio
            ref={audioRef}
            controls
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="h-8 w-full"
          />
        </div>

        {/* Adjust delivery — collapsible sliders that override the per-story auto-tuning for this reel. */}
        <div className="mb-3">
          <button type="button" onClick={() => setShowDelivery((s) => !s)} className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted hover:text-ink">
            <span>Adjust delivery{voiceTouched ? ' · custom' : ''}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showDelivery ? 'rotate-180' : ''} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {showDelivery && (
            <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-subtle/40 p-3">
              <p className="text-[11px] leading-relaxed text-faint">Delivery auto-tunes to each story&apos;s mood. Adjust to set it for this reel, then preview a voice to hear it.</p>
              <DeliverySlider label="Pace" lo="Slower" hi="Faster" min={0.7} max={1.15} step={0.01} value={voiceSettings.speed} onChange={(v) => setSlider({ speed: v })} />
              <DeliverySlider label="Expressiveness" lo="Subtle" hi="Dramatic" min={0} max={0.6} step={0.05} value={voiceSettings.style} onChange={(v) => setSlider({ style: v })} />
              <DeliverySlider label="Steadiness" lo="Varied" hi="Steady" min={0.2} max={0.85} step={0.05} value={voiceSettings.stability} onChange={(v) => setSlider({ stability: v })} />
              {voiceTouched && (
                <button type="button" onClick={() => { onResetVoiceSettings(); audioRef.current?.pause(); setCurrentId(null); setPlaying(false) }} className="btn-ghost btn-sm self-start">Reset to auto</button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => onSelect(selected)} disabled={!selected} className="btn-accent flex-1">
            {selected ? `Use ${voices.find((v) => v.providerId === selected)?.name ?? 'voice'}` : 'Pick a voice'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function DeliverySlider({ label, lo, hi, min, max, step, value, onChange }: {
  label: string; lo: string; hi: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-ink">{label}</p>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent" />
      <div className="flex justify-between text-[10px] text-faint"><span>{lo}</span><span>{hi}</span></div>
    </div>
  )
}
