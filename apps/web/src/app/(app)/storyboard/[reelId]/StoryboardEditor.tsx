'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'
import type { ChannelVoice, VoiceSettings } from '@reels/core'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { PipelinePhaseStepper } from '@/components/PipelinePhaseStepper'

type Scene = InferSelectModel<typeof scenes>
type Story = InferSelectModel<typeof stories>

// Voices stored on the channel are ChannelVoice: { providerId, name, gender, description }.
// providerId IS the ElevenLabs voice id used at render — never use a non-existent `id`.
type Voice = ChannelVoice
// In the picker, a recommended voice also carries a "why it fits this reel" reason (per_story
// recommendations). Single-channel pool voices are plain ChannelVoice (no reason).
type PickerVoice = ChannelVoice & { reason?: string | undefined }

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
  failure: { step: string; error: string } | null
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool, voiceRecommend,
  sceneImages, sceneVideoVariations, renderUrl: initialRenderUrl, musicUrl,
  initialVoiceSettings, voiceSettingsOverridden,
  channelName, failure,
}: StoryboardEditorProps) {
  const router = useRouter()
  const [scenes, setScenes] = useState(initialScenes)
  const [sceneSaving, setSceneSaving] = useState<Record<number, 'saving' | 'saved'>>({}) // per-scene script-edit status
  const [editingScenes, setEditingScenes] = useState<Set<number>>(new Set()) // scenes whose script is unlocked for editing
  const [selectedVoice, setSelectedVoice] = useState(reel.voiceId ?? voicePool[0]?.providerId ?? '')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  // Narrator delivery: the picker's sliders edit this; `voiceTouched` = the operator overrode the
  // per-story auto-tuning, so we send it to the render (else generate_tts auto-derives from mood).
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(initialVoiceSettings)
  const [voiceTouched, setVoiceTouched] = useState(voiceSettingsOverridden)
  const [renderUrl, setRenderUrl] = useState(initialRenderUrl)
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

  // Operator-minutes: update every 30s [E5.6]
  useEffect(() => {
    const interval = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startedAt.current) / 60000)
      setOpMinutes(reel.operatorMinutes + elapsed)
      await fetch('/api/pipeline/update-op-minutes', {
        method: 'POST',
        body: JSON.stringify({ reelId: reel.id, opMinutes: reel.operatorMinutes + elapsed }),
        headers: { 'Content-Type': 'application/json' },
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [reel.id, reel.operatorMinutes])

  async function handleRegenImage(sceneIdx: number) {
    setLoading(`regen-${sceneIdx}`)
    await fetch('/api/pipeline/regen-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(null)
    router.refresh()
  }

  async function handleTierToggle(sceneIdx: number, current: string) {
    const next = current === 'video' ? 'still' : 'video'
    setScenes((prev) => prev.map((s) => s.idx === sceneIdx ? { ...s, tier: next } : s))
    await fetch('/api/pipeline/set-scene-tier', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, tier: next }),
      headers: { 'Content-Type': 'application/json' },
    })
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

  // Edit button: unlock a scene's script; clicking again (Done) saves + locks it back to read-only.
  function toggleSceneEdit(sceneIdx: number, text: string) {
    setEditingScenes((prev) => {
      const next = new Set(prev)
      if (next.has(sceneIdx)) { next.delete(sceneIdx); void saveSceneText(sceneIdx, text) }
      else next.add(sceneIdx)
      return next
    })
  }

  async function handleRender() {
    // Guard: TTS hard-fails with no voice, so never queue a render without one.
    if (!selectedVoice) { setShowVoicePicker(true); return }
    setLoading('render')
    const res = await fetch('/api/pipeline/trigger-render', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, voiceId: selectedVoice, ...(voiceTouched ? { voiceSettings } : {}) }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const j = await res.json().catch(() => null)
      setLoading(null)
      setError(j?.error ?? 'Could not start the render.')
      return
    }
    setLoading(null)
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
      const j = await res.json().catch(() => null)
      setLoading(null)
      setError(j?.error ?? 'Could not approve this reel.')
      return
    }
    setLoading(null)
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
      const j = await res.json().catch(() => null)
      setLoading(null)
      setError(j?.error ?? 'Could not mark this reel published.')
      return
    }
    setLoading(null)
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
      const j = await res.json().catch(() => null)
      setLoading(null)
      setError(j?.error ?? 'Could not retry this reel.')
      return
    }
    setLoading(null)
    router.refresh()
  }

  const currentVoice = effectiveVoices.find((v) => v.providerId === selectedVoice)
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

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 flex flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="btn-ghost btn-sm -ml-1.5" title="Back to reels">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </a>
          <div>
            <p className="text-base font-semibold tracking-tight text-ink">{story?.title ?? 'Untitled reel'}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="font-mono">{reel.id.slice(0, 8)}</span>
              <span className="text-faint">·</span>
              <span className="badge bg-subtle text-muted">{reel.status.replace(/_/g, ' ')}</span>
              <span className="text-faint">·</span>
              {channelName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted">
          <span title="Spend so far">${(reel.costCents / 100).toFixed(2)}</span>
          <span title="Operator minutes">{opMinutes} min</span>
        </div>
      </div>

      {/* Failure banner — surfaces a hard pipeline failure so the reel isn't a silent stall */}
      {reel.status === 'failed' && failure && (
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-danger/30 bg-danger-soft px-8 py-4">
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

      {/* Scene strip — horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max gap-4 p-8">
          {scenes.length === 0 && (
            <div className="flex h-64 w-52 items-center justify-center rounded-xl border border-dashed border-border-strong text-xs text-faint">
              No scenes yet
            </div>
          )}
          {scenes.map((scene) => {
            const imgSrc = sceneImages[scene.idx]
            const variations = sceneVideoVariations[scene.idx] ?? []
            const isVideo = scene.tier === 'video'
            return (
              <div key={scene.idx} className="flex w-52 flex-shrink-0 flex-col gap-3">
                {/* Image / placeholder */}
                <div className="group relative overflow-hidden rounded-xl border border-border bg-subtle shadow-sm" style={{ height: 208 }}>
                  {imgSrc ? (
                    <img src={imgSrc} alt={`Scene ${scene.idx}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                      scene {scene.idx}
                    </div>
                  )}
                  {/* Scene-type badge */}
                  {(scene.idx === 1 || isVideo) && (
                    <span
                      className={`badge absolute left-2 top-2 backdrop-blur ${
                        scene.idx === 1 ? 'bg-info/90 text-white' : 'bg-accent/90 text-white'
                      }`}
                    >
                      {scene.idx === 1 ? 'HOOK' : 'VIDEO'}
                    </span>
                  )}
                  {/* Video variations badge */}
                  {variations.length > 0 && (
                    <span className="badge absolute right-2 top-2 bg-black/55 text-white backdrop-blur">
                      {variations.length}v
                    </span>
                  )}
                  {/* Timing chip */}
                  <span className="badge absolute bottom-2 left-2 bg-black/55 font-mono text-white backdrop-blur">
                    {scene.startMs != null ? `${(scene.startMs / 1000).toFixed(1)}s` : '—'}
                  </span>
                </div>

                {/* Narration — full text, never truncated. Read-only until unlocked via the Edit button. */}
                <div>
                  {editingScenes.has(scene.idx) ? (
                    <textarea
                      value={scene.narrationText}
                      onChange={(e) => {
                        const val = e.target.value
                        setScenes((prev) => prev.map((s) => (s.idx === scene.idx ? { ...s, narrationText: val } : s)))
                        setSceneSaving((s) => { const n = { ...s }; delete n[scene.idx]; return n })
                      }}
                      onBlur={(e) => void saveSceneText(scene.idx, e.target.value)}
                      rows={5}
                      autoFocus
                      className="input resize-y text-xs leading-relaxed"
                      placeholder="Scene narration…"
                      aria-label={`Scene ${scene.idx} narration`}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{scene.narrationText}</p>
                  )}
                  {sceneSaving[scene.idx] && (
                    <p className="mt-0.5 text-[10px] text-faint">{sceneSaving[scene.idx] === 'saving' ? 'Saving…' : 'Saved ✓ · re-render to apply'}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleSceneEdit(scene.idx, scene.narrationText)}
                    className={editingScenes.has(scene.idx) ? 'btn btn-sm bg-accent-soft text-accent' : 'btn-secondary btn-sm'}
                    title={editingScenes.has(scene.idx) ? 'Done editing the script' : 'Edit the script'}
                    aria-label={editingScenes.has(scene.idx) ? 'Done editing the script' : 'Edit the script'}
                  >
                    {editingScenes.has(scene.idx) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleRegenImage(scene.idx)}
                    disabled={loading === `regen-${scene.idx}`}
                    className="btn-secondary btn-sm"
                    title="Regenerate image"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={loading === `regen-${scene.idx}` ? 'animate-spin' : ''}>
                      <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
                    </svg>
                    Regen
                  </button>
                  <button
                    onClick={() => handleTierToggle(scene.idx, scene.tier)}
                    className={isVideo ? 'btn btn-sm bg-accent-soft text-accent' : 'btn-secondary btn-sm'}
                    title={isVideo ? 'Animated (click to make still)' : 'Still (click to animate)'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 5v14l11-7L7 5Z" />
                    </svg>
                    {isVideo ? 'Kling' : 'Still'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom bar — voice + render (storyboard flow only) */}
      {!isPostRender && (
      <div className="sticky bottom-0 flex flex-shrink-0 flex-wrap items-center gap-4 border-t border-border bg-bg/80 px-8 py-4 backdrop-blur">
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
        <button onClick={handleRender} disabled={loading === 'render' || !canRender} className="btn-accent" title={!selectedVoice ? 'Pick a narrator voice first' : undefined}>
          {loading === 'render' ? (
            'Queuing…'
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
        <div className="sticky bottom-0 flex flex-shrink-0 flex-wrap items-center gap-3 border-t border-border bg-bg/80 px-8 py-4 backdrop-blur">
          {reel.status === 'spot_check' && (
            <>
              <div className="mr-auto">
                <p className="text-sm font-semibold text-ink">Spot-check</p>
                <p className="text-xs text-muted">Watch the render below, then sign it off.</p>
              </div>
              <button onClick={handleApprove} disabled={loading === 'approve'} className="btn-accent">
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
              <button onClick={handlePublish} disabled={loading === 'publish'} className="btn-accent">
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

      {/* Render preview */}
      {renderUrl && (
        <div id="preview" className="border-t border-border px-8 py-6">
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
                Music · AI-composed for this reel
              </p>
              <audio src={musicUrl} controls preload="none" className="h-9 w-full" />
              <p className="mt-1.5 text-[11px] leading-relaxed text-faint">An original bed composed for this story&apos;s mood — heard on its own here, mixed under the narration in the video.</p>
            </div>
          )}
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
  const [previewError, setPreviewError] = useState(false)
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
    setPreviewError(false)
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
      if (!res.ok) { setPreviewError(true); return }
      const url = URL.createObjectURL(await res.blob())
      cacheRef.current.set(cacheKey, url)
      load(url)
    } catch {
      setPreviewError(true)
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
        {previewError && <p className="mb-3 text-xs text-danger">Couldn&apos;t play that preview — try again.</p>}

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
