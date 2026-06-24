'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'
import type { ChannelVoice, VoiceSettings, MotionSettings } from '@reels/core'
import { resolveMotionSettings, motionCostCents } from '@reels/core'
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
  aiMusic: boolean // channel composes its bed per-reel (musicMode='ai') → vet it here, auto-requested on load
  initialVoiceSettings: VoiceSettings // starting point for the delivery sliders
  voiceSettingsOverridden: boolean // reel already has a saved manual override
  channelName: string
  moodTint: string // channel-mood accent (dark=red / warm=amber / neutral=midnight) for ambient touches
  failure: { step: string; error: string } | null
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool, voiceRecommend,
  sceneImages, sceneVideoVariations, renderUrl: initialRenderUrl, musicUrl: initialMusicUrl, aiMusic,
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
  const scrollRef = useRef<HTMLDivElement>(null) // the single scene scroll container; holds the --shrink var for the rail
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
  const [deliveryOpen, setDeliveryOpen] = useState(false) // footer delivery-settings popover
  // Edit delivery from the footer pill — same state the picker's sliders use; marks it a manual override.
  const setDelivery = (patch: Partial<VoiceSettings>) => { setVoiceSettings((s) => ({ ...s, ...patch })); setVoiceTouched(true) }
  const [renderUrl] = useState(initialRenderUrl)
  // AI-composed background bed: auto-requested on load for musicMode='ai' channels so the operator hears
  // the mood before rendering; render-time generate_music reuses this exact bed. `force` recomposes it.
  const [musicUrl, setMusicUrl] = useState(initialMusicUrl)
  const [musicStatus, setMusicStatus] = useState<'idle' | 'generating' | 'error'>('idle')
  const [musicError, setMusicError] = useState<string | null>(null)
  const [musicTweakOpen, setMusicTweakOpen] = useState(false) // Regenerate popover (steer the new take)
  const [musicTweak, setMusicTweak] = useState('') // the operator's plain-language steer for the bed
  const [musicSuggestions, setMusicSuggestions] = useState<string[]>([]) // AI steer ideas for the field
  const [musicSuggestLoading, setMusicSuggestLoading] = useState(false)
  const musicRequestedRef = useRef(false)
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

  // Regenerate a scene's image. The optional `instruction` (the creator's plain-language change, e.g.
  // "make it foggier" or "show the old house instead") is rewritten by the LLM into a proper image prompt;
  // the same call also decides whether to refine the current image or re-roll fresh. With no instruction
  // it's a plain fresh re-roll.
  async function handleRegenImage(sceneIdx: number, opts?: { instruction?: string }) {
    setLoading(`regen-${sceneIdx}`)
    const res = await fetch('/api/pipeline/regen-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, instruction: opts?.instruction?.trim() || undefined }),
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
  // Scene type sets how the scene renders + its cost tier, in one action:
  //   static → a still (zoom/pan only, no AI-video cost)
  //   motion → AI video at budget quality (cheaper)
  //   hero   → AI video at premium quality
  // tier drives the still/video render; quality (motionSettings) drives the cost + provider. Optimistic;
  // a per-scene in-flight guard drops rapid taps. Changing quality clears the stale clip (saveSceneMotion).
  async function setSceneType(sceneIdx: number, type: 'static' | 'motion' | 'hero') {
    if (tierBusyRef.current.has(sceneIdx)) return
    tierBusyRef.current.add(sceneIdx)
    const tier = type === 'static' ? 'still' : 'video'
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier } : s)))
    try {
      await fetch('/api/pipeline/set-scene-tier', {
        method: 'POST',
        body: JSON.stringify({ reelId: reel.id, sceneIdx, tier }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (tier === 'video') {
        await saveSceneMotion(sceneIdx, { motionSettings: { quality: type === 'motion' ? 'budget' : 'standard', durationSec: 5 } })
      }
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

  // Compose this reel's background bed on demand. force=false is the auto-request on load (only if there's
  // no bed yet, server-enforced); force=true recomposes a fresh take from the Regenerate button (a paid
  // call). `instruction` is an optional plain-language steer the operator typed ("more tense").
  async function composeMusic(force: boolean, instruction?: string) {
    setMusicStatus('generating')
    setMusicError(null)
    try {
      const res = await fetch('/api/pipeline/preview-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: reel.id, force, ...(instruction?.trim() ? { instruction: instruction.trim() } : {}) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not compose the music.')
      // ?t= busts the browser cache so a recomposed bed (same storage key) plays the new take, not the old.
      if (json?.musicKey) setMusicUrl(`/api/asset?key=${encodeURIComponent(json.musicKey)}&t=${Date.now()}`)
      setMusicStatus('idle')
      if (force) router.refresh() // reflect the added cost in the header
    } catch (e) {
      setMusicError(e instanceof Error ? e.message : 'Could not compose the music.')
      setMusicStatus('error')
    }
  }

  // Auto-request the bed once on load for AI-music channels that don't have one yet — but only at the
  // storyboard gate (not while rendering / post-render, where the worker's generate_music owns it).
  useEffect(() => {
    if (musicRequestedRef.current || !aiMusic || musicUrl || reel.status !== 'storyboard') return
    musicRequestedRef.current = true
    void composeMusic(false)
  }, [aiMusic, musicUrl, reel.status])

  // AI steer ideas for the Regenerate field — fetched ON DEMAND when the operator clicks the icon (never
  // automatically). Text-only, cheap; tailored to this story's mood. Tap one to fill the field.
  async function fetchMusicSuggestions() {
    setMusicSuggestLoading(true)
    try {
      const res = await fetch('/api/pipeline/suggest-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: reel.id }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && Array.isArray(json?.suggestions)) setMusicSuggestions(json.suggestions as string[])
    } finally {
      setMusicSuggestLoading(false)
    }
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
  const twistIdx = storyTwistIdx(scenes, story?.twistAnchor)
  const detail = selectedScene ? (
    <SceneInspector
      key={selectedScene.idx}
      scene={selectedScene}
      beat={sceneBeat(selectedScene.idx, scenes.length, twistIdx)}
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
      onSetSceneType={setSceneType}
      onPreview={handlePreview}
      onReshoot={handleRegenImage}
      onSaveText={saveSceneText}
    />
  ) : (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 px-8 py-16 text-center text-sm text-muted">
      <span className="h-2.5 w-2.5 animate-breathe rounded-full" style={{ backgroundColor: moodTint }} />
      {scenes.length === 0 ? 'Your scenes are being shot…' : 'Pick a scene to start.'}
    </div>
  )

  // Final render preview (the music bed lives in its own card below, vettable before render too)
  const preview = renderUrl ? (
    <div id="preview" className="border-t border-border px-4 py-6 sm:px-8">
      <p className="mb-3 text-xs font-medium text-muted">Render preview</p>
      <video
        src={renderUrl}
        controls
        className="max-h-[28rem] rounded-xl border border-border shadow-sm"
        style={{ aspectRatio: '9/16' }}
      />
    </div>
  ) : null

  // Compose a fresh bed from the Regenerate popover, optionally steered by what the operator typed.
  const submitMusicTweak = () => {
    setMusicTweakOpen(false)
    void composeMusic(true, musicTweak)
    setMusicTweak('')
  }

  // AI-composed bed for this reel — auto-requested on load so the operator hears the mood BEFORE
  // rendering; render-time generate_music reuses this exact take. Regenerate opens a field to steer the
  // new take. A compact control in the bottom bar next to the voice picker (AI-music channels only).
  const musicControl = aiMusic ? (
    <div
      className="relative flex items-center gap-2 rounded-lg border border-border bg-subtle/40 px-2.5 py-1.5"
      title="Background music composed for this reel — mixed under the narration in your reel"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-muted" aria-hidden>
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
      {musicStatus === 'generating' ? (
        <span className="flex items-center gap-1.5 py-1 pr-1 text-xs text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/50 border-t-transparent" />
          Composing music…
        </span>
      ) : musicUrl ? (
        <>
          <audio src={musicUrl} controls controlsList="nodownload noplaybackrate" preload="none" className="h-8 w-44 sm:w-56" />
          <button
            onClick={() => setMusicTweakOpen((o) => !o)}
            aria-expanded={musicTweakOpen}
            className={`flex-shrink-0 hover:text-ink ${musicTweakOpen ? 'text-ink' : 'text-muted'}`}
            title="Regenerate — steer the new take"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
            </svg>
          </button>
        </>
      ) : musicStatus === 'error' ? (
        <button onClick={() => void composeMusic(true)} className="py-1 pr-1 text-xs font-medium text-accent hover:underline" title={musicError ?? undefined}>
          Music failed — retry
        </button>
      ) : (
        <span className="py-1 pr-1 text-xs text-muted">Preparing music…</span>
      )}

      {/* Steer-the-bed popover — opens upward from the footer pill. Type a plain-language change, or
          leave it blank for a fresh take of the same mood. */}
      {musicTweakOpen && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-80 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Steer the music</p>
            {/* AI ideas appear only on click — never auto-loaded, so the field stays unbiased. */}
            <button
              type="button"
              onClick={() => void fetchMusicSuggestions()}
              disabled={musicSuggestLoading}
              className="flex items-center gap-1 text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
              title="Suggest ideas with AI"
            >
              {musicSuggestLoading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/40 border-t-transparent" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9z" /></svg>
              )}
              {musicSuggestions.length > 0 ? 'More ideas' : 'Suggest ideas'}
            </button>
          </div>

          {/* Tap an idea to fill the field. */}
          {musicSuggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {musicSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMusicTweak(s)}
                  className="rounded-full border border-border bg-subtle px-2 py-1 text-left text-[11px] leading-tight text-ink transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <textarea
            value={musicTweak}
            onChange={(e) => setMusicTweak(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitMusicTweak()
              if (e.key === 'Escape') setMusicTweakOpen(false)
            }}
            rows={2}
            autoFocus
            placeholder="Describe how the music should change…"
            aria-label="Steer the background music"
            className="input resize-y text-xs leading-relaxed"
          />
          <button type="button" onClick={submitMusicTweak} className="btn-accent btn-sm mt-2 w-full active:scale-[.98]">
            Compose new take
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">Leave blank for a fresh take of the same mood. It replaces the current bed.</p>
        </div>
      )}
    </div>
  ) : null

  // Strip collapsing rail — two scroll-linked CSS vars, written straight in the scroll handler (no rAF, no
  // React re-render). The rail is position:sticky so the browser pins it natively — rock-steady, no JS-pin
  // shake.
  //   --shrink 0→1 over COLLAPSE_PX → resizes the rail to a filmstrip
  //   --hold = min(scrollTop, COLLAPSE_PX)px → a spacer between the rail and panel that hides BEHIND the
  //     pinned rail; while it grows it keeps the panel glued to the rail's bottom (not under it). It caps at
  //     COLLAPSE_PX so the panel only starts sliding under once the rail is fully compact.
  // The panel stays glued SMOOTHLY only while the rail is still shrinking (the shrink supplies real scroll
  // progress). A hard "lock" past the collapse — holding the panel still while scroll continues — fights
  // native scroll (transform layers desync; growing spacers make the browser jump), so it shakes. To keep
  // the panel from tucking under too soon, lengthen the collapse (larger COLLAPSE_PX) rather than locking.
  const onShrinkScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const COLLAPSE_PX = 320 // scroll distance over which the rail shrinks + the panel stays glued to it
    const st = el.scrollTop
    el.style.setProperty('--shrink', Math.min(1, Math.max(0, st / COLLAPSE_PX)).toFixed(3))
    el.style.setProperty('--hold', Math.min(st, COLLAPSE_PX).toFixed(1) + 'px')
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
        onScroll={timelineView === 'strip' ? onShrinkScroll : undefined}
      >
        {/* STRIP: the rail pins to the top and shrinks to a slim filmstrip as you scroll; once compact it
            stays put while the selected-scene panel scrolls underneath it (native sticky → smooth, no shake).
            Opaque bg + a shadow that deepens with --shrink keep the panel reading as "below/under" the rail.
            GRID: just scrolls. */}
        <div
          className={timelineView === 'strip' ? 'sticky top-0 z-20 bg-subtle' : ''}
          style={timelineView === 'strip' ? { boxShadow: '0 6px 16px -12px rgba(12,12,24,calc(0.45 * var(--shrink, 0)))' } : undefined}
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
            twistIdx={twistIdx}
            view={timelineView}
            onViewChange={setTimelineView}
          />
        </div>

        {/* Phase-1 "hold" spacer — sits between the rail and panel and hides BEHIND the sticky rail. While
            the rail is shrinking it grows with scroll so the panel stays glued to the rail's bottom (never
            under it); once the rail is fully shrunk it caps, so further scroll slides the panel under it. */}
        {timelineView === 'strip' && (
          <div aria-hidden className="flex-shrink-0" style={{ height: 'var(--hold, 0px)' }} />
        )}

        {detail}
        {preview}

        {/* Strip-only stabiliser — grows as the rail shrinks so the scroll height never DROPS mid-scroll
            (which would clamp the scroll and shake). */}
        {timelineView === 'strip' && (
          <div aria-hidden className="flex-shrink-0" style={{ height: 'calc(280px * var(--shrink, 0))' }} />
        )}
      </div>

      {/* Bottom bar — voice + render (storyboard flow only) */}
      {!isPostRender && (
      <div className="sticky bottom-0 z-40 flex flex-shrink-0 flex-wrap items-center gap-4 border-t border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
        {/* Narrator — a pill matching the music control: tap the name to pick a voice, the sliders icon to
            tweak this reel's delivery. */}
        <div className={`relative flex items-center rounded-lg border bg-subtle/40 ${!selectedVoice ? 'border-accent ring-1 ring-accent' : 'border-border'}`}>
          <button
            onClick={() => setShowVoicePicker(true)}
            disabled={recsLoading && !currentVoice}
            className="flex h-11 items-center gap-1.5 rounded-l-lg px-2.5 text-xs font-medium text-ink transition-colors hover:bg-subtle disabled:cursor-wait disabled:text-muted"
            title="Pick a narrator voice"
          >
            {recsLoading && !currentVoice ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/50 border-t-transparent" />
                Finding a voice…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-muted" aria-hidden>
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" />
                </svg>
                <span className="max-w-[11rem] truncate">{currentVoice ? (currentVoice.description ? `${currentVoice.name} · ${currentVoice.description}` : currentVoice.name) : 'Pick voice'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-faint" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </>
            )}
          </button>
          <span className="h-5 w-px flex-shrink-0 bg-border" aria-hidden />
          <button
            onClick={() => setDeliveryOpen((o) => !o)}
            aria-expanded={deliveryOpen}
            className={`relative flex h-11 flex-shrink-0 items-center rounded-r-lg px-2 transition-colors hover:bg-subtle hover:text-ink ${deliveryOpen ? 'text-ink' : 'text-muted'}`}
            title="Delivery settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            {voiceTouched && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
          </button>

          {/* Delivery popover — opens upward from the pill; same sliders/state as the voice picker. */}
          {deliveryOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Delivery{voiceTouched ? ' · custom' : ''}</p>
                {voiceTouched && (
                  <button type="button" onClick={() => { setVoiceSettings(initialVoiceSettings); setVoiceTouched(false) }} className="text-[11px] font-medium text-accent hover:underline">
                    Reset to auto
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <DeliverySlider label="Pace" lo="Slower" hi="Faster" min={0.7} max={1.15} step={0.01} value={voiceSettings.speed} onChange={(v) => setDelivery({ speed: v })} />
                <DeliverySlider label="Expressiveness" lo="Subtle" hi="Dramatic" min={0} max={0.6} step={0.05} value={voiceSettings.style} onChange={(v) => setDelivery({ style: v })} />
                <DeliverySlider label="Steadiness" lo="Varied" hi="Steady" min={0.2} max={0.85} step={0.05} value={voiceSettings.stability} onChange={(v) => setDelivery({ stability: v })} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-faint">Auto-tunes to each story&apos;s mood. Adjust to set it for this reel; preview a voice in the picker to hear it.</p>
            </div>
          )}
        </div>
        {musicControl}
        {error && <p className="text-sm text-danger">{error}</p>}
        {isRenderable && !selectedVoice && !error && !recsLoading && (
          <p className="text-xs text-muted">
            {recsError ? 'Could not load voices — open the picker to retry.' : 'Pick a voice to render.'}
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
  scene, imgSrc, videoKey, showVideo, playVideo, loaded, onLoaded, onDuration, regenerating, animating, frameClass, frameStyle, adaptAspect, frameAspect, contain, children,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; showVideo: boolean; playVideo: boolean
  loaded: boolean; onLoaded: () => void; onDuration?: ((secs: number) => void) | undefined
  regenerating: boolean; animating: boolean
  // frameAspect fixes the frame's shape (e.g. '16 / 9' for a landscape, YouTube-style player); contain fits
  // the media inside it (letterboxed on black) instead of cropping. Without them: adaptAspect → media's own
  // aspect, else a 9:16 tile. frameStyle merges onto the frame box (e.g. scroll-linked border radius/width).
  frameClass?: string | undefined; frameStyle?: React.CSSProperties | undefined; adaptAspect?: boolean; frameAspect?: string | undefined; contain?: boolean; children?: React.ReactNode
}) {
  const hasMedia = Boolean(videoKey || imgSrc)
  const developClass = `style-develop ${loaded ? 'style-develop-in' : ''}`
  // With adaptAspect on, the frame matches the media's real aspect ratio (so non-9:16 reels aren't
  // cropped); otherwise it stays 9:16 for uniform timeline tiles. Defaults to 9:16 until the media loads.
  const [mediaAspect, setMediaAspect] = useState<string | null>(null)
  return (
    <div
      className={`group relative isolate w-full overflow-hidden rounded-xl border shadow-sm ${contain ? 'bg-black' : 'bg-subtle'} ${frameClass ?? 'border-border'}`}
      style={{ aspectRatio: frameAspect ?? (adaptAspect && mediaAspect ? mediaAspect : '9 / 16'), ...frameStyle }}
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
          onLoadedData={(e) => { e.currentTarget.muted = true; void e.currentTarget.play().catch(() => {}); onLoaded() }}
          onLoadedMetadata={(e) => { onDuration?.(e.currentTarget.duration); if (adaptAspect && e.currentTarget.videoWidth) setMediaAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
          // Force muted as a DOM PROPERTY (React's `muted` attribute is famously unreliable on mount — if it
          // doesn't stick the browser blocks autoplay), then kick playback off explicitly so the clip
          // autoplays on every scene select, including cached sources where the `autoPlay` attribute no-ops.
          // Also catch the already-ready (cached) case so the reveal isn't stuck waiting for onLoadedData.
          ref={(el) => { if (el) { el.muted = true; void el.play?.().catch(() => {}); if (el.readyState >= 2) { onLoaded(); if (el.duration) onDuration?.(el.duration); if (adaptAspect && el.videoWidth) setMediaAspect(`${el.videoWidth} / ${el.videoHeight}`) } } }}
          className={`absolute inset-0 z-10 h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${developClass}`}
        />
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={`Scene ${scene.idx}`}
          onLoad={(e) => { onLoaded(); if (adaptAspect && e.currentTarget.naturalWidth) setMediaAspect(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`) }}
          // Same guard for images: a cached image is already `complete` on mount and won't fire onLoad.
          ref={(el) => { if (el?.complete && el.naturalWidth > 0) { onLoaded(); if (adaptAspect) setMediaAspect(`${el.naturalWidth} / ${el.naturalHeight}`) } }}
          className={`absolute inset-0 z-10 h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${developClass}`}
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
      {/* Animated-scene chip — full pill (icon + duration) when the rail is expanded; as it collapses the
          duration smoothly slides away (maxWidth + opacity + margin track --shrink) and the pill tightens to
          just the camera icon, so the compact filmstrip still marks which scenes move. */}
      <span
        className="absolute right-1 top-1 z-20 inline-flex items-center overflow-hidden rounded-full bg-accent/85 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur"
        style={{ paddingLeft: 'calc(0.375rem - 0.125rem * var(--shrink, 0))', paddingRight: 'calc(0.375rem - 0.125rem * var(--shrink, 0))' }}
        title="Moves in the final reel"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 11 6-3.5v9L15 13" /></svg>
        <span
          className="overflow-hidden whitespace-nowrap"
          style={{ maxWidth: 'calc(2.5rem * (1 - var(--shrink, 0)))', marginLeft: 'calc(0.125rem * (1 - var(--shrink, 0)))', opacity: 'calc(1 - var(--shrink, 0))' }}
        >{secs != null ? fmtSecs(secs) : null}</span>
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
  scenes, sceneImages, sceneVideoVariations, loadedMedia, markLoaded, loading, selectedIdx, onSelect, onArrow, moodTint, twistIdx, view, onViewChange,
}: {
  scenes: Scene[]; sceneImages: Record<number, string>; sceneVideoVariations: Record<number, string[]>; loadedMedia: Set<number>
  markLoaded: (idx: number) => void; loading: string | null
  selectedIdx: number | null; onSelect: (idx: number) => void; onArrow: (d: number) => void; moodTint: string; twistIdx: number | null
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
          beat={sceneBeat(scene.idx, scenes.length, twistIdx)}
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
    <div className="flex-shrink-0 border-b border-border bg-subtle">
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
            className="flex min-w-max items-center px-4 sm:px-8"
            style={{
              paddingTop: 'calc(1.5rem - 0.75rem * var(--shrink, 0))',
              paddingBottom: 'calc(2.5rem - 1.75rem * var(--shrink, 0))',
              gap: 'calc(1rem - 0.6rem * var(--shrink, 0))',
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
  scene, imgSrc, videoKey, selected, loaded, markLoaded, regenerating, animating, moodTint, beat, onSelect, layout,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; selected: boolean; loaded: boolean; markLoaded: (idx: number) => void
  regenerating: boolean; animating: boolean; moodTint: string; beat: 'Hook' | 'Build-up' | 'Twist' | 'Payoff'; onSelect: (idx: number) => void; layout: 'strip' | 'grid'
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
    ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-subtle'
    : 'border-border'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(scene.idx)}
      ref={(el) => { if (selected && el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' }) }}
      className={`group flex flex-col text-left focus:outline-none ${isGrid ? 'w-full gap-2' : 'flex-shrink-0'}`}
      /* The selected scene bulges above the row (center-aligned siblings flank it like a focused carousel
         item). The grow is a `transform: scale` — NOT a width change — so it animates smoothly on select
         AND stays independent of the --shrink width (which must resize instantly as you scroll). z-index
         lifts it above neighbors so the scaled edges aren't clipped. */
      style={isStrip ? {
        width: 'calc(10rem - 6.5rem * var(--shrink, 0))',
        gap: 'calc(0.5rem - 0.5rem * var(--shrink, 0))',
        transform: selected ? 'scale(1.07)' : 'scale(1)',
        transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        zIndex: selected ? 10 : 0,
      } : undefined}
    >
      <div
        className="rounded-xl"
        // Match the frame's shrinking corners as it collapses to the compact filmstrip.
        style={isStrip ? { borderRadius: 'calc(0.75rem - 0.45rem * var(--shrink, 0))' } : undefined}
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
          // In the rail, the tile's border + corners tighten as it collapses to the compact filmstrip.
          frameStyle={isStrip ? { borderRadius: 'calc(0.75rem - 0.45rem * var(--shrink, 0))', borderWidth: 'calc(1px - 0.5px * var(--shrink, 0))' } : undefined}
        >
          {/* Scene number — top-left corner. The accent when selected, else the plain dark chip (hero scenes
              are no longer special-cased). In the strip it fades with --shrink so the compact filmstrip is
              just clean frames. */}
          <span
            className={`absolute left-1.5 top-1.5 z-20 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-[11px] font-semibold text-white backdrop-blur ${selected ? 'bg-accent' : 'bg-ink/70'}`}
            style={isStrip ? { opacity: 'calc(1 - var(--shrink, 0))' } : undefined}
          >{scene.idx}</span>
          {/* Narrative beat label — bottom-left, HERO scenes only, carrying the mood-tint wash. Just the
              label when expanded; fades out with --shrink as the rail collapses (the mood ring on the frame
              edge keeps heroes identifiable once compact). */}
          {scene.isHero && (
            <span
              className="absolute bottom-1.5 left-1.5 z-20 inline-flex items-center rounded-md bg-ink/70 px-1.5 py-px text-[10px] font-semibold text-white backdrop-blur"
              style={{
                boxShadow: `inset 0 0 0 999px ${heroTint}55`,
                // Sequenced crossfade: the badge is fully gone by the halfway point of the shrink (×2), so it
                // never overlaps the star, which only starts appearing after that.
                ...(isStrip ? { opacity: 'calc(1 - var(--shrink, 0) * 2)' } : {}),
              }}
            >{beat}</span>
          )}
          {/* Hero marker for the compact rail — a white star bottom-left. Only fades IN over the SECOND half
              of the shrink (×2 − 1), after the badge has fully gone, so the two never overlap. Hidden in
              grid (the badge always shows there). */}
          {scene.isHero && (
            <svg
              className="absolute bottom-1 left-1 z-20"
              width="13" height="13" viewBox="0 0 24 24" fill="white" aria-hidden
              style={isStrip ? { opacity: 'calc(var(--shrink, 0) * 2 - 1)', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))' } : { display: 'none' }}
            ><path d="M12 2.5l2.6 5.7 6.2.6-4.7 4.1 1.4 6.1L12 16l-5.5 3 1.4-6.1L3.2 8.8l6.2-.6z" /></svg>
          )}
          {/* Motion scenes show the play glyph + the actual clip length (top-right); stills show no duration. */}
          {isVideo && <MotionDurationChip clipKey={videoKey} />}
        </SceneMedia>
      </div>
      {/* Caption (place + narration) shows in the grid overview only — the strip rail stays just frames. */}
      {isGrid && (
        <div className="flex flex-col gap-0.5 overflow-hidden px-0.5">
          {shortDesc && <p className="truncate text-xs font-medium capitalize text-ink">{shortDesc}</p>}
          <p className="line-clamp-1 text-[11px] leading-snug text-muted">{scene.narrationText}</p>
        </div>
      )}
    </button>
  )
}

// Which scene is the story's TWIST (its dramatic peak): the scene matching the story's peak line
// (twist_anchor), else the last key visual beat (hero), else the final scene.
function storyTwistIdx(scenes: Scene[], twistAnchor: string | null | undefined): number | null {
  if (scenes.length === 0) return null
  const anchor = (twistAnchor ?? '').trim().toLowerCase()
  if (anchor.length >= 12) {
    const key = anchor.slice(0, 40)
    const hit = scenes.find((s) => (s.narrationText ?? '').toLowerCase().includes(key))
    if (hit) return hit.idx
  }
  const heroes = scenes.filter((s) => s.isHero)
  const last = heroes[heroes.length - 1] ?? scenes[scenes.length - 1]
  return last ? last.idx : null
}

// A scene's narrative beat from its place in the arc: Hook (open) → Build-up → Twist (peak) → Payoff (after).
function sceneBeat(idx: number, total: number, twistIdx: number | null): 'Hook' | 'Build-up' | 'Twist' | 'Payoff' {
  if (idx === 1) return 'Hook'
  if (twistIdx == null) return idx === total ? 'Twist' : 'Build-up'
  if (idx === twistIdx) return 'Twist'
  return idx < twistIdx ? 'Build-up' : 'Payoff'
}

// ── Inspector (detail) ─────────────────────────────────────────────────────────
function SceneInspector({
  scene, beat, imgSrc, variations, activeVar, setActiveVar, loaded, markLoaded, loading, moodTint,
  sceneSaving, setScenes, setSceneSaving, onSetSceneType, onPreview, onReshoot, onSaveText,
}: {
  scene: Scene; beat: 'Hook' | 'Build-up' | 'Twist' | 'Payoff'; imgSrc?: string | undefined; variations: string[]; activeVar: number
  setActiveVar: React.Dispatch<React.SetStateAction<Record<number, number>>>
  loaded: boolean; markLoaded: (idx: number) => void; loading: string | null; moodTint: string
  sceneSaving: 'saving' | 'saved' | undefined
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>
  setSceneSaving: React.Dispatch<React.SetStateAction<Record<number, 'saving' | 'saved'>>>
  onSetSceneType: (idx: number, type: 'static' | 'motion' | 'hero') => void
  onPreview: (idx: number) => void
  onReshoot: (idx: number, opts?: { instruction?: string }) => void
  onSaveText: (idx: number, text: string) => void
}) {
  const isVideo = scene.tier === 'video'
  const videoKey = variations[activeVar]
  const showVideo = isVideo && Boolean(videoKey)
  const animating = loading === `animate-${scene.idx}`
  const regenerating = loading === `regen-${scene.idx}`
  // Actual clip length, read from the playing preview's metadata (state resets per scene via the key prop).
  const [clipSecs, setClipSecs] = useState<number | null>(null)
  // The Twist beat badge uses the mood color (distinct indigo on neutral channels, where mood == selection accent).
  const heroTint = /^#1a1a2e$/i.test(moodTint) ? '#5E6AD2' : moodTint
  const [showFull, setShowFull] = useState(false) // large preview lightbox
  const [fullLoaded, setFullLoaded] = useState(false) // lightbox media has loaded
  const [lightboxAspect, setLightboxAspect] = useState<string | null>(null) // real aspect of the open media
  const [changeText, setChangeText] = useState('') // the creator's plain-language change for this scene

  return (
    <div className="animate-fade-in flex w-full flex-col gap-5 p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Scene {scene.idx}</h2>
        {/* Narrative beat — the Twist (story peak) carries the mood accent; the rest are quietly tinted. */}
        <span
          className={`badge ${beat === 'Hook' ? 'bg-info-soft text-info' : beat === 'Twist' ? '' : 'bg-subtle text-muted'}`}
          style={beat === 'Twist' ? { backgroundColor: `${heroTint}1f`, color: heroTint } : undefined}
        >{beat}</span>
      </div>
      <div className="flex w-full flex-col gap-6 lg:flex-row">
      {/* Preview — its own stage, far left; the frame matches the reel's real aspect (9:16) so the image
          fills it edge-to-edge instead of sitting tiny inside a wide letterbox. */}
      <div className="order-1 flex w-full flex-shrink-0 flex-col lg:w-80">
        {/* The visual is the hero of this panel — presented as a lit stage: a soft mood-tinted glow behind
            an elevated, generously-rounded frame, so the eye lands here first. */}
        <div className="relative isolate">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 z-0 rounded-[2.5rem] opacity-30 blur-2xl"
            style={{ background: `radial-gradient(60% 55% at 50% 42%, ${moodTint}, transparent 72%)` }}
          />
          <div
            onClick={() => imgSrc && (setFullLoaded(false), setLightboxAspect(null), setShowFull(true))}
            title={imgSrc ? 'Open preview' : undefined}
            className={`group/preview relative z-10 w-full ${imgSrc ? 'cursor-zoom-in' : ''}`}
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
              frameClass="!border-0 !rounded-2xl !shadow-xl"
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
      </div>
      {/* Narration — the primary text edit; takes the flexible space */}
      <div className="order-3 flex min-w-0 flex-1 flex-col">
        <label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" /></svg>
          Narration
        </label>
        {/* The script surface — reads like spoken lines, not a form field: a quiet writing pane that lifts to
            white on focus, generous line-height, larger type. */}
        <div className="overflow-hidden rounded-xl border border-border bg-subtle/40 transition-colors focus-within:border-accent/40 focus-within:bg-surface">
          <textarea
            value={scene.narrationText}
            onChange={(e) => {
              const val = e.target.value
              setScenes((prev) => prev.map((s) => (s.idx === scene.idx ? { ...s, narrationText: val } : s)))
              setSceneSaving((s) => { const n = { ...s }; delete n[scene.idx]; return n })
            }}
            onBlur={(e) => void onSaveText(scene.idx, e.target.value)}
            rows={5}
            className="block max-h-[28rem] min-h-[7rem] w-full resize-y bg-transparent p-4 text-[15px] leading-7 text-ink placeholder:text-faint focus:outline-none"
            placeholder="What the narrator says in this scene…"
            aria-label={`Scene ${scene.idx} narration`}
          />
        </div>
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
        {/* The look — the AI's read of this beat (read-only). A quiet icon-led metadata strip under the
            script, like a photo caption: where it's set, and its mood. Reads as context, not a control. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5" title="Where this scene is set">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-danger" aria-hidden><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10Z" /><circle cx="12" cy="11" r="2.5" /></svg>
            <span className="capitalize">{scene.location || 'Anywhere'}</span>
          </span>
          {(scene.mood ?? []).length > 0 && (
            <span className="inline-flex flex-wrap items-center gap-1.5" title="Mood">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 text-warning" aria-hidden><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
              {(scene.mood ?? []).map((m) => (
                <span key={m} className="rounded-full bg-subtle px-2 py-0.5 text-[11px] capitalize">{m}</span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Settings — pick a Format, see the scene's read-only context, then describe any change. */}
      <div className="order-2 flex w-full flex-shrink-0 flex-col gap-6 lg:w-72">
        {imgSrc && (() => {
          const settings = resolveMotionSettings(scene.motionSettings)
          const sceneType: 'static' | 'motion' | 'hero' = scene.tier === 'still' ? 'static' : settings.quality === 'budget' ? 'motion' : 'hero'
          const isVideoType = sceneType !== 'static'
          const previewCost = `$${(motionCostCents(settings) / 100).toFixed(2)}`
          const runChange = () => {
            const instruction = changeText.trim()
            if (!instruction || regenerating) return
            onReshoot(scene.idx, { instruction })
            setChangeText('')
          }
          return (
            <>
              {/* Format — two selectable rows. The Video row expands IN PLACE to reveal its quality choice
                  and preview, and the cost shown in its header tracks the chosen quality, so price lives in
                  one spot and the nesting is obvious. */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Format</p>

                {/* Still image */}
                <button
                  type="button"
                  disabled={animating}
                  aria-pressed={!isVideoType}
                  onClick={() => onSetSceneType(scene.idx, 'static')}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-wait ${!isVideoType ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong'}`}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-info" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                    Still image
                  </span>
                  <span className="text-[11px] font-semibold text-faint">Free</span>
                </button>

                {/* Video — expands in place when chosen */}
                <div className={`overflow-hidden rounded-xl border transition-colors ${isVideoType ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong'}`}>
                  <button
                    type="button"
                    disabled={animating}
                    aria-pressed={isVideoType}
                    onClick={() => { if (!isVideoType) onSetSceneType(scene.idx, 'hero') }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors disabled:cursor-wait"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-positive" aria-hidden><rect x="2" y="6" width="13" height="12" rx="2" /><path d="m15 11 6-3.5v9L15 13" /></svg>
                      Video
                    </span>
                    <span className={`text-[11px] font-semibold ${isVideoType ? 'text-accent' : 'text-faint'}`}>~{previewCost}</span>
                  </button>
                  {isVideoType && (
                    <div className="flex flex-col gap-3 border-t border-accent/20 px-3 py-3">
                      {/* Quality — segmented; the header cost above reflects the pick */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-muted">Quality</span>
                        <div className="inline-flex rounded-lg bg-subtle p-0.5" role="group" aria-label={`Scene ${scene.idx} video quality`}>
                          {([
                            { key: 'motion' as const, label: 'Basic' },
                            { key: 'hero' as const, label: 'Best' },
                          ]).map((q) => {
                            const active = sceneType === q.key
                            return (
                              <button
                                key={q.key}
                                type="button"
                                disabled={animating}
                                aria-pressed={active}
                                onClick={() => onSetSceneType(scene.idx, q.key)}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-wait ${active ? 'bg-surface text-accent shadow-xs' : 'text-muted hover:text-ink'}`}
                              >{q.label}</button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Preview — optional; the scene becomes video at render either way. */}
                      {variations.length === 0 ? (
                        <div className="flex flex-col gap-1">
                          <button type="button" onClick={() => onPreview(scene.idx)} disabled={animating} className="btn-secondary btn-sm w-full active:scale-[.98] disabled:cursor-wait">
                            {animating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Animating…</>) : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l11-7L7 5Z" /></svg>See it move · ~{previewCost}</>)}
                          </button>
                          <span className="text-[11px] leading-relaxed text-faint">This scene moves in your final video either way — preview now to see it first.</span>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-positive" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                          Ready — click the scene to watch it move.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Change this scene — the hero. One field; the system decides whether to refine or re-imagine.
                  This is the one elevated surface in the rail (stronger border + shadow) since it's the
                  action the creator reaches for most. */}
              <div className="flex flex-col gap-2.5 rounded-2xl border border-border-strong bg-surface p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Change this scene</p>
                <textarea
                  value={changeText}
                  onChange={(e) => setChangeText(e.target.value)}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runChange() }}
                  rows={3}
                  disabled={regenerating}
                  placeholder="Describe a tweak, or a whole new look…"
                  aria-label={`Scene ${scene.idx} change`}
                  className="input resize-y text-xs leading-relaxed disabled:opacity-60"
                />
                <button type="button" onClick={runChange} disabled={regenerating || !changeText.trim()} className="btn-accent btn-sm w-full active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
                  {regenerating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Reshooting…</>) : 'Apply change'}
                </button>
                <p className="text-[11px] leading-relaxed text-faint">We'll match whatever you describe. Re-render to apply.</p>
              </div>
            </>
          )
        })()}
      </div>
      </div>

      {/* Large preview lightbox — portaled to <body> so its `fixed` overlay isn't trapped by the collapsing
          rail's translate transform (a transformed ancestor would become its containing block). */}
      {showFull && imgSrc && typeof document !== 'undefined' && createPortal(
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
                  onLoadedData={(e) => { e.currentTarget.muted = true; void e.currentTarget.play().catch(() => {}); setFullLoaded(true) }}
                  onLoadedMetadata={(e) => { if (e.currentTarget.videoWidth) setLightboxAspect(`${e.currentTarget.videoWidth} / ${e.currentTarget.videoHeight}`) }}
                  // Force muted (React's `muted` attr is unreliable → blocks autoplay) and kick off play().
                  ref={(el) => { if (el) { el.muted = true; void el.play?.().catch(() => {}); if (el.readyState >= 2) { setFullLoaded(true); if (el.videoWidth) setLightboxAspect(`${el.videoWidth} / ${el.videoHeight}`) } } }}
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
        </div>,
        document.body,
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
