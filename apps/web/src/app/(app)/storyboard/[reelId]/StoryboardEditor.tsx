'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'
import type { ChannelVoice, VoiceSettings, OperatorCue, CaptionStyle, PostMeta } from '@reels/core'
import { resolveMotionSettings, motionCostCents, operatorCueLabel, VIDEO_EFFECTS, MUSIC_MOODS, MUSIC_MOOD_OPTIONS, type MusicMood } from '@reels/core'
import { GenreLoader } from '@/components/GenreLoader'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { PipelinePhaseStepper } from '@/components/PipelinePhaseStepper'
import { ReelStatusPill } from '@/components/ReelStatusPill'
import { primeReelAlert } from '@/lib/reel-alert'
import { phaseForStep } from '@/lib/pipeline-phases'
import { stepLabel } from '@/lib/pipeline-steps'
import { useToast } from '@/components/Toast'
import { PostCaptionButton, LogPerformanceButton, PostToYouTubeButton } from './PublishTools'
import { CoverPicker, type CoverFrame, type CoverSelection } from './CoverPicker'
import { SceneMedia, MotionDurationChip } from './SceneMedia'
import { SceneStage } from './SceneStage'
import { Timeline } from './Timeline'
import { RenderLedger } from './RenderLedger'
import { ReelReady } from './ReelReady'
import { sceneSeconds, sceneStarts, totalSeconds, fmtClock } from './scene-timing'

type Scene = InferSelectModel<typeof scenes>
type Story = InferSelectModel<typeof stories>

// Voices stored on the channel are ChannelVoice: { providerId, name, gender, description }.
// providerId IS the ElevenLabs voice id used at render — never use a non-existent `id`.
type Voice = ChannelVoice
// In the picker, a recommended voice also carries a "why it fits this reel" reason (per_story
// recommendations). Single-channel pool voices are plain ChannelVoice (no reason).
type PickerVoice = ChannelVoice & { reason?: string | undefined }

interface StoryboardEditorProps {
  reel: { id: string; channelId: string; status: string; voiceId: string | null; costCents: number; operatorMinutes: number; language: string; metricsViews: number | null; publishDestinations: Array<{ target: string; connected: boolean; accountName: string | null }>; scheduledAt?: string | null }
  story: Story | null
  scenes: Scene[]
  voicePool: Voice[]
  // Context for recommending a narrator on the fly when voicePool is empty (per_story channels).
  voiceRecommend: { nicheDescription: string; language: string; toneConfig: unknown; searchKeyword: string }
  sceneImages: Record<number, string>
  // Automated frame notes. Truth conflicts block the final cut; craft notes are review-only.
  sceneImageQa: Record<number, { craftIssues: string[]; truthIssues: string[]; truthBlocked: boolean }>
  // Every image ever generated per scene, oldest→newest — powers Undo/Redo (walk back to a prior take for free).
  sceneImageHistory: Record<number, { assetId: string; url: string }[]>
  sceneVideoVariations: Record<number, string[]>
  renderUrl: string | null
  // Title + cover as a viewer would meet them, plus the frames the cover can be built from and the ranked
  // recommendation behind the current pick. Null until the packaging step has run.
  packaging: {
    title: string
    thumbnailText: string
    coverUrl: string | null
    cover: CoverSelection | null
    frames: CoverFrame[]
    // The channel's aspect, resolved server-side from the platform preset — the picker's tiles have to
    // match the shape of the frames or a portrait grid renders as letterboxed thumbnails.
    vertical: boolean
  } | null
  postMeta: PostMeta | null // the whole post package — the finished-reel screen edits title + caption inline
  renderQa: 'passed' | 'failed' | null // did the automated render checks pass? null = they didn't run
  renderSize: string // the channel's real output size, e.g. "1080×1920", named on the render ledger
  captionStyle: CaptionStyle // the channel's burned-in caption look, previewed on the stage
  musicMood: string | null // this reel's background-music mood override (MusicMood); null = inherit the channel default
  channelMusicMood: string | null // the channel's default mood (MusicMood), shown as the "inherit" option
  aiMusic: boolean // channel composes its bed per-reel (musicMode='ai') → the mood dropdown steers it
  musicMode: string // the channel's music mode from creation: 'ai' | 'preset' | 'upload' | 'none'
  channelMusicTracks: { label: string; url: string }[] // preset/upload beds — shown read-only with a preview
  musicUploadUrl: string | null // per-reel operator-uploaded bed; when set it overrides the channel's music
  initialVideoEffects: string[] | null // per-reel video effects; null = auto (planned from the story)
  initialOperatorSfx: OperatorCue[] // operator-added per-scene manual cues
  initialVoiceSettings: VoiceSettings // auto-derived delivery; voice previews play at this (no manual editing)
  channelName: string
  genreCategory: string // horror | informational | lifestyle | general — picks the loader glyph
  moodTint: string // channel-mood accent (dark=red / warm=amber / neutral=midnight) for ambient touches
  failure: { step: string; error: string } | null
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool, voiceRecommend,
  sceneImages, sceneImageQa, sceneImageHistory, sceneVideoVariations, renderUrl: initialRenderUrl, packaging,
  postMeta, renderQa, renderSize, captionStyle,
  musicMood: initialMusicMood, channelMusicMood, aiMusic, musicMode, channelMusicTracks, musicUploadUrl: initialMusicUploadUrl,
  initialVideoEffects, initialOperatorSfx, initialVoiceSettings,
  channelName, genreCategory, moodTint, failure,
}: StoryboardEditorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [scenes, setScenes] = useState(initialScenes)
  // Re-sync the scene LIST from the server when its identity set changes — scenes created after we
  // mounted mid-build (you land here while breakdown_scenes is still running, so initialScenes is empty),
  // or a scene added/removed later. Without this the useState above stays frozen at its first value, so
  // router.refresh() can't surface the new scenes and the page sits on "Storyboarding" until a hard
  // reload. Keyed on the id set (not every poll) so it fires only on real list changes; we merge prev
  // over server for scenes that already existed, preserving unsaved local field edits (text/tier). Images
  // don't flow through this state (they come from the sceneImages prop), so prev-wins is safe.
  const sceneIdSig = initialScenes.map((s) => s.id).join(',')
  useEffect(() => {
    setScenes((prev) => {
      const prevById = new Map(prev.map((s) => [s.id, s]))
      return initialScenes.map((s) => ({ ...s, ...prevById.get(s.id) }))
    })
  }, [sceneIdSig])
  const [sceneSaving, setSceneSaving] = useState<Record<number, 'saving' | 'saved'>>({}) // per-scene script-edit status
  const [activeVar, setActiveVar] = useState<Record<number, number>>({}) // which video variation plays per scene tile
  const [loadedMedia, setLoadedMedia] = useState<Set<number>>(new Set()) // scenes whose image/video has loaded (for develop-in)
  const markLoaded = (idx: number) => setLoadedMedia((s) => (s.has(idx) ? s : new Set(s).add(idx)))
  // Per-scene cache-bust token, bumped on every successful reshoot. Each regen OVERWRITES the same scene
  // storage key, so the only thing that forces the <img> to re-fetch is a changing URL. Relying on
  // router.refresh() to deliver a new asset-id ?v= is unreliable (stale client router cache → src never
  // changes → browser keeps the already-loaded image → "nothing changed"). Stamping our own token the
  // instant the regen returns guarantees the src changes and the fresh image loads.
  const [imageBust, setImageBust] = useState<Record<number, number>>({})
  // Local image URL override per scene, set the instant an Undo/Redo re-points the scene to a prior take so
  // the preview swaps immediately (the target's storage key isn't in the sceneImages prop until refresh lands).
  const [imageOverride, setImageOverride] = useState<Record<number, string>>({})
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null) // master-detail: which scene the inspector shows
  // 'strip' = the cutting-room layout (stage + inspector above a filmstrip dock); 'grid' = a scrolling
  // overview of every scene. Only the filmstrip scrolls in strip view — the page itself never does.
  const [timelineView, setTimelineView] = useState<'strip' | 'grid'>('strip')
  // The dock's tracks (video clips + voice + music). Open by design — the reel's shape is the point of the
  // dock — but collapsible when the stage needs the height.
  const [tracksOpen, setTracksOpen] = useState(true)
  // A rendered reel opens onto the finished-reel screen. "Back to editing" drops this flag and reveals the
  // storyboard underneath, so a post-render reel is still fully editable (then re-renderable).
  const [editingAfterRender, setEditingAfterRender] = useState(false)
  const tierBusyRef = useRef<Set<number>>(new Set()) // scenes with an in-flight motion toggle (drops rapid flips)
  const [selectedVoice, setSelectedVoice] = useState(reel.voiceId ?? voicePool[0]?.providerId ?? '')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  // Narrator delivery is fully auto — derived per story from the channel's genre + tone (moodToVoiceSettings
  // at render). No manual editing in the UI on purpose: a one-line preview can't validate delivery across a
  // whole narration, and a bad override ships silently. The picker's voice previews play at the auto profile
  // (initialVoiceSettings) so what you audition matches the render.
  function saveVoice(patch: { voiceId: string }) {
    return fetch('/api/pipeline/set-voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, ...patch }),
    }).catch(() => {})
  }
  // Track the prop, don't freeze it: a re-render bumps the render asset's createdAt → page.tsx hands down a
  // NEW render URL, and the preview must swap to it. (Was useState(initialRenderUrl), which pinned the very
  // first URL for the whole session, so a fresh render never showed until a full reload.)
  const renderUrl = initialRenderUrl
  // (Reel-level smart sound design moved to the render-time scene-aware sound designer; no client draft.)
  // Manual per-scene cues (operator-added, e.g. an off-screen line) + their preview clip URLs.
  const [operatorSfx, setOperatorSfx] = useState<OperatorCue[]>(initialOperatorSfx)
  const [soundPreviews, setSoundPreviews] = useState<Record<string, string>>({})
  // Per-reel background-music mood override (null = inherit the channel default). Drives the bed's arc +
  // mood at render — no bed is generated here; the operator just picks a vibe.
  const [musicMood, setMusicMood] = useState<string | null>(initialMusicMood)
  const [musicOpen, setMusicOpen] = useState(false)
  function saveMusicMood(next: string | null) {
    setMusicMood(next)
    void fetch('/api/pipeline/set-music-mood', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, mood: next }),
    }).catch(() => {})
  }
  // Per-reel operator-uploaded music bed — overrides the channel's music at render. Rights are the
  // operator's (see the copyright warning in the popover); we don't check or clear them.
  const [musicUploadUrl, setMusicUploadUrl] = useState<string | null>(initialMusicUploadUrl)
  const [musicUploading, setMusicUploading] = useState(false)
  async function onMusicUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setMusicUploading(true)
    try {
      const fd = new FormData()
      fd.append('reelId', reel.id)
      fd.append('file', file)
      const up = await fetch('/api/channel/music-upload', { method: 'POST', body: fd })
      const uj = await up.json().catch(() => null)
      if (!up.ok || !uj?.key) { toast(uj?.error ?? 'Upload failed — try again.', 'error'); return }
      await fetch('/api/pipeline/set-reel-music', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: reel.id, key: uj.key }),
      })
      setMusicUploadUrl(`/api/asset?key=${encodeURIComponent(uj.key)}&t=${Date.now()}`)
      toast('Music bed uploaded — it’ll be used for this reel.', 'success')
    } finally {
      setMusicUploading(false)
    }
  }
  async function removeMusicUpload() {
    setMusicUploadUrl(null)
    await fetch('/api/pipeline/set-reel-music', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, key: null }),
    }).catch(() => {})
  }
  // Per-reel video effects — null = auto (planned from the story at render); array = explicit selection.
  const [videoEffects, setVideoEffects] = useState<string[] | null>(initialVideoEffects)
  const [effectsOpen, setEffectsOpen] = useState(false)
  function saveVideoEffects(next: string[] | null) {
    setVideoEffects(next)
    void fetch('/api/pipeline/save-video-effects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, effects: next }),
    }).catch(() => {})
  }
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opMinutes, setOpMinutes] = useState(reel.operatorMinutes)
  const startedAt = useRef(Date.now())
  // The operator-minutes total at mount, captured ONCE. Must not read the live reel.operatorMinutes prop
  // in the tick below — router.refresh() updates that prop to a value that already includes the minutes
  // we posted, so `prop + elapsedSinceMount` would re-add this session's elapsed on every tick.
  const baseMinutes = useRef(reel.operatorMinutes)

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
      const next = baseMinutes.current + elapsed
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
    // Intentionally excludes reel.operatorMinutes: the base is captured once in baseMinutes, and
    // restarting the interval on every refresh would also reset the elapsed clock.
  }, [reel.id, reel.status])

  // Pull a friendly message off a failed response; a 429 is a calm "busy, try again" (we never auto-retry).
  async function failMessage(res: Response, fallback: string) {
    const j = await res.json().catch(() => null)
    return (j && typeof j.error === 'string' ? j.error : fallback)
  }

  // Regenerate a scene's image. `mode` picks the behaviour:
  //   'vary'  (default) — condition on the CURRENT image (+ face plates) so it stays close: fix a hand, small
  //                       variation. An optional `instruction` ("lower the hand") steers the tweak.
  //   'fresh' — ignore the current image; re-roll a brand-new composition (plates only → faces still match).
  // The plain "Reshoot" button sends 'vary' with no instruction; "Fresh take" sends 'fresh'.
  async function handleRegenImage(sceneIdx: number, opts?: { instruction?: string; mode?: 'vary' | 'fresh'; referenceKey?: string; anchor?: 'current-first' | 'reference-first' | 'reference-only' }) {
    setLoading(`regen-${sceneIdx}`)
    const res = await fetch('/api/pipeline/regen-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, instruction: opts?.instruction?.trim() || undefined, mode: opts?.mode ?? 'vary', referenceKey: opts?.referenceKey, anchor: opts?.anchor }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      setLoading(null)
      toast(await failMessage(res, 'Could not reshoot this scene.'), res.status === 429 ? 'info' : 'error')
      return
    }
    // If the change edited a recurring character's look, it was updated everywhere — tell the operator which
    // other scenes use her so they can refresh those to match ("update globally, refresh on demand").
    const rj = await res.json().catch(() => null)
    const affected: number[] = rj?.entityLook?.affectedSceneIdxs ?? []
    if (affected.length) {
      toast(`Updated that character everywhere. Scene${affected.length > 1 ? 's' : ''} ${[...affected].sort((a, b) => a - b).join(', ')} also use her — reshoot them to match.`, 'info')
    }
    // A new image supersedes any Undo/Redo override — drop it so the fresh server image wins.
    setImageOverride((o) => { if (!(sceneIdx in o)) return o; const n = { ...o }; delete n[sceneIdx]; return n })
    // Force the <img> to re-fetch the (overwritten) scene image NOW — independent of whether
    // router.refresh() manages to push a fresh asset-id ?v= through the client router cache. Clear this
    // scene's loaded flag so the develop-in reveal plays for the fresh image instead of holding the stale
    // one. The route preserves the scene's intended tier; only the stale generated clip is invalidated.
    setImageBust((b) => ({ ...b, [sceneIdx]: (b[sceneIdx] ?? 0) + 1 }))
    setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
    setLoading(null)
    router.refresh()
  }

  // AI-grounded feedback (opt-in, only when a reference is attached): ask the vision model for concrete,
  // image-grounded ways to use the attachment. Returns [] on any failure so the caller falls back to a
  // plain attach-and-regenerate — the assist never blocks the operator.
  async function handleRegenOptions(sceneIdx: number, referenceKey: string): Promise<{ observation: string | null; options: GroundedOption[] }> {
    try {
      const res = await fetch('/api/pipeline/regen-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: reel.id, sceneIdx, referenceKey }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(j?.options)) return { observation: null, options: [] }
      return { observation: j.observation ?? null, options: j.options as GroundedOption[] }
    } catch {
      return { observation: null, options: [] }
    }
  }

  // "Upload image for this scene": use an operator-uploaded image directly as the scene's image (no
  // generation). Registers it as an asset (joins undo/redo history) and points the scene at it.
  async function handleUploadImage(sceneIdx: number, key: string) {
    const res = await fetch('/api/pipeline/set-scene-image-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, sceneIdx, key }),
    })
    if (!res.ok) { toast(await failMessage(res, 'Could not use that image.'), 'error'); return }
    setImageOverride((o) => { if (!(sceneIdx in o)) return o; const n = { ...o }; delete n[sceneIdx]; return n })
    setImageBust((b) => ({ ...b, [sceneIdx]: (b[sceneIdx] ?? 0) + 1 }))
    setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier: 'still' } : s)))
    toast('Your image is set for this scene.', 'success')
    router.refresh()
  }

  // Undo/Redo: re-point a scene to one of its previously generated images (free, instant — no regeneration).
  // Optimistic: swap the preview + the scene's imageAssetId locally right away, then persist. `url` is the
  // target image's URL (already ?v=<assetId> cache-busted) so the <img> shows it immediately.
  async function handleSetSceneImage(sceneIdx: number, assetId: string, url: string) {
    setImageOverride((o) => ({ ...o, [sceneIdx]: url }))
    setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, imageAssetId: assetId, tier: 'still' } : s)))
    const res = await fetch('/api/pipeline/set-scene-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, assetId }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) { toast(await failMessage(res, 'Could not switch to that image.'), 'error'); return }
    router.refresh()
  }

  // The Motion switch = pure intent: does this beat animate at render? Toggling is instant + free — it
  // just sets the scene's tier (no generation, no spend). Optimistic local update so the tile flips at
  // once. A per-scene in-flight guard drops rapid flips so we don't burst the endpoint. A cached clip is
  // kept when switching off, so flipping back on instantly plays it again.
  // Scene type sets how the scene renders, in one action:
  //   static → a still (zoom/pan only, no AI-video cost)
  //   video  → AI video (Kling i2v). Optimistic; a per-scene in-flight guard drops rapid taps.
  async function setSceneType(sceneIdx: number, type: 'static' | 'video') {
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

  // "Describe the motion" — the movement analog of the reshoot field. The operator says how the shot should
  // move; suggest-motion (motion.v1) translates it to the scene's animation instruction AND arms the scene
  // (video tier + clears any stale clip) so the next Preview/render animates the CURRENT image with it.
  async function handleSuggestMotion(sceneIdx: number, request: string): Promise<boolean> {
    setLoading(`motion-${sceneIdx}`)
    const res = await fetch('/api/pipeline/suggest-motion', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, request }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(null)
    if (!res.ok) {
      toast(await failMessage(res, 'Could not set the motion — try rephrasing.'), res.status === 429 ? 'info' : 'error')
      return false
    }
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier: 'video' } : s)))
    toast('Motion set — preview to see it move.', 'success')
    router.refresh() // resync the cleared clip + video tier so Preview regenerates with the new motion
    return true
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
    primeReelAlert() // user gesture — unlock the chime + ask for notification permission for the done-alert
    setError(null)
    setLoading('render')
    const res = await fetch('/api/pipeline/trigger-render', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, voiceId: selectedVoice }),
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

  // Smart sound design is now owned by the scene-aware sound designer at render time (annotate_audio_script
  // → sound-designer.v1), which reads the story + scene breakdown directly. The old "silently draft
  // soundNotes on load" pass is retired — those notes fed a now-removed interpreter and were the source of
  // the stray background voices/ambience. The operator's per-scene "Add a sound" cues remain the visible control.

  // ── Manual per-scene cues ───────────────────────────────────────────────────
  // Add ONE targeted sound to a scene (e.g. an off-screen line), then auto-preview it.
  async function addSound(sceneIdx: number, instruction: string): Promise<string | null> {
    const res = await fetch('/api/pipeline/add-sound', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, sceneIdx, instruction }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.cue) return (json?.error as string) ?? 'Could not add that sound.'
    const cue = json.cue as OperatorCue
    setOperatorSfx((prev) => [...prev, cue])
    void previewSound(cue.id)
    return null
  }

  async function previewSound(cueId: string): Promise<void> {
    const res = await fetch('/api/pipeline/preview-sound', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, cueId }),
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json?.url) {
      setSoundPreviews((prev) => ({ ...prev, [cueId]: `${json.url}&t=${Date.now()}` }))
      router.refresh()
    }
  }

  async function removeSound(cueId: string): Promise<void> {
    setOperatorSfx((prev) => prev.filter((c) => c.id !== cueId))
    await fetch('/api/pipeline/remove-sound', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, cueId }),
    }).catch(() => null)
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
  // A reel at spot-check can be re-rendered (a changed scene, a different voice) — the dock's button is the
  // same one, so it needs the same permission the old spot-check bar's "Re-render" had.
  const canRerender = isRenderable || reel.status === 'spot_check'
  const canRender = canRerender && !!selectedVoice
  // Post-render states (spot-check → approved → published) open onto the finished-reel screen instead of
  // the storyboard's own action end — until the creator asks to go back to editing.
  const isPostRender = ['spot_check', 'approved', 'scheduled', 'published'].includes(reel.status)
  const showReady = isPostRender && !editingAfterRender
  // While the render chain runs, editing is locked behind the render ledger (below). Build phase (images
  // still generating) is NOT locked — the operator watches scenes populate.
  const isRendering = reel.status === 'rendering' || reel.status === 'render_qa'

  // Live build/render progress: scenes/images still generating (status='storyboard' before they land), or
  // the render chain running. Poll while active — the hook refreshes the server so images + status update.
  const imagesReady = scenes.length > 0 && scenes.every((s) => sceneImages[s.idx])
  const showProgress = (reel.status === 'storyboard' && !imagesReady) || reel.status === 'rendering' || reel.status === 'render_qa'
  // The header journey — each step is done only when the reel really holds the thing it names, so the
  // stepper can never claim progress the reel hasn't made.
  const journeySteps = [
    { label: 'Story', done: !['drafting', 'story_review', 'rejected'].includes(reel.status) },
    { label: 'Storyboard', done: scenes.length > 0 },
    { label: 'Visuals', done: imagesReady },
    { label: 'Render', done: !!renderUrl },
  ]
  // Keep watching for image changes through the WHOLE storyboard editing phase, not just the initial
  // build: a reshoot or an out-of-band re-render swaps an image after imagesReady is already true, and
  // without a live watch the operator would have to manually reload to see it. Poll fast while actively
  // building/rendering, slow (every 6s) once everything's landed — the hook only refreshes when an image
  // actually changes, so the slow idle poll is cheap.
  const watching = showProgress || reel.status === 'storyboard'
  const live = usePipelineStatus(reel.id, { enabled: watching, scenes: true, intervalMs: showProgress ? 2200 : 6000 })
  // The "reel is done" alert is app-wide now (RenderAlertWatcher in the Shell) — it fires on any page.
  // Here we only PRIME it (audio unlock + notification permission) on the Render click, in handleRender.
  const sceneProgress = live?.scenes?.length
    ? { done: live.scenes.filter((s) => s.hasImage).length, total: live.scenes.length }
    : scenes.length > 0
      ? { done: scenes.filter((s) => sceneImages[s.idx]).length, total: scenes.length }
      : undefined

  // Ambient "work in progress" bar — mood-tinted, only while the pipeline runs
  const ambient = showProgress ? (
    <div className="h-0.5 flex-shrink-0 animate-think" style={{ ['--think-tint' as string]: moodTint }} aria-hidden />
  ) : null

  // Scene image URLs with the per-scene reshoot cache-bust folded in, so a just-regenerated image reloads
  // immediately (see imageBust). Falls back to the server URL untouched when a scene hasn't been reshot.
  const bustedImages: Record<number, string> = {}
  for (const [k, url] of Object.entries(sceneImages)) {
    const idx = Number(k)
    // An Undo/Redo override (a prior take) wins until the server refresh catches up; otherwise the current image.
    const src = imageOverride[idx] ?? url
    bustedImages[idx] = imageBust[idx] ? `${src}&b=${imageBust[idx]}` : src
  }

  // Which frame the render ledger shows: the scene the chain is actually working on. The fan-out steps name
  // their rows `generate_images:scene3` / `animate_scenes:s3v1`, so a running row names its own scene.
  const workingSceneIdx = (() => {
    for (const s of live?.steps ?? []) {
      if (s.status !== 'running') continue
      const m = /:(?:scene|s)(\d+)/.exec(s.stepName)
      if (m) return Number(m[1])
    }
    return null
  })()
  const renderingSceneUrl =
    (workingSceneIdx != null ? bustedImages[workingSceneIdx] : undefined) ??
    (selectedIdx != null ? bustedImages[selectedIdx] : undefined) ??
    bustedImages[scenes[0]?.idx ?? 1]

  // How long each scene runs and where it starts — the one basis the stage's position bar and the dock's
  // proportional clips both read from (scene-timing.ts).
  // The channel's real output shape, so a frame opens at the aspect it will publish at instead of
  // defaulting to portrait and snapping wide once the media loads. renderSize is "W×H" from the platform
  // preset (page.tsx); anything unparseable falls back to the 9:16 the app is mostly used for.
  const [rw, rh] = renderSize.split('×').map((n) => Number(n))
  const reelAspect = rw && rh ? `${rw} / ${rh}` : '9 / 16'
  const reelSecs = totalSeconds(scenes)
  const starts = sceneStarts(scenes)
  const motionCount = scenes.filter((s) => s.tier === 'video').length
  const selectedPos = scenes.findIndex((s) => s.idx === selectedIdx)

  // The selected scene's editor (or a fallback) — shared between the strip + grid layouts below
  const twistIdx = storyTwistIdx(scenes, story?.twistAnchor)
  const detail = selectedScene ? (
    <SceneInspector
      key={selectedScene.idx}
      reelId={reel.id}
      scene={selectedScene}
      secs={sceneSeconds(selectedScene)}
      beat={sceneBeat(selectedScene.idx, scenes.length, twistIdx)}
      imgSrc={bustedImages[selectedScene.idx]}
      imageQa={sceneImageQa[selectedScene.idx]}
      variations={sceneVideoVariations[selectedScene.idx] ?? []}
      loading={loading}
      moodTint={moodTint}
      sceneSaving={sceneSaving[selectedScene.idx]}
      setScenes={setScenes}
      setSceneSaving={setSceneSaving}
      onSetSceneType={setSceneType}
      onPreview={handlePreview}
      onSuggestMotion={handleSuggestMotion}
      onReshoot={handleRegenImage}
      onRequestOptions={handleRegenOptions}
      onUploadImage={handleUploadImage}
      history={sceneImageHistory[selectedScene.idx] ?? []}
      onSetSceneImage={handleSetSceneImage}
      onSaveText={saveSceneText}
      sounds={operatorSfx.filter((c) => c.source === 'manual' && selectedScene.narrationText.includes(c.anchor))}
      soundPreviews={soundPreviews}
      onAddSound={addSound}
      onPreviewSound={previewSound}
      onRemoveSound={removeSound}
    />
  ) : null
  // With no scene selected the panel stays EMPTY on purpose: the stage beside it already carries the
  // loader and the prompt, and saying it twice on one screen reads as two different messages.

  // The screening room — the selected scene, played big. The finished CUT isn't shown here: once a reel has
  // rendered it belongs to the finished-reel screen (ReelReady), which plays it at full height with its
  // package beside it. A creator who came back here to edit reaches it again from the header.
  const stage = selectedScene ? (
    <SceneStage
      key={selectedScene.idx}
      scene={selectedScene}
      sceneNo={selectedScene.idx}
      total={scenes.length}
      secs={sceneSeconds(selectedScene)}
      startPct={reelSecs > 0 ? ((starts[selectedScene.idx] ?? 0) / reelSecs) * 100 : 0}
      spanPct={reelSecs > 0 ? (sceneSeconds(selectedScene) / reelSecs) * 100 : 100}
      imgSrc={bustedImages[selectedScene.idx]}
      variations={sceneVideoVariations[selectedScene.idx] ?? []}
      activeVar={activeVar[selectedScene.idx] ?? 0}
      onCycleVar={() => setActiveVar((m) => ({ ...m, [selectedScene.idx]: ((m[selectedScene.idx] ?? 0) + 1) % Math.max(1, (sceneVideoVariations[selectedScene.idx] ?? []).length) }))}
      loaded={loadedMedia.has(selectedScene.idx)}
      markLoaded={markLoaded}
      regenerating={loading === `regen-${selectedScene.idx}`}
      animating={loading === `animate-${selectedScene.idx}`}
      moodTint={moodTint}
      reelAspect={reelAspect}
      captionStyle={captionStyle}
      onPrev={() => selectDelta(-1)}
      onNext={() => selectDelta(1)}
      canPrev={selectedPos > 0}
      canNext={selectedPos >= 0 && selectedPos < scenes.length - 1}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-sm text-night-body">
      {scenes.length === 0 ? (
        <>
          <GenreLoader genre={genreCategory} tint={moodTint} size={52} />
          Your scenes are being shot…
        </>
      ) : (
        <>
          <span className="h-2.5 w-2.5 animate-breathe rounded-full" style={{ backgroundColor: moodTint }} />
          Pick a scene to start.
        </>
      )}
    </div>
  )

  // Background-music mood — a footer pill + popover (mirrors the video-effects picker). Single-select: pick
  // a mood or inherit the channel default. No bed is generated here; the choice steers generate_music at
  // render. AI-music channels only (preset/upload/none source their bed elsewhere).
  const channelMoodLabel =
    channelMusicMood && (channelMusicMood in MUSIC_MOODS)
      ? MUSIC_MOODS[channelMusicMood as MusicMood].label
      : null
  const isDefaultMood = musicMood === null
  const activeMoodLabel = !isDefaultMood && (musicMood in MUSIC_MOODS) ? MUSIC_MOODS[musicMood as MusicMood].label : null
  // What the dock's music TRACK says it's carrying — the same truth as the Music chip, in one phrase.
  const musicTrackLabel = musicUploadUrl
    ? 'Your uploaded bed'
    : aiMusic
      ? `${activeMoodLabel ?? channelMoodLabel ?? 'Channel default'} · bed`
      : (musicMode === 'preset' || musicMode === 'upload') && channelMusicTracks.length > 0
        ? `${channelMusicTracks[0]!.label}${channelMusicTracks.length > 1 ? ` +${channelMusicTracks.length - 1}` : ''}`
        : 'No music bed'
  // Upload-your-own-bed affordance — shown at the bottom of each music popover. The uploaded STATE gets its
  // own pill (first branch below). Copyright is the operator's; we surface a clear warning and don't clear it.
  const musicUploadSection = (
    <div className="mt-3 border-t border-border pt-2.5">
      <label className={`flex cursor-pointer items-center gap-1.5 text-[11px] font-medium ${musicUploading ? 'text-muted' : 'text-accent hover:underline'}`}>
        {musicUploading
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/50 border-t-transparent" aria-hidden />
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></svg>}
        {musicUploading ? 'Uploading…' : 'Upload your own bed'}
        <input type="file" accept="audio/*" className="hidden" onChange={onMusicUpload} disabled={musicUploading} />
      </label>
      <p className="mt-1 text-[11px] leading-relaxed text-faint">⚠ Use only music you have the rights to — we don’t clear copyright. Uploaded tracks can get your reel muted or blocked by platforms’ audio-matching.</p>
    </div>
  )
  const musicControl = musicUploadUrl ? (
    // Operator uploaded a bed for THIS reel — it overrides the channel's music at render.
    <div className="relative flex items-center">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`dock-chip ${musicOpen ? 'border-white/20 bg-white/[0.1]' : ''}`}
        title="Your uploaded music bed for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className="rounded-full bg-accent/30 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">Custom</span>
      </button>

      {musicOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Your uploaded bed</p>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">Used for this reel, over the channel’s music. Re-render to hear it in the cut.</p>
          <audio controls controlsList="nodownload" preload="none" src={musicUploadUrl} className="h-8 w-full" />
          <button type="button" onClick={removeMusicUpload} className="mt-2 text-[11px] font-medium text-danger hover:underline">Remove upload</button>
        </div>
      )}
    </div>
  ) : aiMusic ? (
    <div className="relative flex items-center">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`dock-chip ${musicOpen ? 'border-white/20 bg-white/[0.1]' : ''}`}
        title="Background music mood for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isDefaultMood ? 'bg-accent/30 text-white' : 'bg-white/10 text-night-body'}`}>
          {isDefaultMood ? 'Default' : activeMoodLabel ?? 'Custom'}
        </span>
      </button>

      {musicOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Background music</p>
            {!isDefaultMood && (
              <button type="button" onClick={() => saveMusicMood(null)} className="text-[11px] font-medium text-accent hover:underline">
                Use channel default
              </button>
            )}
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            Sets the vibe of the bed generated with your reel. Re-render to hear changes.
          </p>
          <div className="flex flex-col gap-1.5">
            {/* Inherit the channel default */}
            <button
              type="button"
              onClick={() => saveMusicMood(null)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${isDefaultMood ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
            >
              <span>
                <span className="block text-xs font-medium text-ink">Channel default</span>
                <span className="block text-[11px] text-faint">{channelMoodLabel ? `Currently: ${channelMoodLabel}` : 'The channel’s own sound'}</span>
              </span>
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${isDefaultMood ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                {isDefaultMood && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
            </button>
            {MUSIC_MOOD_OPTIONS.map((m) => {
              const on = musicMood === m.value
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => saveMusicMood(m.value)}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
                >
                  <span>
                    <span className="block text-xs font-medium text-ink">{m.label}</span>
                    <span className="block text-[11px] text-faint">{m.hint}</span>
                  </span>
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                    {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                </button>
              )
            })}
          </div>
          {musicUploadSection}
        </div>
      )}
    </div>
  ) : (musicMode === 'preset' || musicMode === 'upload') && channelMusicTracks.length > 0 ? (
    // Preset/upload channel: reflect the chosen track(s) read-only, with a preview.
    <div className="relative flex items-center">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`dock-chip ${musicOpen ? 'border-white/20 bg-white/[0.1]' : ''}`}
        title="Background music for this channel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-night-body">
          {musicMode === 'upload' ? 'Uploaded' : 'Preset'}
        </span>
      </button>

      {musicOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Background music</p>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            {musicMode === 'upload'
              ? 'Your uploaded track, mixed under the narration.'
              : channelMusicTracks.length > 1
                ? 'From the channel’s preset pool — one bed is picked per reel to fit its mood.'
                : 'The channel’s preset bed, mixed under the narration.'}
          </p>
          <div className="flex flex-col gap-2.5">
            {channelMusicTracks.map((t, i) => (
              <div key={i}>
                <p className="mb-1 text-xs font-medium text-ink">{t.label}</p>
                <audio controls controlsList="nodownload noplaybackrate" preload="none" src={t.url} className="h-8 w-full" />
              </div>
            ))}
          </div>
          {musicUploadSection}
        </div>
      )}
    </div>
  ) : (
    // 'none' (or an empty pool): no channel music, but the operator can still upload a bed for this reel.
    <div className="relative flex items-center">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`dock-chip ${musicOpen ? 'border-white/20 bg-white/[0.1]' : ''}`}
        title="Background music for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-night-muted" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><line x1="3" y1="3" x2="21" y2="21" />
        </svg>
        Music
        <span className="rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-night-muted">Off</span>
      </button>

      {musicOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Background music</p>
          <p className="text-[11px] leading-relaxed text-faint">This channel runs without background music — but you can add one for this reel.</p>
          {musicUploadSection}
        </div>
      )}
    </div>
  )

  // Per-reel video effects picker — a footer pill + popover. Auto (null) = effects chosen from the story
  // at render; toggling any effect switches to an explicit selection applied across the reel.
  const isAuto = videoEffects === null
  const effectsControl = (
    <div className="relative flex items-center">
      <button
        onClick={() => setEffectsOpen((o) => !o)}
        aria-expanded={effectsOpen}
        className={`dock-chip ${effectsOpen ? 'border-white/20 bg-white/[0.1]' : ''}`}
        title="Video effects for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" />
        </svg>
        Effects
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isAuto ? 'bg-accent/30 text-white' : 'bg-white/10 text-night-body'}`}>
          {isAuto ? 'Auto' : videoEffects.length === 0 ? 'Off' : String(videoEffects.length)}
        </span>
      </button>

      {effectsOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Video effects</p>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-faint">
            {isAuto ? 'Chosen automatically from the story. Tap an effect to set your own.' : 'Applied across this reel. Re-render to see changes.'}
          </p>
          <div className="flex flex-col gap-1.5">
            {/* Auto — first-class option (mirrors the music "Channel default" row), not a hidden link. */}
            <button
              type="button"
              onClick={() => saveVideoEffects(null)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${isAuto ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
            >
              <span>
                <span className="block text-xs font-medium text-ink">Auto</span>
                <span className="block text-[11px] text-faint">Chosen from the story at render</span>
              </span>
              <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${isAuto ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                {isAuto && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
            </button>
            {VIDEO_EFFECTS.map((fx) => {
              const on = !isAuto && videoEffects.includes(fx.id)
              return (
                <button
                  key={fx.id}
                  type="button"
                  onClick={() => {
                    const cur = isAuto ? [] : videoEffects
                    const next = cur.includes(fx.id) ? cur.filter((x) => x !== fx.id) : [...cur, fx.id]
                    saveVideoEffects(next)
                  }}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
                >
                  <span>
                    <span className="block text-xs font-medium text-ink">{fx.label}</span>
                    <span className="block text-[11px] text-faint">{fx.hint}</span>
                  </span>
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                    {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative flex h-full flex-col bg-bg">
      {/* Header — title block on the left, the reel's four-step journey on the right */}
      <div className="sticky top-0 z-40 flex flex-shrink-0 items-center gap-4 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* The way out. The storyboard runs without the app sidebar (Shell's IMMERSIVE list), so this is
              the only exit on the surface — it gets a real bordered control rather than a ghost glyph, and
              it goes UP to the channel this reel belongs to, which is where its siblings are. */}
          <a
            href={`/channel/${reel.channelId}`}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border border-border-mid bg-surface text-muted transition-colors hover:border-accent-ring hover:text-ink"
            title={channelName ? `Back to ${channelName}` : 'Back to the channel'}
            aria-label={channelName ? `Back to ${channelName}` : 'Back to the channel'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </a>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-800 -tracking-[0.01em] text-ink">{story?.title ?? 'Untitled reel'}</p>
            {/* Where you are, in the design's words: the channel, then this stage of its reel. */}
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="truncate">{channelName ? `${channelName} · storyboard` : 'Storyboard'}</span>
              <ReelStatusPill status={reel.status} />
            </p>
          </div>
        </div>
        <div className="flex-1" />
        {/* Back to the finished reel, for a creator who came here to change something after a render. */}
        {isPostRender && editingAfterRender && (
          <button onClick={() => setEditingAfterRender(false)} className="btn-secondary btn-sm flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 3v18l15-9z" /></svg>
            Finished reel
          </button>
        )}
        <ReelStepper steps={journeySteps} />
        <div className="flex flex-shrink-0 items-center gap-4 border-l border-border pl-4 font-mono text-xs tabular-nums text-muted lg:ml-2">
          {/* key={value} replays the flash on each change, so live cost/time updates read as live */}
          <span key={`c${reel.costCents}`} className="animate-value-flash" title="Spend so far">${(reel.costCents / 100).toFixed(2)}</span>
          <span key={`m${opMinutes}`} className="animate-value-flash" title="Operator minutes">{opMinutes} min</span>
        </div>
      </div>

      {/* Failure banner — surfaces a hard pipeline failure so the reel isn't a silent stall.
          Creators get phase-vocabulary copy; the raw step + provider error live behind the disclosure. */}
      {reel.status === 'failed' && failure && (
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-danger/30 bg-danger-soft px-4 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">
              {(() => {
                const phase = phaseForStep(failure.step)
                return phase
                  ? `Something went wrong while ${phase.label.toLowerCase()}.`
                  : 'Something went wrong while making this reel.'
              })()}
            </p>
            <p className="mt-0.5 text-xs text-danger/80">Nothing’s lost — everything finished so far is kept. Retry picks up from there.</p>
            <details className="mt-1.5 text-xs text-danger/70">
              <summary className="cursor-pointer select-none font-medium">Technical details</summary>
              <p className="mt-1 break-words">
                <span className="font-mono">{stepLabel(failure.step.split(':')[0])} ({failure.step})</span> — {failure.error}
              </p>
            </details>
          </div>
          <button onClick={handleRetry} disabled={loading === 'retry'} className="btn-secondary btn-sm flex-shrink-0">
            {loading === 'retry' ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {/* Live BUILD progress strip — phases + scene readiness while images generate. During the RENDER
          chain the full-surface render ledger (below) takes over instead. */}
      {showProgress && !isRendering && (
        <PipelinePhaseStepper reelStatus={live?.reelStatus ?? reel.status} steps={live?.steps ?? []} genre={genreCategory} sceneProgress={sceneProgress} />
      )}

      {ambient}

      {/* ══ WORKSPACE ROW ══ One row, fixed height, no page scroll.
          STRIP: the screening room on the left (the scene, played big) and the inspector DOCKED to the
          right edge as a light panel — flush, hairline-separated, and the owner of the only vertical
          scroll here. GRID: a scrolling overview of every scene instead. */}
      {timelineView === 'strip' ? (
        // Below lg the row becomes a COLUMN — stage on top, inspector under it — rather than a second copy
        // of the inspector: two mounted instances would mean two sets of the same DOM ids and two
        // independent drafts of the same scene's change field.
        <div
          className={`flex min-h-0 flex-1 flex-col lg:flex-row ${isRendering ? 'pointer-events-none select-none' : ''}`}
          aria-hidden={isRendering || undefined}
        >
          <div className="stage relative flex min-h-[38%] min-w-0 flex-1 bg-night-800 lg:min-h-0">
            <div className="stage-leak" />
            <div className="film-grain" />
            {stage}
          </div>
          <aside className="min-h-0 flex-1 overflow-y-auto border-border bg-surface max-lg:border-t lg:w-[344px] lg:flex-none lg:border-l">
            {detail}
          </aside>
        </div>
      ) : (
        <div
          className={`min-h-0 flex-1 overflow-y-auto bg-subtle ${isRendering ? 'pointer-events-none select-none' : ''}`}
          aria-hidden={isRendering || undefined}
        >
          <SceneGrid
            scenes={scenes}
            sceneImages={bustedImages}
            sceneVideoVariations={sceneVideoVariations}
            loadedMedia={loadedMedia}
            markLoaded={markLoaded}
            loading={loading}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            onArrow={selectDelta}
            moodTint={moodTint}
            twistIdx={twistIdx}
            onViewChange={setTimelineView}
          />
        </div>
      )}
      {/* ══ THE DOCK ══ The cutting room's bench: a transport row (where the reel is, what it's made of,
          the one button that renders it) over the reel's SHAPE — clips sized by how long they run, with
          the voice and music tracks under them. Hidden while rendering (the ledger owns the surface). */}
      {!isRendering && (
        <Timeline
          scenes={scenes}
          sceneImages={bustedImages}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
          onArrow={selectDelta}
          loading={loading}
          tracksOpen={tracksOpen && timelineView === 'strip'}
          onToggleTracks={() => setTracksOpen((o) => !o)}
          voiceLabel={currentVoice ? `${currentVoice.name} · ${(currentVoice.description ?? '').toLowerCase() || 'narrator'}` : 'No voice picked'}
          onEditVoice={() => setShowVoicePicker(true)}
          musicLabel={musicTrackLabel}
          onEditMusic={() => setMusicOpen((o) => !o)}
          viewToggle={
            <div className="inline-flex items-center gap-0.5 rounded-sm bg-white/[0.06] p-0.5">
              {([
                ['strip', 'Timeline view', <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="16" rx="1" /><rect x="17" y="4" width="5" height="16" rx="1" /></>],
                ['grid', 'Grid view', <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>],
              ] as const).map(([v, label, icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTimelineView(v)}
                  aria-pressed={timelineView === v}
                  title={label}
                  aria-label={label}
                  className={`rounded-md px-2 py-1 transition-colors ${timelineView === v ? 'bg-white/[0.14] text-night-ink' : 'text-night-faint hover:text-night-ink'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>{icon}</svg>
                </button>
              ))}
            </div>
          }
          controls={
            <>
              {/* Narrator — tap to pick the voice. Delivery is auto-tuned per story (no manual sliders). */}
              <button
                onClick={() => setShowVoicePicker(true)}
                disabled={recsLoading && !currentVoice}
                className={`dock-chip h-9 ${!selectedVoice ? 'border-accent-ring' : ''}`}
                title="Pick a narrator voice"
              >
                {recsLoading && !currentVoice ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
                    Finding a voice…
                  </>
                ) : (
                  <>
                    <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-sm bg-pair-blue-purple">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" />
                      </svg>
                    </span>
                    <span className="max-w-[8rem] truncate">{currentVoice ? currentVoice.name : 'Pick voice'}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-night-faint" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </>
                )}
              </button>
              {musicControl}
              {effectsControl}
            </>
          }
          actions={
            <div className="flex items-center gap-3">
              {/* Spend — the reel's real cost so far, right-aligned label over value the way the design
                  lays out its render figure. (Not a forecast: render cost is only known once the
                  providers report usage.) */}
              <div className="hidden text-right sm:block" title="What this reel has cost to make so far">
                <p className="font-mono text-[9px] font-700 uppercase tracking-[0.1em] text-night-gutter">Spend</p>
                <p key={`s${reel.costCents}`} className="animate-value-flash font-mono text-sm font-700 tabular-nums text-night-ink">${(reel.costCents / 100).toFixed(2)}</p>
              </div>
              <button
                onClick={handleRender}
                disabled={loading === 'render' || !canRender}
                className="btn-primary btn-glow rounded-[11px] px-5 py-[11px] text-[13px] active:scale-[.98]"
                title={!selectedVoice ? 'Pick a narrator voice first' : undefined}
              >
                {loading === 'render' ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                    Queuing…
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M5 3v18l15-9z" />
                    </svg>
                    {renderUrl ? 'Re-render' : 'Render reel'}
                  </>
                )}
              </button>
            </div>
          }
        />
      )}
      {/* Why the render button is disabled, and anything that went wrong queuing it. */}
      {!isRendering && (error || (canRerender && !selectedVoice && !recsLoading)) && (
        <p className={`flex-shrink-0 bg-night-dock px-5 pb-2.5 text-[11px] ${error ? 'text-night-danger' : 'text-night-muted'}`}>
          {error ?? (recsError ? 'Could not load voices — open the picker to retry.' : 'Pick a voice to render.')}
        </p>
      )}

      {/* Rendering moment — the reel being made, beside a ledger of the real pipeline steps. Also LOCKS
          the editor while the chain runs. Clears itself when the reel lands at spot-check. */}
      {isRendering && (
        <RenderLedger
          steps={live?.steps ?? []}
          costCents={reel.costCents}
          title={packaging?.title ?? story?.title ?? 'your reel'}
          sceneCount={scenes.length}
          motionCount={motionCount}
          voiceName={currentVoice?.name ?? ''}
          renderSize={renderSize}
          previewUrl={renderingSceneUrl}
          moodTint={moodTint}
        />
      )}


      {/* ══ YOUR REEL IS READY ══ The finished cut, with the package a viewer meets beside it. This is
          where "would you publish this?" gets asked, so it gets the whole surface instead of a bar an inch
          tall. "Back to editing" reveals the storyboard underneath (and the header brings this back). */}
      {showReady && (
        <ReelReady
          reelId={reel.id}
          channelId={reel.channelId}
          status={reel.status}
          title={packaging?.title ?? story?.title ?? 'Untitled reel'}
          renderUrl={renderUrl}
          coverUrl={packaging?.coverUrl ?? null}
          sceneCount={scenes.length}
          estSecs={reelSecs}
          voiceName={currentVoice?.name ?? ''}
          musicName={musicTrackLabel}
          costCents={reel.costCents}
          qa={renderQa}
          scheduledAt={reel.scheduledAt ?? null}
          metricsViews={reel.metricsViews}
          postMeta={postMeta}
          destinations={reel.publishDestinations}
          loading={loading}
          error={error}
          onBack={() => setEditingAfterRender(true)}
          onRerender={handleRender}
          onApprove={handleApprove}
          onPublish={handlePublish}
          coverPicker={packaging ? (
            <CoverPicker
              reelId={reel.id}
              cover={packaging.cover}
              frames={packaging.frames}
              vertical={packaging.vertical}
              triggerClass="btn-dark px-3 py-1.5 text-xs"
            />
          ) : null}
          publishTools={
            <>
              {/* The rest of the package — thumbnail words, hook, hashtags — behind its own dialog. */}
              <PostCaptionButton reelId={reel.id} triggerClass="btn-dark" />
              {reel.status === 'approved' && reel.publishDestinations.some((d) => (d.target === 'youtube_shorts' || d.target === 'youtube_long') && d.connected) && (
                <PostToYouTubeButton reelId={reel.id} triggerClass="btn-dark" />
              )}
              {reel.status === 'published' && (
                <LogPerformanceButton reelId={reel.id} initialViews={reel.metricsViews} triggerClass="btn-dark" />
              )}
            </>
          }
        />
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
          voiceSettings={initialVoiceSettings}
          onSelect={(id) => { setSelectedVoice(id); void saveVoice({ voiceId: id }); setShowVoicePicker(false) }}
          onClose={() => setShowVoicePicker(false)}
        />
      )}
    </div>
  )
}

// ── Pipeline stepper (header) ───────────────────────────────────────────────
// The reel's journey in four creator-facing steps: Story → Storyboard → Visuals → Render. Every state
// is DERIVED from what the reel actually has (an approved story, scenes, images, a finished render) —
// never a decorative progress bar. The current step is the first one not yet done.
function ReelStepper({ steps }: { steps: Array<{ label: string; done: boolean }> }) {
  const currentIdx = steps.findIndex((s) => !s.done)
  return (
    <ol className="hidden items-center lg:flex" aria-label="Reel progress">
      {steps.map((step, i) => {
        const state = step.done ? 'done' : i === currentIdx ? 'current' : 'pending'
        return (
          <li key={step.label} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`mx-2 h-0.5 w-6 rounded-full ${steps[i - 1]!.done ? 'bg-brand-bar' : 'bg-border-mid'}`}
              />
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[11px] font-700 tabular-nums ${
                  state === 'done'
                    ? 'bg-pair-blue-purple text-white'
                    : state === 'current'
                      ? 'bg-pair-purple-pink text-white ring-4 ring-focus'
                      : 'border border-border-mid bg-subtle-strong text-faint'
                }`}
              >
                {state === 'done' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5L20 7" /></svg>
                ) : i + 1}
              </span>
              <span className={`text-xs ${state === 'pending' ? 'font-500 text-faint' : state === 'current' ? 'font-700 text-ink' : 'font-600 text-ink'}`}>
                {step.label}
              </span>
            </span>
            <span className="sr-only">{state === 'done' ? ' — done' : state === 'current' ? ' — current step' : ' — not started'}</span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Grid overview ─────────────────────────────────────────────────────────────
// Every scene at once — the counterpart to the dock's proportional read of the same reel. The timeline
// answers "how is this cut paced?"; the grid answers "what is in it?". Selection is shared, so a frame
// picked here is the scene the stage shows when you switch back.
function SceneGrid({
  scenes, sceneImages, sceneVideoVariations, loadedMedia, markLoaded, loading, selectedIdx, onSelect, onArrow, moodTint, twistIdx, onViewChange,
}: {
  scenes: Scene[]; sceneImages: Record<number, string>; sceneVideoVariations: Record<number, string[]>; loadedMedia: Set<number>
  markLoaded: (idx: number) => void; loading: string | null
  selectedIdx: number | null; onSelect: (idx: number) => void; onArrow: (d: number) => void; moodTint: string; twistIdx: number | null
  onViewChange: (v: 'strip' | 'grid') => void
}) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
    if (e.key === 'ArrowRight') { e.preventDefault(); onArrow(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onArrow(-1) }
  }
  const total = totalSeconds(scenes)

  return (
    <div className="border-b border-border bg-subtle">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 sm:px-8">
        <span className="flex items-center gap-2.5">
          <span className="micro-label">{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}</span>
          {total > 0 && <span className="mono-value text-[11px] text-muted" title="Estimated runtime across all scenes">{fmtClock(total)} total</span>}
        </span>
        <button
          type="button"
          onClick={() => onViewChange('strip')}
          className="btn-secondary btn-sm"
          title="Back to the timeline"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="16" rx="1" /><rect x="17" y="4" width="5" height="16" rx="1" /></svg>
          Timeline
        </button>
      </div>

      <div role="listbox" aria-label="Scenes" tabIndex={0} onKeyDown={onKeyDown}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] items-start gap-x-4 gap-y-5 px-4 py-6 sm:px-8">
          {scenes.length === 0 && (
            <div className="flex aspect-[9/16] w-40 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-border-strong px-2 text-center text-xs text-faint">
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
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SceneThumb({
  scene, imgSrc, videoKey, selected, loaded, markLoaded, regenerating, animating, moodTint, beat, onSelect,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; selected: boolean; loaded: boolean; markLoaded: (idx: number) => void
  regenerating: boolean; animating: boolean; moodTint: string; beat: 'Hook' | 'Build-up' | 'Twist' | 'Payoff'; onSelect: (idx: number) => void
}) {
  const isVideo = scene.tier === 'video'
  // On neutral channels the mood tint IS the brand accent (#9B3BFF) — identical to the selection colour —
  // so a hero wash would read as "selected". Swap in a distinct highlight hue there; dark/warm channels
  // keep their real mood color (red / amber), which already differs from the selection accent.
  const heroTint = /^#9b3bff$/i.test(moodTint) ? '#2FA4FF' : moodTint
  // A super-short scene descriptor — the place it's set (capped at 2 words), falling back to its lead mood word.
  const shortDesc = (scene.location || scene.mood?.[0] || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
  const state = regenerating || animating ? 'rendering' : isVideo ? 'motion' : 'still'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(scene.idx)}
      className="group flex w-full flex-col gap-2 text-left focus:outline-none"
    >
      <div className="rounded-xl">
        <SceneMedia
          scene={scene}
          imgSrc={imgSrc}
          showVideo={false}
          playVideo={false}
          loaded={loaded}
          onLoaded={() => markLoaded(scene.idx)}
          regenerating={regenerating}
          animating={animating}
          frameClass={selected ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-subtle' : 'border-border'}
        >
          <span
            className={`absolute left-1.5 top-1.5 z-20 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-sm px-1 font-mono text-[11px] font-700 tabular-nums text-white backdrop-blur ${selected ? 'bg-brand-3' : 'bg-ink/70'}`}
          >{String(scene.idx).padStart(2, '0')}</span>
          {/* Key beats carry their narrative name — there's room for it here, unlike on a timeline clip. */}
          {scene.isHero && (
            <span
              className="absolute bottom-1.5 left-1.5 z-20 inline-flex items-center rounded-md bg-ink/70 px-1.5 py-px text-[10px] font-semibold text-white backdrop-blur"
              style={{ boxShadow: `inset 0 0 0 999px ${heroTint}55` }}
            >{beat}</span>
          )}
          {/* Motion scenes show the play glyph + the actual clip length (top-right); stills show no duration. */}
          {isVideo && <MotionDurationChip clipKey={videoKey} />}
        </SceneMedia>
      </div>
      <div className="flex flex-col gap-0.5 overflow-hidden px-0.5">
        <p className="flex items-center gap-1.5 overflow-hidden">
          {shortDesc && <span className="truncate text-xs font-600 capitalize text-ink">{shortDesc}</span>}
          <span className="mono-label flex-shrink-0 text-[9px]">{state}</span>
        </p>
        <p className="line-clamp-1 text-[11px] leading-snug text-muted">{scene.narrationText}</p>
      </div>
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
// One AI-grounded option offered when the operator attaches a reference (see grounded-feedback.v1). `anchor`
// controls how strongly the reference leads; `directive` is the ready-to-send image-prompt phrasing.
type GroundedOption = { label: string; description: string; intent: string; anchor: 'current-first' | 'reference-first' | 'reference-only'; directive: string }

function SceneInspector({
  reelId, scene, secs, beat, imgSrc, variations, loading, moodTint,
  imageQa,
  sceneSaving, setScenes, setSceneSaving, onSetSceneType, onPreview, onSuggestMotion, onReshoot, onRequestOptions, onUploadImage, history, onSetSceneImage, onSaveText,
  sounds, soundPreviews, onAddSound, onPreviewSound, onRemoveSound,
}: {
  reelId: string
  scene: Scene; secs: number; beat: 'Hook' | 'Build-up' | 'Twist' | 'Payoff'; imgSrc?: string | undefined; variations: string[]
  imageQa?: { craftIssues: string[]; truthIssues: string[]; truthBlocked: boolean } | undefined
  loading: string | null; moodTint: string
  sceneSaving: 'saving' | 'saved' | undefined
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>
  setSceneSaving: React.Dispatch<React.SetStateAction<Record<number, 'saving' | 'saved'>>>
  onSetSceneType: (idx: number, type: 'static' | 'video') => void
  onPreview: (idx: number) => void
  onSuggestMotion: (idx: number, request: string) => Promise<boolean>
  onReshoot: (idx: number, opts?: { instruction?: string; mode?: 'vary' | 'fresh'; referenceKey?: string; anchor?: 'current-first' | 'reference-first' | 'reference-only' }) => void
  onRequestOptions: (idx: number, referenceKey: string) => Promise<{ observation: string | null; options: GroundedOption[] }>
  onUploadImage: (idx: number, key: string) => void
  history: { assetId: string; url: string }[] // this scene's images oldest→newest (for Undo/Redo)
  onSetSceneImage: (idx: number, assetId: string, url: string) => void
  onSaveText: (idx: number, text: string) => void
  sounds: OperatorCue[]
  soundPreviews: Record<string, string>
  onAddSound: (idx: number, instruction: string) => Promise<string | null>
  onPreviewSound: (cueId: string) => Promise<void>
  onRemoveSound: (cueId: string) => Promise<void>
}) {
  const animating = loading === `animate-${scene.idx}`
  const regenerating = loading === `regen-${scene.idx}`
  // Undo/Redo walk this scene's image history (oldest→newest). histPos = where the current image sits; step
  // back/forward re-points the scene to a neighbouring take for free (no regeneration).
  const histPos = history.findIndex((h) => h.assetId === scene.imageAssetId)
  const canUndo = histPos > 0
  const canRedo = histPos >= 0 && histPos < history.length - 1
  const goUndo = () => { const t = history[histPos - 1]; if (canUndo && t) onSetSceneImage(scene.idx, t.assetId, t.url) }
  const goRedo = () => { const t = history[histPos + 1]; if (canRedo && t) onSetSceneImage(scene.idx, t.assetId, t.url) }
  // The Twist beat badge uses the mood color (a distinct blue on neutral channels, where mood == selection accent).
  const heroTint = /^#9b3bff$/i.test(moodTint) ? '#2FA4FF' : moodTint
  const [changeText, setChangeText] = useState('') // the creator's plain-language change for this scene
  const [motionText, setMotionText] = useState('') // the creator's plain-language MOTION request (video only)
  const [refKey, setRefKey] = useState<string | null>(null) // an attached reference image for the change
  const [busyUpload, setBusyUpload] = useState<false | 'ref' | 'photo'>(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  // Upload an operator image → R2, return its key (or null on failure). Used for both "attach a reference"
  // and "use my photo".
  async function uploadImage(file: File): Promise<string | null> {
    setUploadErr(null)
    const fd = new FormData(); fd.append('reelId', reelId); fd.append('file', file)
    const res = await fetch('/api/pipeline/scene-image-upload', { method: 'POST', body: fd })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.key) { setUploadErr(j?.error ?? 'Upload failed.'); return null }
    return j.key as string
  }
  // AI-grounded feedback dialog — appears ONLY when a reference is attached and the vision model returns
  // options (opt-in, operator-initiated; never on a plain regenerate). Each option's anchor + directive is
  // sent straight to the reshoot, so the operator picks an intent without touching the mechanism.
  const [fbOpen, setFbOpen] = useState(false)
  const [fbLoading, setFbLoading] = useState(false)
  const [fbData, setFbData] = useState<{ observation: string | null; options: GroundedOption[] }>({ observation: null, options: [] })
  const [fbOther, setFbOther] = useState('') // the "Other…" free-text (prefilled with anything the operator typed)
  const clearChange = () => { setChangeText(''); setRefKey(null); setFbOther('') }
  const applyOption = (o: GroundedOption) => {
    if (!refKey) return
    setFbOpen(false)
    // reference-only renders fresh from the attachment (full replace); the others vary the current image.
    onReshoot(scene.idx, { instruction: o.directive, mode: o.anchor === 'reference-only' ? 'fresh' : 'vary', referenceKey: refKey, anchor: o.anchor })
    clearChange()
  }
  const applyOther = () => {
    const text = fbOther.trim()
    if (!text || !refKey) return
    setFbOpen(false)
    onReshoot(scene.idx, { instruction: text, mode: 'vary', referenceKey: refKey })
    clearChange()
  }
  // Per-scene "Add a sound" (manual cue) — targeted SFX or an off-screen spoken line for THIS scene.
  // Collapsed by default (sound is automatic; this is an optional extra) — expands on click.
  const [soundOpen, setSoundOpen] = useState(false)
  const [soundText, setSoundText] = useState('')
  const [addingSound, setAddingSound] = useState(false)
  const [soundError, setSoundError] = useState<string | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const runAddSound = async () => {
    const instruction = soundText.trim()
    if (!instruction || addingSound) return
    setAddingSound(true); setSoundError(null)
    const err = await onAddSound(scene.idx, instruction)
    setAddingSound(false)
    if (err) setSoundError(err); else setSoundText('')
  }
  const runPreviewSound = async (id: string) => { setPreviewingId(id); await onPreviewSound(id); setPreviewingId(null) }

  return (
    // One column, read top-to-bottom in the order you work a scene: what it SAYS → what it LOOKS like →
    // how it MOVES → what it SOUNDS like. The stage beside it shows the scene, so nothing here repeats it.
    <div className="animate-fade-in flex min-h-0 w-full flex-col gap-[18px] p-4 sm:p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <h2 className="mono-label text-[11px]">Scene {String(scene.idx).padStart(2, '0')}</h2>
          {/* Narrative beat — the Twist (story peak) carries the mood accent; the rest are quietly tinted. */}
          <span
            className={`badge ${beat === 'Hook' ? 'bg-info-soft text-info' : beat === 'Twist' ? '' : 'bg-subtle text-muted'}`}
            style={beat === 'Twist' ? { backgroundColor: `${heroTint}1f`, color: heroTint } : undefined}
          >{beat}</span>
        </span>
        {/* How long it runs · what it is at render — the design's inspector slate. */}
        <span className="font-mono text-[11px] tabular-nums text-faint">
          {secs}s · {scene.tier === 'video' ? 'MOTION' : 'STILL'}
        </span>
      </div>
      {/* Narration — the primary text edit; takes the flexible space */}
      <div className="flex min-w-0 flex-col">
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
            rows={3}
            className="block max-h-[24rem] min-h-[6rem] w-full resize-y bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
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
      </div>

      {/* Settings — pick a Format, see the scene's read-only context, then describe any change. */}
      <div className="flex w-full flex-col gap-6">
        {imgSrc && (() => {
          const settings = resolveMotionSettings(scene.motionSettings)
          const isVideoType = scene.tier === 'video'
          const previewCost = `$${(motionCostCents(settings) / 100).toFixed(2)}`
          const runChange = async () => {
            const instruction = changeText.trim()
            if ((!instruction && !refKey) || regenerating || fbLoading) return
            // NO reference → apply the described tweak directly (unchanged behaviour). The assist only ever
            // appears when a reference is attached, so a plain change never sees a dialog.
            if (!refKey) { onReshoot(scene.idx, { instruction, mode: 'vary' }); setChangeText(''); return }
            // Reference attached → ask the vision model how to use it, then let the operator pick. Fail soft:
            // no options (e.g. no current image, or the call failed) → fall back to a plain attach-and-regen.
            setFbLoading(true)
            const r = await onRequestOptions(scene.idx, refKey)
            setFbLoading(false)
            if (r.options.length) {
              setFbData(r); setFbOther(instruction); setFbOpen(true)
            } else {
              onReshoot(scene.idx, { instruction, mode: 'vary', referenceKey: refKey }); clearChange()
            }
          }
          return (
            <>
              {/* IMAGE — the picture, and every way to change it. One composer, not a field with buttons
                  scattered around it: describe the change, optionally attach a reference, send. Under it,
                  the two whole-shot alternatives. TAKES sit in the label row, because that is what the
                  image history IS to a creator — takes of the same shot, free to step between (no
                  regeneration: each one already exists and is already paid for). */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-600 text-ink">Image</p>
                  {/* Take navigation — the design's `[←] take 2/2 [→]`. Hidden until there IS a second take. */}
                  {history.length > 1 && histPos >= 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <button type="button" onClick={goUndo} disabled={!canUndo || regenerating} title="Previous take"
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border-mid bg-surface text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-[#C9C4D6]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
                        <span className="sr-only">Previous take</span>
                      </button>
                      <span className="px-1 font-mono text-[10px] tabular-nums text-faint">take {histPos + 1}/{history.length}</span>
                      <button type="button" onClick={goRedo} disabled={!canRedo || regenerating} title="Next take"
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-border-mid bg-surface text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-[#C9C4D6]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
                        <span className="sr-only">Next take</span>
                      </button>
                    </span>
                  )}
                </div>

                {imageQa && (imageQa.truthBlocked || imageQa.craftIssues.length > 0) && (
                  <div className={`rounded-xl border px-3 py-2.5 ${imageQa.truthBlocked ? 'border-danger/25 bg-danger-soft text-danger' : 'border-warning/25 bg-warning-soft text-warning'}`}>
                    <p className="text-xs font-700">
                      {imageQa.truthBlocked ? 'Verified detail needs fixing' : 'Worth another look'}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed opacity-85">
                      {imageQa.truthBlocked
                        ? 'The final cut is paused until this frame matches the verified details.'
                        : 'This take may not carry the scene clearly.'}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed">
                      {(imageQa.truthBlocked ? imageQa.truthIssues : imageQa.craftIssues).map((issue, index) => (
                        <li key={`${issue}-${index}`}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* The composer. */}
                <div className="overflow-hidden rounded-xl border border-border-mid bg-surface shadow-xs focus-within:border-accent/40">
                  <textarea
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runChange() }}
                    rows={3}
                    disabled={regenerating}
                    placeholder="Describe a change — “lower her hand, warmer light, push in slightly”"
                    aria-label={`Scene ${scene.idx} change`}
                    className="block w-full resize-none bg-transparent px-3 pb-1 pt-3 text-[12.5px] leading-relaxed text-ink placeholder:text-faint focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex items-center gap-2 p-2">
                    {/* Attach a reference image — the model conditions on it, like attaching in chat. */}
                    <label
                      title="Attach a reference image to guide the regeneration"
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[11px] font-600 text-accent-hover transition-colors hover:bg-subtle-strong ${regenerating || busyUpload ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={regenerating || busyUpload !== false}
                        onChange={async (e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return; setBusyUpload('ref'); const k = await uploadImage(f); setBusyUpload(false); if (k) setRefKey(k) }} />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" /></svg>
                      {busyUpload === 'ref' ? 'Uploading…' : refKey ? 'Reference ✓' : 'Reference'}
                    </label>
                    {refKey && (
                      <button type="button" onClick={() => setRefKey(null)} className="text-[11px] text-faint hover:text-ink" aria-label="Remove reference">✕</button>
                    )}
                    <div className="flex-1" />
                    {/* Send. With nothing typed and nothing attached this re-rolls a close variation of the
                        current image — the plain "Reshoot" the button used to be. */}
                    <button
                      type="button"
                      onClick={() => { if (changeText.trim() || refKey) { runChange() } else if (!regenerating) { onReshoot(scene.idx, { mode: 'vary' }) } }}
                      disabled={regenerating || fbLoading}
                      className="btn-primary btn-sm rounded-lg px-3 py-[7px] text-xs font-700 active:scale-[.98] disabled:cursor-wait disabled:opacity-50"
                      title={changeText.trim() || refKey ? 'Apply this change' : 'Re-roll a close variation of this image'}
                    >
                      {fbLoading ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Reading your reference…</>)
                        : regenerating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Reshooting…</>)
                          : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>Regenerate</>)}
                    </button>
                  </div>
                </div>

                {/* The two whole-shot moves: re-imagine it, or hand over your own picture. */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => {
                    const instruction = changeText.trim()
                    if (!regenerating) onReshoot(scene.idx, { mode: 'fresh', ...(instruction ? { instruction } : {}) })
                  }} disabled={regenerating}
                    title="Re-imagine this shot from scratch (a new composition)"
                    className="btn-secondary btn-sm flex-1 rounded-[10px] py-2.5 active:scale-[.98] disabled:cursor-wait disabled:opacity-50">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
                    Fresh take
                  </button>
                  <label
                    title="Use your own picture as this scene’s image — no generation"
                    className={`btn-secondary btn-sm flex-1 cursor-pointer rounded-[10px] py-2.5 ${regenerating || busyUpload ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={regenerating || busyUpload !== false}
                      onChange={async (e) => {
                        const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return
                        setBusyUpload('photo'); const k = await uploadImage(f); setBusyUpload(false); if (k) onUploadImage(scene.idx, k)
                      }} />
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                    {busyUpload === 'photo' ? 'Uploading…' : 'Replace'}
                  </label>
                </div>
                <p className="text-[11px] leading-relaxed text-faint">
                  Regenerate keeps this shot and changes what you describe. Fresh take re-imagines it from scratch.
                </p>
                {uploadErr && <p className="text-[11px] text-negative">{uploadErr}</p>}
              </div>

              {/* MOTION — two cards, side by side: what this scene IS at render. The Motion card expands
                  in place for the movement itself (described in words) and an optional preview. */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-600 text-ink">Motion</p>

                <div className="flex gap-2">
                  {/* Still */}
                  <button
                    type="button"
                    disabled={animating}
                    aria-pressed={!isVideoType}
                    onClick={() => onSetSceneType(scene.idx, 'static')}
                    className={`flex flex-1 items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-left transition-colors disabled:cursor-wait ${!isVideoType ? 'gradient-border' : 'border-border-mid bg-surface hover:border-accent-ring'}`}
                  >
                    <span className={`inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg ${!isVideoType ? 'bg-brand-3 text-white' : 'bg-subtle-strong text-muted'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs ${!isVideoType ? 'font-700' : 'font-600'} text-ink`}>Still</span>
                      <span className="block text-2xs text-faint">Single frame · free</span>
                    </span>
                  </button>

                  {/* Motion — selecting it opens the panel below. */}
                  <button
                    type="button"
                    disabled={animating}
                    aria-pressed={isVideoType}
                    onClick={() => { if (!isVideoType) onSetSceneType(scene.idx, 'video') }}
                    className={`flex flex-1 items-center gap-2.5 rounded-[11px] border px-3 py-2.5 text-left transition-colors disabled:cursor-wait ${isVideoType ? 'gradient-border' : 'border-border-mid bg-surface hover:border-accent-ring'}`}
                  >
                    <span className={`inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg ${isVideoType ? 'bg-pair-purple-pink text-white' : 'bg-subtle-strong text-muted'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m22 8-6 4 6 4V8z" /><rect x="2" y="6" width="14" height="12" rx="2" /></svg>
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs ${isVideoType ? 'font-700' : 'font-600'} text-ink`}>Motion</span>
                      <span className={`block text-2xs ${isVideoType ? 'text-accent' : 'text-faint'}`}>Animated clip · ~{previewCost}</span>
                    </span>
                  </button>
                </div>

                {isVideoType && (
                  <div className="mt-1 flex flex-col gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 p-3">
                    {/* Describe the motion — an LLM turns it into the animation (which subject moves + camera
                        move). The movement analog of the image composer above; clears the old clip so a
                        Preview/render re-rolls with the new motion. Leave blank to keep the auto motion. */}
                    <div className="flex flex-col gap-1.5">
                      <textarea
                        value={motionText}
                        onChange={(e) => setMotionText(e.target.value)}
                        placeholder="Describe the motion — e.g. the figure to her right slowly grins at her as she freezes"
                        className="input h-16 resize-none text-xs"
                        disabled={loading === `motion-${scene.idx}`}
                      />
                      <button
                        type="button"
                        disabled={loading === `motion-${scene.idx}` || !motionText.trim()}
                        onClick={async () => { const ok = await onSuggestMotion(scene.idx, motionText.trim()); if (ok) setMotionText('') }}
                        className="btn-secondary btn-sm w-full active:scale-[.98] disabled:opacity-50"
                      >
                        {loading === `motion-${scene.idx}` ? 'Setting motion…' : 'Set motion'}
                      </button>
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
                        Ready — it’s moving on the stage.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

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

        {/* Add a sound — an OPTIONAL targeted touch for THIS scene, collapsed by default since sound is
            automatic. Click to expand: type plainly for an effect, or put words in quotes for an off-screen
            line. Any sounds already added stay visible below. */}
        <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
          {soundOpen ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Add specific sound effects to this scene</p>
              <p className="-mt-1 text-[11px] leading-relaxed text-faint">Sound is added to your reel automatically. Add a specific one here only if you want it — an effect, or words spoken off-screen.</p>
              <textarea
                value={soundText}
                onChange={(e) => setSoundText(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void runAddSound() }}
                rows={2}
                autoFocus
                disabled={addingSound}
                placeholder="Describe a sound, or put spoken words in quotes"
                aria-label={`Scene ${scene.idx} add sound`}
                className="input resize-y text-xs leading-relaxed disabled:opacity-60"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => void runAddSound()} disabled={addingSound || !soundText.trim()}
                  className="btn-secondary btn-sm flex-1 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
                  {addingSound ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Adding…</>) : 'Add sound'}
                </button>
                <button type="button" onClick={() => { setSoundOpen(false); setSoundText(''); setSoundError(null) }} disabled={addingSound} className="btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
              {soundError && <p className="text-[11px] text-danger">{soundError}</p>}
            </>
          ) : (
            <button type="button" onClick={() => setSoundOpen(true)} className="flex items-center gap-1.5 self-start text-xs font-medium text-muted transition-colors hover:text-ink">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              {sounds.length > 0 ? 'Add another sound effect' : 'Add specific sound effects to this scene'}
            </button>
          )}

          {sounds.length > 0 && (
            <ul className="flex flex-col gap-2 pt-1">
              {sounds.map((cue) => (
                <li key={cue.id} className="flex flex-col gap-1 rounded-lg bg-subtle/50 p-2">
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 text-faint" title={cue.kind === 'speech' ? 'Spoken line' : 'Sound effect'}>
                      {cue.kind === 'speech' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" /></svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">{operatorCueLabel(cue)}</p>
                      <p className="truncate text-[11px] text-faint">plays on “{cue.anchor}”</p>
                    </div>
                    <button type="button" onClick={() => void onRemoveSound(cue.id)} title="Remove" className="flex-shrink-0 text-faint hover:text-danger">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {soundPreviews[cue.id] ? (
                    <audio src={soundPreviews[cue.id]} controls controlsList="nodownload noplaybackrate" preload="none" className="h-8 w-full" />
                  ) : (
                    <button type="button" onClick={() => void runPreviewSound(cue.id)} disabled={previewingId === cue.id}
                      className="flex items-center gap-1.5 self-start text-[11px] font-medium text-accent hover:underline disabled:opacity-50">
                      {previewingId === cue.id ? (
                        <><span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/40 border-t-transparent" />Generating…</>
                      ) : (
                        <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>Preview</>
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

      {/* AI-grounded feedback — how to use the attached reference. Portaled to <body> so a transformed
          ancestor can't trap this `fixed` overlay. Shown only when a reference is attached AND the vision
          model returned options. */}
      {fbOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => setFbOpen(false)}>
          <div className="card animate-fade-in w-full max-w-md p-5 text-left" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-ink">How should I use your reference?</h3>
            <div className="mt-3 flex gap-2">
              {imgSrc && <div className="flex-1"><img src={imgSrc} alt="Current scene" className="h-20 w-full rounded-lg border border-border object-cover" /><p className="mt-1 text-[10px] uppercase tracking-wide text-faint">Current</p></div>}
              {refKey && <div className="flex-1"><img src={`/api/asset?key=${encodeURIComponent(refKey)}`} alt="Your reference" className="h-20 w-full rounded-lg border border-dashed border-border object-cover" /><p className="mt-1 text-[10px] uppercase tracking-wide text-faint">📎 Reference</p></div>}
            </div>
            {fbData.observation && <p className="mt-3 rounded-lg bg-surface p-2.5 text-[11px] leading-relaxed text-muted">{fbData.observation}</p>}
            <div className="mt-3 flex flex-col gap-1.5">
              {fbData.options.map((o, i) => (
                <button key={i} type="button" onClick={() => applyOption(o)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong hover:text-ink">
                  <span className="block text-xs font-semibold text-ink">{o.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{o.description}</span>
                </button>
              ))}
              {/* Other — free text, always available (the escape hatch). */}
              <div className="rounded-lg border border-dashed border-border px-3 py-2">
                <label className="block text-xs font-semibold text-ink" htmlFor={`fb-other-${scene.idx}`}>Other…</label>
                <input id={`fb-other-${scene.idx}`} value={fbOther} onChange={(e) => setFbOther(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyOther() }}
                  placeholder="Describe the change in your own words…" className="input mt-1.5 w-full text-xs" />
                <button type="button" onClick={applyOther} disabled={!fbOther.trim()} className="btn-secondary btn-sm mt-2 w-full disabled:opacity-50">Apply</button>
              </div>
            </div>
            <button type="button" onClick={() => setFbOpen(false)} className="btn-ghost btn-sm mt-3 w-full">Cancel</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function VoicePicker({ voices, recommended, loadingVoices, voicesError, onRetry, selected, storyFirstLine, voiceSettings, onSelect, onClose }: {
  voices: PickerVoice[]
  recommended: boolean
  loadingVoices: boolean
  voicesError: string | null
  onRetry: () => void
  selected: string
  storyFirstLine: string
  voiceSettings: VoiceSettings // previews play at the auto-derived delivery (no manual editing anywhere)
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

        {/* Delivery (pace / expressiveness / steadiness) lives in the footer's Delivery control — the
            previews below play at the current delivery. Kept out of here to avoid a duplicate editor. */}

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
