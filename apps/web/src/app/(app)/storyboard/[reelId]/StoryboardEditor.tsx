'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { scenes, stories } from '@reels/db'
import type { ChannelVoice, VoiceSettings, OperatorCue } from '@reels/core'
import { resolveMotionSettings, motionCostCents, operatorCueLabel, VIDEO_EFFECTS, MUSIC_MOODS, MUSIC_MOOD_OPTIONS, type MusicMood, DELIVERY_PRESETS, DELIVERY_PRESET_OPTIONS, applyDeliveryPreset, matchDeliveryPreset, type DeliveryPreset } from '@reels/core'
import { GenreLoader } from '@/components/GenreLoader'
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
  // Every image ever generated per scene, oldest→newest — powers Undo/Redo (walk back to a prior take for free).
  sceneImageHistory: Record<number, { assetId: string; url: string }[]>
  sceneVideoVariations: Record<number, string[]>
  renderUrl: string | null
  musicMood: string | null // this reel's background-music mood override (MusicMood); null = inherit the channel default
  channelMusicMood: string | null // the channel's default mood (MusicMood), shown as the "inherit" option
  aiMusic: boolean // channel composes its bed per-reel (musicMode='ai') → the mood dropdown steers it
  musicMode: string // the channel's music mode from creation: 'ai' | 'preset' | 'upload' | 'none'
  channelMusicTracks: { label: string; url: string }[] // preset/upload beds — shown read-only with a preview
  musicUploadUrl: string | null // per-reel operator-uploaded bed; when set it overrides the channel's music
  initialVideoEffects: string[] | null // per-reel video effects; null = auto (planned from the story)
  initialSoundNotes: string // auto-drafted reel-level smart audio plan (read-only display)
  initialOperatorSfx: OperatorCue[] // operator-added per-scene manual cues
  initialVoiceSettings: VoiceSettings // starting point for the delivery sliders
  voiceSettingsOverridden: boolean // reel already has a saved manual override
  channelName: string
  genreCategory: string // horror | informational | lifestyle | general — picks the loader glyph
  moodTint: string // channel-mood accent (dark=red / warm=amber / neutral=midnight) for ambient touches
  failure: { step: string; error: string } | null
}

export function StoryboardEditor({
  reel, story, scenes: initialScenes, voicePool, voiceRecommend,
  sceneImages, sceneImageHistory, sceneVideoVariations, renderUrl: initialRenderUrl, musicMood: initialMusicMood, channelMusicMood, aiMusic, musicMode, channelMusicTracks, musicUploadUrl: initialMusicUploadUrl,
  initialVideoEffects, initialSoundNotes, initialOperatorSfx, initialVoiceSettings, voiceSettingsOverridden,
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
  const [deliveryOpen, setDeliveryOpen] = useState(false) // footer delivery preset popover
  // Custom hand-tune escape hatch — auto-open the sliders if the reel loads with an off-preset override.
  const [showCustomDelivery, setShowCustomDelivery] = useState(() => voiceSettingsOverridden && !matchDeliveryPreset(initialVoiceSettings))
  const setDelivery = (patch: Partial<VoiceSettings>) => { setVoiceSettings((s) => ({ ...s, ...patch })); setVoiceTouched(true) }

  // Persist voice + delivery as they change, so they survive a reload without a render (they used to be
  // sent only at render time). A ref mirrors the latest settings for the on-release preview below.
  const voiceSettingsRef = useRef(voiceSettings)
  voiceSettingsRef.current = voiceSettings
  function saveVoice(patch: { voiceId?: string; voiceSettings?: VoiceSettings | null }) {
    return fetch('/api/pipeline/set-voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId: reel.id, ...patch }),
    }).catch(() => {})
  }
  // Debounced persist of delivery edits (skips the first run so an already-overridden reel doesn't re-save
  // on load). Reset clears the override explicitly (saveVoice({ voiceSettings: null })), handled at its button.
  const deliverySaveInit = useRef(true)
  useEffect(() => {
    if (deliverySaveInit.current) { deliverySaveInit.current = false; return }
    if (!voiceTouched) return
    const t = setTimeout(() => { void saveVoice({ voiceSettings }) }, 500)
    return () => clearTimeout(t)
  }, [voiceSettings, voiceTouched])

  // Hear the current delivery instantly, fired when a footer slider is released (onCommit). Uses the
  // selected voice + the latest settings (via ref, so it isn't stale from the drag's last onChange).
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null)
  const voicePreviewCache = useRef<Map<string, string>>(new Map()) // voice+settings → object URL; replays are free
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false)
  // Pass the target settings explicitly on preset-click (state/ref aren't updated yet within the handler);
  // falls back to the live ref for any deferred caller.
  async function previewDelivery(settings?: VoiceSettings) {
    if (!selectedVoice) return
    const vs = settings ?? voiceSettingsRef.current
    const el = voicePreviewRef.current ?? (voicePreviewRef.current = new Audio())
    const key = `${selectedVoice}|${vs.speed}|${vs.style}|${vs.stability}`
    const play = (url: string) => { el.pause(); el.src = url; void el.play().catch(() => {}) }
    const cached = voicePreviewCache.current.get(key)
    if (cached) { play(cached); return }
    setVoicePreviewLoading(true)
    try {
      const text = (story?.body.split('\n')[0] || 'Ito ang boses para sa reel mo.').slice(0, 120)
      const res = await fetch('/api/pipeline/preview-voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selectedVoice, text, voiceSettings: vs }),
      })
      if (!res.ok) return
      const url = URL.createObjectURL(await res.blob())
      voicePreviewCache.current.set(key, url)
      play(url)
    } finally {
      setVoicePreviewLoading(false)
    }
  }
  // Delivery presets (mirror the music-mood dropdown): Auto + named presets, single-select, preview on pick.
  const isAutoDelivery = !voiceTouched
  const activeDelivery = voiceTouched ? matchDeliveryPreset(voiceSettings) : null
  const pickDeliveryPreset = (preset: DeliveryPreset) => {
    const next = applyDeliveryPreset(voiceSettings, preset)
    setVoiceSettings(next); setVoiceTouched(true)
    void previewDelivery(next) // debounced persist handled by the voiceSettings effect
  }
  const pickAutoDelivery = () => {
    setVoiceSettings(initialVoiceSettings); setVoiceTouched(false)
    void saveVoice({ voiceSettings: null })
    void previewDelivery(initialVoiceSettings)
  }
  const [renderUrl] = useState(initialRenderUrl)
  // Smart sound design — the reel-level audio plan. Auto-drafted in the BACKGROUND (not shown in the UI);
  // realized into placed audio at render. The narration is never touched.
  const [soundNotes, setSoundNotes] = useState(initialSoundNotes)
  const soundEnrichedRef = useRef(false)
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

  // Regenerate a scene's image. `mode` picks the behaviour:
  //   'vary'  (default) — condition on the CURRENT image (+ face plates) so it stays close: fix a hand, small
  //                       variation. An optional `instruction` ("lower the hand") steers the tweak.
  //   'fresh' — ignore the current image; re-roll a brand-new composition (plates only → faces still match).
  // The plain "Regenerate" button sends 'vary' with no instruction; "Fresh take" sends 'fresh'.
  async function handleRegenImage(sceneIdx: number, opts?: { instruction?: string; mode?: 'vary' | 'fresh'; referenceKey?: string }) {
    setLoading(`regen-${sceneIdx}`)
    const res = await fetch('/api/pipeline/regen-image', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, sceneIdx, instruction: opts?.instruction?.trim() || undefined, mode: opts?.mode ?? 'vary', referenceKey: opts?.referenceKey }),
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
      toast(`Updated that character everywhere. Scene${affected.length > 1 ? 's' : ''} ${[...affected].sort((a, b) => a - b).join(', ')} also use her — regenerate to match.`, 'info')
    }
    // A new image supersedes any Undo/Redo override — drop it so the fresh server image wins.
    setImageOverride((o) => { if (!(sceneIdx in o)) return o; const n = { ...o }; delete n[sceneIdx]; return n })
    // Force the <img> to re-fetch the (overwritten) scene image NOW — independent of whether
    // router.refresh() manages to push a fresh asset-id ?v= through the client router cache. Clear this
    // scene's loaded flag so the develop-in reveal plays for the fresh image instead of holding the stale
    // one. A new image also invalidates any motion (the clip was animated off the old image): the route
    // reset the scene to a still, so reflect that locally too.
    setImageBust((b) => ({ ...b, [sceneIdx]: (b[sceneIdx] ?? 0) + 1 }))
    setLoadedMedia((s) => { const n = new Set(s); n.delete(sceneIdx); return n })
    setScenes((prev) => prev.map((s) => (s.idx === sceneIdx ? { ...s, tier: 'still' } : s)))
    setLoading(null)
    router.refresh()
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
  // ── Smart sound design (background) ─────────────────────────────────────────
  // Silently draft the reel-level audio-direction notes once on load so they're ready for the render-time
  // interpreter. Not surfaced in the UI; the operator's per-scene cues are the visible control.
  useEffect(() => {
    if (soundEnrichedRef.current || soundNotes.trim() || reel.status !== 'storyboard') return
    soundEnrichedRef.current = true
    let retried = false
    const draft = () =>
      fetch('/api/pipeline/enrich-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: reel.id, force: false }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((json) => { if (json && typeof json.notes === 'string') setSoundNotes(json.notes) })
        .catch(() => {
          // The draft is a background nicety, but a single transient 502 used to leave the field empty
          // for the whole session (the ref above blocks re-runs). Retry once after a short delay so a
          // blip self-heals; if it still fails, the field just fills on the next storyboard open.
          if (retried) return
          retried = true
          setTimeout(draft, 4000)
        })
    void draft()
  }, [soundNotes, reel.status])

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
  const canRender = isRenderable && !!selectedVoice
  // Post-render gates (spot-check → approved → published) get their own action bar, not the voice/render one.
  const isPostRender = ['spot_check', 'approved', 'scheduled', 'published'].includes(reel.status)

  // Live build/render progress: scenes/images still generating (status='storyboard' before they land), or
  // the render chain running. Poll while active — the hook refreshes the server so images + status update.
  const imagesReady = scenes.length > 0 && scenes.every((s) => sceneImages[s.idx])
  const showProgress = (reel.status === 'storyboard' && !imagesReady) || reel.status === 'rendering' || reel.status === 'render_qa'
  // Keep watching for image changes through the WHOLE storyboard editing phase, not just the initial
  // build: a reshoot or an out-of-band re-render swaps an image after imagesReady is already true, and
  // without a live watch the operator would have to manually reload to see it. Poll fast while actively
  // building/rendering, slow (every 6s) once everything's landed — the hook only refreshes when an image
  // actually changes, so the slow idle poll is cheap.
  const watching = showProgress || reel.status === 'storyboard'
  const live = usePipelineStatus(reel.id, { enabled: watching, scenes: true, intervalMs: showProgress ? 2200 : 6000 })
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

  // The selected scene's editor (or a fallback) — shared between the strip + grid layouts below
  const twistIdx = storyTwistIdx(scenes, story?.twistAnchor)
  const detail = selectedScene ? (
    <SceneInspector
      key={selectedScene.idx}
      scene={selectedScene}
      beat={sceneBeat(selectedScene.idx, scenes.length, twistIdx)}
      imgSrc={bustedImages[selectedScene.idx]}
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
  ) : (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 px-8 py-16 text-center text-sm text-muted">
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

  // Background-music mood — a footer pill + popover (mirrors the video-effects picker). Single-select: pick
  // a mood or inherit the channel default. No bed is generated here; the choice steers generate_music at
  // render. AI-music channels only (preset/upload/none source their bed elsewhere).
  const channelMoodLabel =
    channelMusicMood && (channelMusicMood in MUSIC_MOODS)
      ? MUSIC_MOODS[channelMusicMood as MusicMood].label
      : null
  const isDefaultMood = musicMood === null
  const activeMoodLabel = !isDefaultMood && (musicMood in MUSIC_MOODS) ? MUSIC_MOODS[musicMood as MusicMood].label : null
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
    <div className="relative flex items-center rounded-lg border border-border bg-subtle/40">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle ${musicOpen ? 'text-ink' : 'text-muted'}`}
        title="Your uploaded music bed for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent">Custom</span>
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
    <div className="relative flex items-center rounded-lg border border-border bg-subtle/40">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle ${musicOpen ? 'text-ink' : 'text-muted'}`}
        title="Background music mood for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isDefaultMood ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
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
    <div className="relative flex items-center rounded-lg border border-border bg-subtle/40">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle ${musicOpen ? 'text-ink' : 'text-muted'}`}
        title="Background music for this channel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
        Music
        <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted">
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
    <div className="relative flex items-center rounded-lg border border-border bg-subtle/40">
      <button
        onClick={() => setMusicOpen((o) => !o)}
        aria-expanded={musicOpen}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle ${musicOpen ? 'text-ink' : 'text-muted'}`}
        title="Background music for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-faint" aria-hidden>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><line x1="3" y1="3" x2="21" y2="21" />
        </svg>
        Music
        <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-faint">Off</span>
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
    <div className="relative flex items-center rounded-lg border border-border bg-subtle/40">
      <button
        onClick={() => setEffectsOpen((o) => !o)}
        aria-expanded={effectsOpen}
        className={`flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle ${effectsOpen ? 'text-ink' : 'text-muted'}`}
        title="Video effects for this reel"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" />
        </svg>
        Effects
        <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isAuto ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
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
            className={`flex h-11 flex-shrink-0 items-center gap-1.5 rounded-r-lg px-2.5 text-xs font-medium transition-colors hover:bg-subtle hover:text-ink ${deliveryOpen ? 'text-ink' : 'text-muted'}`}
            title="Narrator delivery"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${isAutoDelivery ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
              {isAutoDelivery ? 'Auto' : activeDelivery ? DELIVERY_PRESETS[activeDelivery].label : 'Custom'}
            </span>
          </button>

          {/* Delivery preset popover — mirrors the music-mood dropdown: Auto + named presets, single-select. */}
          {deliveryOpen && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border-strong bg-surface p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Narrator delivery</p>
              </div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-faint">
                {voicePreviewLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted/50 border-t-transparent" aria-hidden />}
                {selectedVoice ? 'How the narrator performs. Tap to hear it.' : 'Pick a voice first to hear delivery.'}
              </p>
              <div className="flex flex-col gap-1.5">
                {/* Auto — per-story auto-tuning (mirrors the music "Channel default" row). */}
                <button
                  type="button"
                  onClick={pickAutoDelivery}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${isAutoDelivery ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
                >
                  <span>
                    <span className="block text-xs font-medium text-ink">Auto</span>
                    <span className="block text-[11px] text-faint">Tuned to each story’s mood</span>
                  </span>
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${isAutoDelivery ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                    {isAutoDelivery && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                </button>
                {DELIVERY_PRESET_OPTIONS.map((d) => {
                  const on = activeDelivery === d.value
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => pickDeliveryPreset(d.value)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
                    >
                      <span>
                        <span className="block text-xs font-medium text-ink">{d.label}</span>
                        <span className="block text-[11px] text-faint">{d.hint}</span>
                      </span>
                      <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${on ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                        {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                      </span>
                    </button>
                  )
                })}
                {/* Custom — hand-tune escape hatch: reveals the raw sliders. Active when overridden off-preset. */}
                {(() => {
                  const isCustom = voiceTouched && !activeDelivery
                  return (
                    <button
                      type="button"
                      onClick={() => setShowCustomDelivery((s) => !s)}
                      aria-expanded={showCustomDelivery}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${isCustom ? 'border-accent bg-accent-soft' : 'border-border hover:bg-subtle'}`}
                    >
                      <span>
                        <span className="block text-xs font-medium text-ink">Custom…</span>
                        <span className="block text-[11px] text-faint">Hand-tune pace, expressiveness, steadiness</span>
                      </span>
                      {isCustom ? (
                        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-white">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 text-faint ${showCustomDelivery ? 'rotate-180' : ''}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                      )}
                    </button>
                  )
                })()}
                {showCustomDelivery && (
                  <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-subtle/40 p-3">
                    <DeliverySlider label="Pace" lo="Slower" hi="Faster" min={0.7} max={1.15} step={0.01} value={voiceSettings.speed} onChange={(v) => setDelivery({ speed: v })} onCommit={() => void previewDelivery()} />
                    <DeliverySlider label="Expressiveness" lo="Subtle" hi="Dramatic" min={0} max={0.6} step={0.05} value={voiceSettings.style} onChange={(v) => setDelivery({ style: v })} onCommit={() => void previewDelivery()} />
                    <DeliverySlider label="Steadiness" lo="Varied" hi="Steady" min={0.2} max={0.85} step={0.05} value={voiceSettings.stability} onChange={(v) => setDelivery({ stability: v })} onCommit={() => void previewDelivery()} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {musicControl}
        {effectsControl}
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
          onSelect={(id) => { setSelectedVoice(id); void saveVoice({ voiceId: id }); setShowVoicePicker(false) }}
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
  scene, imgSrc, videoKey, showVideo, playVideo, loaded, onLoaded, onDuration, regenerating, animating, compactOnShrink, frameClass, frameStyle, adaptAspect, frameAspect, contain, children,
}: {
  scene: Scene; imgSrc?: string | undefined; videoKey?: string | undefined; showVideo: boolean; playVideo: boolean
  loaded: boolean; onLoaded: () => void; onDuration?: ((secs: number) => void) | undefined
  regenerating: boolean; animating: boolean
  // In the strip rail the tile collapses to a slim filmstrip (--shrink → 1); when set, the busy-overlay
  // caption collapses away with it so the tiny tile shows just the spinner, not cramped text.
  compactOnShrink?: boolean
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
          {/* Caption collapses out as the rail shrinks — a slim filmstrip tile has no room for it, just the spinner. */}
          <span
            className="overflow-hidden"
            style={compactOnShrink ? { maxHeight: 'calc(1.25rem * (1 - var(--shrink, 0)))', opacity: 'calc(1 - var(--shrink, 0))' } : undefined}
          >Reshooting…</span>
        </div>
      )}
      {/* Animate overlay — long op, set a gentle expectation */}
      {animating && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-ink/45 px-3 text-center text-xs font-medium text-white backdrop-blur-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          {/* Caption + sub-line collapse out as the rail shrinks — a slim filmstrip tile has no room, just the spinner. */}
          <span
            className="flex flex-col items-center gap-1 overflow-hidden"
            style={compactOnShrink ? { maxHeight: 'calc(2.75rem * (1 - var(--shrink, 0)))', opacity: 'calc(1 - var(--shrink, 0))' } : undefined}
          >
            Bringing this scene to life…
            <span className="text-[10px] font-normal text-white/70">takes about a minute</span>
          </span>
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
          compactOnShrink={isStrip}
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
  sceneSaving, setScenes, setSceneSaving, onSetSceneType, onPreview, onReshoot, onUploadImage, history, onSetSceneImage, onSaveText,
  sounds, soundPreviews, onAddSound, onPreviewSound, onRemoveSound,
}: {
  scene: Scene; beat: 'Hook' | 'Build-up' | 'Twist' | 'Payoff'; imgSrc?: string | undefined; variations: string[]; activeVar: number
  setActiveVar: React.Dispatch<React.SetStateAction<Record<number, number>>>
  loaded: boolean; markLoaded: (idx: number) => void; loading: string | null; moodTint: string
  sceneSaving: 'saving' | 'saved' | undefined
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>
  setSceneSaving: React.Dispatch<React.SetStateAction<Record<number, 'saving' | 'saved'>>>
  onSetSceneType: (idx: number, type: 'static' | 'video') => void
  onPreview: (idx: number) => void
  onReshoot: (idx: number, opts?: { instruction?: string; mode?: 'vary' | 'fresh'; referenceKey?: string }) => void
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
  const isVideo = scene.tier === 'video'
  const videoKey = variations[activeVar]
  const showVideo = isVideo && Boolean(videoKey)
  const animating = loading === `animate-${scene.idx}`
  const regenerating = loading === `regen-${scene.idx}`
  // Undo/Redo walk this scene's image history (oldest→newest). histPos = where the current image sits; step
  // back/forward re-points the scene to a neighbouring take for free (no regeneration).
  const histPos = history.findIndex((h) => h.assetId === scene.imageAssetId)
  const canUndo = histPos > 0
  const canRedo = histPos >= 0 && histPos < history.length - 1
  const goUndo = () => { const t = history[histPos - 1]; if (canUndo && t) onSetSceneImage(scene.idx, t.assetId, t.url) }
  const goRedo = () => { const t = history[histPos + 1]; if (canRedo && t) onSetSceneImage(scene.idx, t.assetId, t.url) }
  // Actual clip length, read from the playing preview's metadata (state resets per scene via the key prop).
  const [clipSecs, setClipSecs] = useState<number | null>(null)
  // The Twist beat badge uses the mood color (distinct indigo on neutral channels, where mood == selection accent).
  const heroTint = /^#1a1a2e$/i.test(moodTint) ? '#5E6AD2' : moodTint
  const [showFull, setShowFull] = useState(false) // large preview lightbox
  const [fullLoaded, setFullLoaded] = useState(false) // lightbox media has loaded
  const [lightboxAspect, setLightboxAspect] = useState<string | null>(null) // real aspect of the open media
  const [changeText, setChangeText] = useState('') // the creator's plain-language change for this scene
  const [refKey, setRefKey] = useState<string | null>(null) // an attached reference image for the change
  const [busyUpload, setBusyUpload] = useState<false | 'ref' | 'photo'>(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  // Upload an operator image → R2, return its key (or null on failure). Used for both "attach a reference"
  // and "use my photo".
  async function uploadImage(file: File): Promise<string | null> {
    setUploadErr(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/pipeline/scene-image-upload', { method: 'POST', body: fd })
    const j = await res.json().catch(() => null)
    if (!res.ok || !j?.key) { setUploadErr(j?.error ?? 'Upload failed.'); return null }
    return j.key as string
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
      </div>

      {/* Settings — pick a Format, see the scene's read-only context, then describe any change. */}
      <div className="order-2 flex w-full flex-shrink-0 flex-col gap-6 lg:w-72">
        {imgSrc && (() => {
          const settings = resolveMotionSettings(scene.motionSettings)
          const isVideoType = scene.tier === 'video'
          const previewCost = `$${(motionCostCents(settings) / 100).toFixed(2)}`
          const runChange = () => {
            const instruction = changeText.trim()
            if ((!instruction && !refKey) || regenerating) return
            // A described tweak varies the CURRENT image so only what you asked for changes; an attached
            // reference image is passed alongside for the model to condition on ("make it like this").
            onReshoot(scene.idx, { instruction, mode: 'vary', ...(refKey ? { referenceKey: refKey } : {}) })
            setChangeText(''); setRefKey(null)
          }
          return (
            <>
              {/* Format — two selectable rows. The Video row expands IN PLACE to reveal its preview. */}
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
                    onClick={() => { if (!isVideoType) onSetSceneType(scene.idx, 'video') }}
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

              {/* Regenerate — the hero surface (stronger border + shadow), the action reached for most.
                  Regenerate re-rolls a close variation of the current image (fix a small thing); Fresh take
                  re-imagines the shot from scratch; the field applies a described tweak. Undo/Redo step through
                  every take generated for this scene (free — no regeneration). */}
              <div className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Regenerate</p>
                  {/* Undo / Redo — walk this scene's image history. Position shown when there's more than one take. */}
                  <div className="inline-flex items-center gap-1">
                    {history.length > 1 && histPos >= 0 && (
                      <span className="mr-1 text-[10px] tabular-nums text-faint">{histPos + 1}/{history.length}</span>
                    )}
                    <button type="button" onClick={goUndo} disabled={!canUndo || regenerating} title="Undo — previous take"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" /></svg>
                      <span className="sr-only">Undo</span>
                    </button>
                    <button type="button" onClick={goRedo} disabled={!canRedo || regenerating} title="Redo — next take"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h6" /></svg>
                      <span className="sr-only">Redo</span>
                    </button>
                  </div>
                </div>

                {/* One-click re-roll (varies the current image) + a from-scratch alternative. */}
                <div className="flex gap-2">
                  <button type="button" onClick={() => { if (!regenerating) onReshoot(scene.idx, { mode: 'vary' }) }} disabled={regenerating}
                    className="btn-accent btn-sm flex-1 active:scale-[.98] disabled:cursor-wait disabled:opacity-50">
                    {regenerating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Regenerating…</>) : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>Regenerate</>)}
                  </button>
                  <button type="button" onClick={() => { if (!regenerating) onReshoot(scene.idx, { mode: 'fresh' }) }} disabled={regenerating}
                    title="Re-imagine this shot from scratch (new composition)"
                    className="btn-secondary btn-sm active:scale-[.98] disabled:cursor-wait disabled:opacity-50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z" /></svg>
                    Fresh take
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-faint">Regenerate keeps it close — fixes a small thing. Fresh take re-imagines the whole shot.</p>

                {/* Or describe a specific change (also anchored to the current image). */}
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <textarea
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runChange() }}
                    rows={2}
                    disabled={regenerating}
                    placeholder="Or describe a change — e.g. “lower her hand”…"
                    aria-label={`Scene ${scene.idx} change`}
                    className="input resize-y text-xs leading-relaxed disabled:opacity-60"
                  />
                  {/* Attach a reference image for the change — the model conditions on it, like attaching in chat. */}
                  <div className="flex items-center gap-2">
                    <label className={`btn-secondary btn-sm cursor-pointer ${regenerating || busyUpload ? 'pointer-events-none opacity-50' : ''}`}>
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={regenerating || busyUpload !== false}
                        onChange={async (e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return; setBusyUpload('ref'); const k = await uploadImage(f); setBusyUpload(false); if (k) setRefKey(k) }} />
                      {busyUpload === 'ref' ? 'Uploading…' : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>Attach reference</>)}
                    </label>
                    {refKey && <span className="flex items-center gap-1 text-[11px] text-positive">reference attached<button type="button" onClick={() => setRefKey(null)} className="text-faint hover:text-ink" aria-label="Remove reference">✕</button></span>}
                  </div>
                  <button type="button" onClick={runChange} disabled={regenerating || (!changeText.trim() && !refKey)} className="btn-secondary btn-sm w-full active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50">
                    {regenerating ? (<><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Applying…</>) : 'Apply change'}
                  </button>
                </div>

                {/* Upload your own image to use directly AS this scene's image (no generation). */}
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <label className={`btn-ghost btn-sm cursor-pointer ${regenerating || busyUpload ? 'pointer-events-none opacity-50' : ''}`}>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={regenerating || busyUpload !== false}
                      onChange={async (e) => {
                        const f = e.target.files?.[0]; e.currentTarget.value = ''; if (!f) return
                        setBusyUpload('photo'); const k = await uploadImage(f); setBusyUpload(false); if (k) onUploadImage(scene.idx, k)
                      }} />
                    {busyUpload === 'photo' ? 'Uploading…' : (<><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>Upload image for this scene</>)}
                  </label>
                  <span className="text-[11px] leading-relaxed text-faint">Use your own picture as this scene’s image — no generation.</span>
                </div>
                {uploadErr && <p className="text-[11px] text-negative">{uploadErr}</p>}
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

function VoicePicker({ voices, recommended, loadingVoices, voicesError, onRetry, selected, storyFirstLine, voiceSettings, onSelect, onClose }: {
  voices: PickerVoice[]
  recommended: boolean
  loadingVoices: boolean
  voicesError: string | null
  onRetry: () => void
  selected: string
  storyFirstLine: string
  voiceSettings: VoiceSettings // previews play at the current delivery (edited in the footer, not here)
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

// A single delivery axis (pace / expressiveness / steadiness) — used only by the Custom hand-tune escape
// hatch in the delivery popover. onCommit fires on release so we preview once, not on every drag frame.
function DeliverySlider({ label, lo, hi, min, max, step, value, onChange, onCommit }: {
  label: string; lo: string; hi: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; onCommit?: () => void
}) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-ink">{label}</p>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit} onKeyUp={onCommit}
        className="w-full accent-accent"
      />
      <div className="flex justify-between text-[10px] text-faint"><span>{lo}</span><span>{hi}</span></div>
    </div>
  )
}
