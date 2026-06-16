'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'

type Scene = InferSelectModel<typeof scenes>
type Story = InferSelectModel<typeof stories>

interface Voice { id: string; name: string; gender: string; style: string }

interface StoryboardEditorProps {
  reel: { id: string; status: string; voiceId: string | null; costCents: number; operatorMinutes: number; language: string }
  story: Story | null
  scenes: Scene[]
  voicePool: Voice[]
  sceneImages: Record<number, string>
  sceneVideoVariations: Record<number, string[]>
  renderUrl: string | null
  channelName: string
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool,
  sceneImages, sceneVideoVariations, renderUrl: initialRenderUrl,
  channelName,
}: StoryboardEditorProps) {
  const router = useRouter()
  const [scenes, setScenes] = useState(initialScenes)
  const [selectedVoice, setSelectedVoice] = useState(reel.voiceId ?? voicePool[0]?.id ?? '')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [renderUrl, setRenderUrl] = useState(initialRenderUrl)
  const [loading, setLoading] = useState<string | null>(null)
  const [opMinutes, setOpMinutes] = useState(reel.operatorMinutes)
  const startedAt = useRef(Date.now())

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

  async function handleRender() {
    setLoading('render')
    const res = await fetch('/api/pipeline/trigger-render', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, voiceId: selectedVoice }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(null)
    router.push('/dashboard')
  }

  const currentVoice = voicePool.find((v) => v.id === selectedVoice)
  const isRenderable = ['storyboard', 'story_review', 'approved', 'failed'].includes(reel.status)

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

                {/* Narration snippet */}
                <p className="line-clamp-3 text-xs leading-relaxed text-muted">{scene.narrationText}</p>

                {/* Actions */}
                <div className="flex gap-2">
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

      {/* Bottom bar — voice + render */}
      <div className="sticky bottom-0 flex flex-shrink-0 flex-wrap items-center gap-4 border-t border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <button onClick={() => setShowVoicePicker(true)} className="btn-secondary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" />
          </svg>
          {currentVoice ? `${currentVoice.name} · ${currentVoice.style}` : 'Pick voice'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div className="flex-1" />
        <button onClick={handleRender} disabled={loading === 'render' || !isRenderable} className="btn-accent">
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
        </div>
      )}

      {/* Voice picker modal */}
      {showVoicePicker && (
        <VoicePicker
          voices={voicePool}
          selected={selectedVoice}
          storyFirstLine={story?.body.split('\n')[0] ?? ''}
          reelId={reel.id}
          onSelect={(id) => { setSelectedVoice(id); setShowVoicePicker(false) }}
          onClose={() => setShowVoicePicker(false)}
        />
      )}
    </div>
  )
}

function VoicePicker({ voices, selected, storyFirstLine, reelId, onSelect, onClose }: {
  voices: Voice[]
  selected: string
  storyFirstLine: string
  reelId: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [audioSrc, setAudioSrc] = useState<string | null>(null)

  async function handlePreview(voiceId: string) {
    setPreviewing(voiceId)
    const res = await fetch('/api/pipeline/preview-voice', {
      method: 'POST',
      body: JSON.stringify({ voiceId, text: storyFirstLine.slice(0, 100) }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      const blob = await res.blob()
      setAudioSrc(URL.createObjectURL(blob))
    }
    setPreviewing(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="card w-96 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="mb-4 text-sm font-semibold text-ink">Choose narrator voice</p>
        <div className="mb-4 flex flex-col gap-2">
          {voices.map((v) => {
            const active = selected === v.id
            return (
              <div
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft ring-1 ring-accent'
                    : 'border-border-strong hover:bg-subtle'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-ink">{v.name}</p>
                  <p className="text-xs text-muted">{v.style}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePreview(v.id) }}
                  disabled={previewing === v.id}
                  className="btn-secondary btn-sm"
                  title="Preview voice"
                >
                  {previewing === v.id ? (
                    '…'
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M7 5v14l11-7L7 5Z" />
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>
        {audioSrc && <audio src={audioSrc} autoPlay controls className="mb-3 w-full" />}
        <div className="flex gap-2">
          <button onClick={() => onSelect(selected)} className="btn-accent flex-1">
            Use {voices.find((v) => v.id === selected)?.name}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
