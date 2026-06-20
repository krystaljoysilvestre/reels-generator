'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NICHE_PRESETS } from './niche-presets'
import { SUPPORTED_LANGUAGES } from './languages'
import { Dropdown } from '@/components/Dropdown'
import { avatarGradient, avatarInitials } from '@/components/ChannelAvatar'
import { CaptionPreview } from '@/components/CaptionPreview'
import { PlatformPicker } from '@/components/PlatformPicker'
import { type CaptionPreset, type CaptionStyle, type TargetPlatform, type AudioMood, resolveCaptionStyle, CaptionStyleSchema, PLATFORM_PRESETS, PRESET_BEDS, rankPresets } from '@reels/core'

// v2: caption persistence changed from preset+highlight to a resolved captionStyle object.
// Bumping the key drops pre-v2 drafts (which would otherwise fall back to the default
// caption look) instead of half-restoring them.
const DRAFT_KEY = 'reels:new-channel-draft:v2'

type Phase = 'describe' | 'script' | 'voice' | 'sound' | 'visual'
const PHASE_ORDER: Phase[] = ['describe', 'script', 'voice', 'sound', 'visual']
const STEP_SUBTITLE: Record<Phase, string> = {
  describe: 'Step 1 · Describe the channel',
  script: 'Step 2 · Teach the channel\'s voice',
  voice: 'Step 3 · Narrator voice',
  sound: 'Step 4 · Sound',
  visual: 'Step 5 · Visual style',
}

// After the API's own timeout + retries, a transient failure surfaces here —
// show a clear "try again" instead of a raw SDK message.
function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : fallback
  return /connection|timeout|timed out|network|fetch failed|502|ECONN/i.test(msg)
    ? 'Couldn’t reach the AI service — please try again.'
    : msg
}

const TONE_KEYS = ['intensity', 'warmth', 'energy', 'pacing', 'humor'] as const

// Caption-style presets shown in Step 4. `preset` matches core's CaptionPreset.
const CAPTION_OPTIONS: { preset: CaptionPreset; label: string; vibe: string }[] = [
  { preset: 'pop', label: 'Pop', vibe: 'Punchy word-by-word — lifestyle, vlog, food' },
  { preset: 'hype', label: 'Hype', vibe: 'Highlight-box hustle — business, money, motivation' },
  { preset: 'karaoke', label: 'Karaoke', vibe: 'Words fill as spoken — music, poetry' },
  { preset: 'neon', label: 'Neon', vibe: 'Glowing pop — gaming, tech, nightlife' },
  { preset: 'whisper', label: 'Whisper', vibe: 'Eerie typewriter — horror, mystery, true-crime' },
  { preset: 'impact', label: 'Impact', vibe: 'Huge punch-in — sports, drama, hot-takes' },
  { preset: 'elegant', label: 'Elegant', vibe: 'Wide-tracked fade — luxury, beauty, ASMR' },
  { preset: 'clean', label: 'Clean', vibe: 'Refined white — explainer, documentary' },
  { preset: 'comic', label: 'Comic', vibe: 'Playful tilted pop — comedy, memes, reactions' },
  { preset: 'terminal', label: 'Terminal', vibe: 'Green mono typewriter — tech, coding, crypto' },
  { preset: 'cinematic', label: 'Cinematic', vibe: 'Subtitle bar — film, storytelling, video essays' },
  { preset: 'breaking', label: 'Breaking', vibe: 'News lower-third — news, sports, gossip' },
  { preset: 'marker', label: 'Marker', vibe: 'Highlighter swipe — study, tips, how-to' },
  { preset: 'script', label: 'Script', vibe: 'Handwritten cursive — faith, quotes, wellness' },
  { preset: 'retro', label: 'Retro', vibe: 'Chrome/synthwave glow — retro, 80s, music' },
  { preset: 'glitch', label: 'Glitch', vibe: 'RGB datamosh — gaming, cyber, edits' },
]
type ToneKey = (typeof TONE_KEYS)[number]
type Tone = Record<ToneKey, number>

// A real ElevenLabs voice from /api/voices
interface VoiceOption {
  id: string
  name: string
  gender: string
  description: string
  accent: string
  previewUrl: string
}
// What we store on the channel
interface ChannelVoice {
  providerId: string
  name: string
  gender: string
  description: string
}
type VoiceMode = 'single' | 'per_story'

interface Derived {
  tagline: string
  toneConfig: Tone
  targetSeconds: number
  captionPreset: CaptionPreset
  captionHighlight: string
  captionTextColor: string
  captionPosition: 'bottom' | 'center' | 'top'
  captionFontScale: number
  stylePreset: string
  worldBible: {
    region: string
    era: string
    canonLocations: string[]
    canonObjects: string[]
    vocabulary: Record<string, string>
  }
  voiceSearchKeyword: string
  audioMood: AudioMood
}

// One proposed visual "look": friendly label + plain-English blurb (shown) +
// technical DNA (hidden, used for image gen / stored as the channel's stylePreset).
interface StyleOption {
  label: string
  description: string
  stylePreset: string
}
interface StyleProposals {
  sampleScene: string
  styles: StyleOption[]
}
// Per-card preview lifecycle. Only one of imageKey/error is set at a time.
interface PreviewState {
  loading?: boolean
  imageKey?: string
  error?: string
  errorKind?: 'filtered' | 'transient'
}

export function NewChannelWizard() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('describe')

  // ── describe inputs ──
  const [name, setName] = useState('')
  const [committedName, setCommittedName] = useState('') // drives avatar color; updated on blur to avoid per-keystroke flicker
  const [description, setDescription] = useState('')
  const [niche, setNiche] = useState('')
  const [languages, setLanguages] = useState<string[]>(['English'])
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>('all') // shapes caption/length derivation + render presets
  const [presetId, setPresetId] = useState<string | null>(null)
  const nicheRef = useRef<HTMLTextAreaElement>(null)

  // ── optional avatar ──
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // ── async state ──
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [costCents, setCostCents] = useState(0)

  // ── derived profile (generated + stored; not all shown at creation) ──
  const [tone, setTone] = useState<Tone>({ intensity: 5, warmth: 5, energy: 5, pacing: 5, humor: 3 })
  const [targetSeconds, setTargetSeconds] = useState(75) // channel reel length (derived per niche, adjustable)
  // Resolved caption style is the single source of truth: AI picks a preset + nudges a few
  // safe knobs (accent / base color / position / size); switching chips re-resolves.
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(() => resolveCaptionStyle('pop'))
  const [style, setStyle] = useState('')
  const [region, setRegion] = useState('')
  const [era, setEra] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [objects, setObjects] = useState<string[]>([])
  const [vocab, setVocab] = useState<Array<{ term: string; value: string }>>([])
  // The describe inputs (niche+language) the profile was last derived from. Lets us
  // "Continue" without re-deriving when nothing changed, and regenerate when it did.
  const [derivedSig, setDerivedSig] = useState('')

  // ── narrator voices (real ElevenLabs voices) ──
  const [voiceMode, setVoiceMode] = useState<VoiceMode | null>('single') // default to one voice (common case); operator can switch to per-story
  const [selectedVoices, setSelectedVoices] = useState<ChannelVoice[]>([])
  const [recommended, setRecommended] = useState<Array<VoiceOption & { reason: string }>>([])
  const [recsLoading, setRecsLoading] = useState(false)
  const [recsError, setRecsError] = useState('')
  const [allVoices, setAllVoices] = useState<VoiceOption[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [showAllVoices, setShowAllVoices] = useState(false)
  const [voiceGender, setVoiceGender] = useState<'any' | 'female' | 'male'>('any')
  const [voiceSearchKeyword, setVoiceSearchKeyword] = useState('')
  const [tagline, setTagline] = useState('') // AI-derived one-line positioning (persisted on the channel)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const language = languages[0] ?? 'English'

  // ── sample script (step 2, optional) — manual preferred; "Generate draft" seeds it ──
  const [sampleScript, setSampleScript] = useState('')
  const [sampleIsAi, setSampleIsAi] = useState(false)
  const [extraSampleScripts, setExtraSampleScripts] = useState<string[]>([]) // optional additional references (max 2)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [sampleError, setSampleError] = useState('')

  // ── sound (step 4) — background music ──
  const [audioMood, setAudioMood] = useState<AudioMood | null>(null)  // derived brief (drives AI render-gen + preset ranking)
  const [musicChoice, setMusicChoice] = useState<'preset' | 'ai' | 'upload' | 'none'>('preset')
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]) // multi-select preset pool
  const [uploadedMusic, setUploadedMusic] = useState<Array<{ key: string; name: string }>>([]) // uploaded pool
  const [musicUploading, setMusicUploading] = useState(false)
  const [uploadMusicError, setUploadMusicError] = useState('')
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewingKey, setPreviewingKey] = useState<string | null>(null) // track key currently playing
  const [presetPickedManually, setPresetPickedManually] = useState(false) // once true, stop auto-tracking the top match
  const musicFileRef = useRef<HTMLInputElement>(null)

  // ── visual style (step 5) ──
  const [styleProposals, setStyleProposals] = useState<StyleProposals | null>(null)
  const [selectedStyleIdx, setSelectedStyleIdx] = useState<number | null>(null)
  const [stylePreviews, setStylePreviews] = useState<Record<number, PreviewState>>({})
  const [styleLoading, setStyleLoading] = useState(false)
  const [styleError, setStyleError] = useState('')
  const styleReqRef = useRef(0) // guards against a superseded fetch clobbering newer state
  const autoPreviewedGenRef = useRef(-1) // which proposals "generation" already auto-rendered (dedupes StrictMode + resolves)
  // Operator-uploaded reference image → vision-derived style, added as a pickable tile.
  const [uploadingRef, setUploadingRef] = useState(false)
  const [refError, setRefError] = useState('')
  const [uploadedStyleIdx, setUploadedStyleIdx] = useState<number | null>(null)
  const styleRefInputRef = useRef<HTMLInputElement>(null)

  // Pending exit target — non-null shows the "leave channel setup?" confirm modal.
  const [leaveTo, setLeaveTo] = useState<string | null>(null)

  // Chosen style image = the previewed image of the selected card, if it was previewed.
  const chosenStyleImageKey =
    selectedStyleIdx != null ? stylePreviews[selectedStyleIdx]?.imageKey ?? null : null

  // ── draft persistence: survive reloads / leaving the page until created ──
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (['describe', 'script', 'voice', 'sound', 'visual'].includes(d.phase)) setPhase(d.phase)
        if (typeof d.name === 'string') setName(d.name)
        if (typeof d.committedName === 'string') setCommittedName(d.committedName)
        if (typeof d.description === 'string') setDescription(d.description)
        if (typeof d.niche === 'string') setNiche(d.niche)
        if (Array.isArray(d.languages) && d.languages.length) setLanguages(d.languages)
        if (['tiktok', 'youtube_shorts', 'facebook_reels', 'all'].includes(d.targetPlatform)) setTargetPlatform(d.targetPlatform)
        if (d.presetId === null || typeof d.presetId === 'string') setPresetId(d.presetId)
        if (typeof d.avatarKey === 'string') {
          setAvatarKey(d.avatarKey)
          setAvatarPreview(`/api/asset?key=${encodeURIComponent(d.avatarKey)}`)
        }
        if (typeof d.costCents === 'number') setCostCents(d.costCents)
        if (d.tone) setTone(d.tone)
        if (typeof d.targetSeconds === 'number') setTargetSeconds(d.targetSeconds)
        if (d.captionStyle) {
          const cs = CaptionStyleSchema.safeParse(d.captionStyle)
          if (cs.success) setCaptionStyle(cs.data)
        }
        if (typeof d.style === 'string') setStyle(d.style)
        if (typeof d.region === 'string') setRegion(d.region)
        if (typeof d.era === 'string') setEra(d.era)
        if (Array.isArray(d.locations)) setLocations(d.locations)
        if (Array.isArray(d.objects)) setObjects(d.objects)
        if (Array.isArray(d.vocab)) setVocab(d.vocab)
        if (d.voiceMode === 'single' || d.voiceMode === 'per_story') setVoiceMode(d.voiceMode)
        if (Array.isArray(d.selectedVoices)) setSelectedVoices(d.selectedVoices)
        if (Array.isArray(d.recommended)) setRecommended(d.recommended)
        if (typeof d.voiceSearchKeyword === 'string') setVoiceSearchKeyword(d.voiceSearchKeyword)
        if (typeof d.tagline === 'string') setTagline(d.tagline)
        if (typeof d.derivedSig === 'string') setDerivedSig(d.derivedSig)
        if (typeof d.sampleScript === 'string') setSampleScript(d.sampleScript)
        if (typeof d.sampleIsAi === 'boolean') setSampleIsAi(d.sampleIsAi)
        if (Array.isArray(d.extraSampleScripts)) setExtraSampleScripts(d.extraSampleScripts.filter((s: unknown): s is string => typeof s === 'string'))
        if (d.styleProposals && Array.isArray(d.styleProposals.styles)) setStyleProposals(d.styleProposals)
        if (typeof d.selectedStyleIdx === 'number') setSelectedStyleIdx(d.selectedStyleIdx)
        if (typeof d.uploadedStyleIdx === 'number') setUploadedStyleIdx(d.uploadedStyleIdx)
        if (d.stylePreviews && typeof d.stylePreviews === 'object') setStylePreviews(d.stylePreviews)
        if (d.audioMood) setAudioMood(d.audioMood)
        if (['preset', 'ai', 'upload', 'none'].includes(d.musicChoice)) setMusicChoice(d.musicChoice)
        if (Array.isArray(d.selectedPresetIds)) setSelectedPresetIds(d.selectedPresetIds)
        if (typeof d.presetPickedManually === 'boolean') setPresetPickedManually(d.presetPickedManually)
        if (Array.isArray(d.uploadedMusic)) setUploadedMusic(d.uploadedMusic)
      }
    } catch {
      /* ignore malformed draft */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      // Persist only resolved previews (drop loading/error transients).
      const previewKeys: Record<number, PreviewState> = {}
      for (const [k, v] of Object.entries(stylePreviews)) {
        if (v.imageKey) previewKeys[Number(k)] = { imageKey: v.imageKey }
      }
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          phase, name, committedName, description, niche, languages, targetPlatform, presetId,
          avatarKey, costCents, tone, style, region, era, locations, objects, vocab,
          voiceMode, selectedVoices, recommended, voiceSearchKeyword, tagline, derivedSig,
          targetSeconds, captionStyle, sampleScript, sampleIsAi, extraSampleScripts,
          audioMood, musicChoice, selectedPresetIds, presetPickedManually, uploadedMusic,
          styleProposals, selectedStyleIdx, uploadedStyleIdx, stylePreviews: previewKeys,
        }),
      )
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [hydrated, phase, name, committedName, description, niche, languages, targetPlatform, presetId, avatarKey, costCents, tone, targetSeconds, style, region, era, locations, objects, vocab, voiceMode, selectedVoices, recommended, voiceSearchKeyword, tagline, derivedSig, captionStyle, sampleScript, sampleIsAi, extraSampleScripts, audioMood, musicChoice, selectedPresetIds, presetPickedManually, uploadedMusic, styleProposals, selectedStyleIdx, uploadedStyleIdx, stylePreviews])

  // ── Unsaved-progress guard ──────────────────────────────────────────────────
  // The draft autosaves, but leaving mid-flow still deserves a heads-up so the operator
  // can choose to keep it for later or discard it. The wizard is a fixed overlay that
  // covers the app sidebar, so the only in-app exit is the header "Channels" button; we
  // also guard browser Back / close / refresh.
  const hasProgress =
    name.trim() !== '' || niche.trim() !== '' || derivedSig !== '' ||
    sampleScript.trim() !== '' || avatarKey !== null

  // Tab close / refresh / external URL → native confirm (message is browser-controlled).
  useEffect(() => {
    if (!hasProgress) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasProgress])

  // Browser Back (SPA history) → trap it once and route the decision through our modal.
  useEffect(() => {
    if (!hasProgress) return
    window.history.pushState(null, '', window.location.href)
    const onPop = () => {
      window.history.pushState(null, '', window.location.href)
      setLeaveTo('/dashboard')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [hasProgress])

  // Esc closes the confirm (= keep editing).
  useEffect(() => {
    if (leaveTo === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLeaveTo(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leaveTo])

  // Requested an exit: prompt if there's progress, otherwise just go.
  function requestLeave(href: string) {
    if (hasProgress) setLeaveTo(href)
    else router.push(href)
  }
  function leaveKeepDraft() {
    const href = leaveTo ?? '/dashboard'
    setLeaveTo(null)
    router.push(href) // draft stays autosaved in localStorage → resumes next time
  }
  function leaveDiscardDraft() {
    const href = leaveTo ?? '/dashboard'
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
    setLeaveTo(null)
    router.push(href)
  }

  // Prefetch voice recommendations in the background as soon as a profile is derived,
  // so Step 3 is ready when reached (needs only niche/language/tone/voiceSearchKeyword).
  // Guarded on recsLoading/recsError (one call, no retry loop); regenerating the profile
  // resets recommended + derivedSig, re-triggering a fresh prefetch.
  useEffect(() => {
    if (derivedSig !== '' && recommended.length === 0 && !recsLoading && !recsError) {
      void fetchRecommendations()
    }
  }, [derivedSig, recommended.length, recsLoading, recsError])

  async function fetchRecommendations() {
    setRecsLoading(true)
    setRecsError('')
    try {
      const res = await fetch('/api/voices/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheDescription: niche.trim(), language, toneConfig: tone, searchKeyword: voiceSearchKeyword || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to recommend voices')
      const recs = (json.voices ?? []) as Array<VoiceOption & { reason: string }>
      setRecommended(recs)
      // Pre-select the top pick so the step is ready.
      setSelectedVoices((prev) =>
        prev.length === 0 && recs[0]
          ? [{ providerId: recs[0].id, name: recs[0].name, gender: recs[0].gender, description: recs[0].description }]
          : prev,
      )
    } catch (e) {
      setRecsError(friendlyError(e, 'Failed to recommend voices'))
    } finally {
      setRecsLoading(false)
    }
  }

  // Pick a narrator persona → auto-match a real voice by the persona's keyword + gender.
  // This is the whole point: the operator picks "creepy storyteller", we cast the voice.
  // "Show all voices" lazy-loads the full language-appropriate catalog.
  useEffect(() => {
    if (!showAllVoices || allVoices.length > 0 || voicesLoading) return
    setVoicesLoading(true)
    fetch(`/api/voices?language=${encodeURIComponent(language)}`)
      .then(async (res) => {
        const json = await res.json()
        if (res.ok) setAllVoices(json.voices ?? [])
      })
      .finally(() => setVoicesLoading(false))
  }, [showAllVoices, allVoices.length, voicesLoading, language])

  // Prefetch the visual styles as soon as the operator LEAVES Step 2 (enters 'voice'),
  // so Step 4 is as ready as possible. The narration (if any) is final by then; skipping
  // Step 2 just means style-options invents a scene from the niche/world. Fires once
  // (guarded on !styleProposals); 'visual' is the fallback if they jump straight there.
  // The auto-render effect below then renders every preview in the background.
  // Retry / Regenerate call fetchStyleOptions() directly.
  useEffect(() => {
    if ((phase === 'voice' || phase === 'visual') && !styleProposals && !styleLoading && !styleError) void fetchStyleOptions()
  }, [phase])

  // Presets is the default music option: auto-pick the best niche+mood-matched bed so a
  // click-through channel still gets a fitting bed (operator can change it). Only fills when
  // nothing is chosen yet; no-op until the preset library is seeded.
  useEffect(() => {
    if (musicChoice !== 'preset' || presetPickedManually || (PRESET_BEDS?.length ?? 0) === 0) return
    // Default to the single best niche+mood match as the profile hydrates/derives; stop once the
    // operator toggles any bed (they can build a multi-bed pool). Picking once + locking would
    // freeze a stale default.
    const top = rankPresets({ niche, moodTags: audioMood?.moodTags ?? [], tone })[0]?.id
    if (top && !(selectedPresetIds.length === 1 && selectedPresetIds[0] === top)) setSelectedPresetIds([top])
  }, [musicChoice, presetPickedManually, selectedPresetIds, niche, audioMood, tone])

  // Once styles are proposed, auto-render every preview in parallel so the operator
  // sees each personalized look without clicking (cards develop in as they finish).
  // Guarded per proposals "generation" so it kicks off once (survives StrictMode's
  // double-invoke); skips indices already resolved (e.g. hydrated from a saved draft).
  useEffect(() => {
    if (!styleProposals || autoPreviewedGenRef.current === styleReqRef.current) return
    autoPreviewedGenRef.current = styleReqRef.current
    styleProposals.styles.forEach((_, i) => {
      if (!stylePreviews[i]) void previewStyle(i)
    })
  }, [styleProposals])

  function vocabRecord(): Record<string, string> {
    const v: Record<string, string> = {}
    for (const { term, value } of vocab) if (term.trim()) v[term.trim()] = value
    return v
  }
  function worldBiblePayload() {
    return {
      region: region.trim(),
      era: era.trim(),
      canonLocations: locations.filter((s) => s.trim()),
      canonObjects: objects.filter((s) => s.trim()),
      vocabulary: vocabRecord(),
    }
  }

  async function fetchStyleOptions() {
    const reqId = ++styleReqRef.current
    setStyleLoading(true)
    setStyleError('')
    const basis = sampleScript.trim()
    try {
      const res = await fetch('/api/channel/style-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheDescription: niche.trim(),
          toneConfig: tone,
          worldBible: worldBiblePayload(),
          sampleScript: basis || undefined,
        }),
      })
      const json = await res.json()
      if (styleReqRef.current !== reqId) return // a newer request superseded this one
      if (!res.ok) throw new Error(json.error ?? 'Couldn’t propose styles')
      const proposals: StyleProposals = { sampleScene: json.sampleScene, styles: json.styles ?? [] }
      setStyleProposals(proposals)
      setStylePreviews({})
      setSelectedStyleIdx(0)
      if (proposals.styles[0]) setStyle(proposals.styles[0].stylePreset)
      setCostCents((c) => c + (json.costCents ?? 0))
    } catch (e) {
      if (styleReqRef.current === reqId) setStyleError(friendlyError(e, 'Couldn’t propose styles'))
    } finally {
      if (styleReqRef.current === reqId) setStyleLoading(false)
    }
  }

  function selectStyle(idx: number) {
    const card = styleProposals?.styles[idx]
    if (!card) return
    setSelectedStyleIdx(idx)
    setStyle(card.stylePreset)
  }

  async function previewStyle(idx: number) {
    const card = styleProposals?.styles[idx]
    if (!card || !styleProposals) return
    const reqId = styleReqRef.current // tie this render to the current proposals generation
    const preset = card.stylePreset
    const scene = styleProposals.sampleScene
    setStylePreviews((p) => ({ ...p, [idx]: { loading: true } }))
    try {
      const res = await fetch('/api/channel/style-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylePreset: preset, sampleScene: scene }),
      })
      const json = await res.json()
      if (styleReqRef.current !== reqId) return // a regenerate superseded these proposals — drop the stale result
      if (!res.ok) {
        setStylePreviews((p) => ({
          ...p,
          [idx]: { error: json.error ?? 'Preview failed', errorKind: json.kind === 'filtered' ? 'filtered' : 'transient' },
        }))
        return
      }
      setStylePreviews((p) => ({ ...p, [idx]: { imageKey: json.imageKey } }))
      setCostCents((c) => c + (json.costCents ?? 0))
    } catch {
      if (styleReqRef.current !== reqId) return
      setStylePreviews((p) => ({ ...p, [idx]: { error: 'Couldn’t reach the image service.', errorKind: 'transient' } }))
    }
  }

  // Upload 1–3 reference images → a vision pass derives the channel's style DNA; the
  // result is added as a pickable tile (replacing a prior upload) and auto-selected.
  async function handleStyleRefUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingRef(true)
    setRefError('')
    try {
      const fd = new FormData()
      Array.from(files).slice(0, 3).forEach((f) => fd.append('files', f))
      fd.append('nicheDescription', niche.trim())
      fd.append('toneConfig', JSON.stringify(tone))
      const res = await fetch('/api/channel/style-ref', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Couldn’t read the reference image')
      const entry: StyleOption = {
        label: json.label || 'Your reference',
        description: json.description || 'Style from your uploaded reference.',
        stylePreset: json.stylePreset,
      }
      const current = styleProposals ?? { sampleScene: '', styles: [] }
      const idx = uploadedStyleIdx ?? current.styles.length
      const styles = [...current.styles]
      styles[idx] = entry
      setStyleProposals({ ...current, styles })
      setStylePreviews((p) => ({ ...p, [idx]: { imageKey: json.imageKey } }))
      setUploadedStyleIdx(idx)
      setSelectedStyleIdx(idx)
      setStyle(entry.stylePreset)
      setCostCents((c) => c + (json.costCents ?? 0))
    } catch (e) {
      setRefError(friendlyError(e, 'Couldn’t read the reference image'))
    } finally {
      setUploadingRef(false)
    }
  }

  function isVoiceSelected(id: string) {
    return selectedVoices.some((v) => v.providerId === id)
  }
  function pickVoice(v: VoiceOption) {
    // Single mode only — selecting replaces the one voice.
    setSelectedVoices([{ providerId: v.id, name: v.name, gender: v.gender, description: v.description }])
  }
  function changeMode(mode: VoiceMode) {
    setVoiceMode(mode)
    if (mode === 'per_story') setSelectedVoices([]) // voice is chosen per reel at render time
    if (audioRef.current) { audioRef.current.pause(); setPlayingVoiceId(null) }
  }
  function playPreview(v: VoiceOption) {
    if (!v.previewUrl) return
    if (audioRef.current) audioRef.current.pause()
    if (playingVoiceId === v.id) { setPlayingVoiceId(null); return }
    const audio = new Audio(v.previewUrl)
    audioRef.current = audio
    audio.onended = () => setPlayingVoiceId(null)
    audio.play().then(() => setPlayingVoiceId(v.id)).catch(() => setPlayingVoiceId(null))
  }

  const canGenerate = name.trim().length > 0 && niche.trim().length >= 20 && languages.length > 0
  // Profile is "fresh" if the niche+language haven't changed since we derived it —
  // then we can Continue without re-calling the API. (Name/description/avatar don't
  // feed the creative bible, so editing them doesn't stale it.)
  const hasDerived = derivedSig !== ''
  const derivedFresh = hasDerived && derivedSig === `${niche.trim()}|${language}|${targetPlatform}`
  // Must pick a mode; single needs a chosen voice, per-story defers to render.
  const canLeaveVoice = voiceMode === 'per_story' || (voiceMode === 'single' && selectedVoices.length > 0)
  const canCreate = canLeaveVoice

  // The track POOL to persist (preset/upload only; 'ai' generates per reel, 'none' is silent).
  // >1 track → the renderer draws one at random per reel.
  const chosenTracks =
    musicChoice === 'preset'
      ? selectedPresetIds
          .map((id) => (PRESET_BEDS ?? []).find((p) => p.id === id))
          .filter((b): b is NonNullable<typeof b> => !!b)
          .map((b) => ({ id: b.id, path: b.path, type: b.type, moodTags: b.moodTags }))
      : musicChoice === 'upload'
        ? uploadedMusic.map((u) => ({ path: u.key, type: 'low_drone' as const, moodTags: [] as string[] }))
        : []
  const poolSize = chosenTracks.length

  // Voice lists for single mode (gender-filtered). Recommended stays on top;
  // "show all" appends the rest of the catalog below it.
  const matchesGender = (v: { gender: string }) =>
    voiceGender === 'any' || (v.gender || '').toLowerCase() === voiceGender
  const recommendedFiltered = recommended.filter(matchesGender)
  const recIds = new Set(recommended.map((v) => v.id))
  const moreFiltered = allVoices.filter((v) => !recIds.has(v.id)).filter(matchesGender)
  const topPickId = recommended[0]?.id
  const allVoicesLoading = showAllVoices && voicesLoading && allVoices.length === 0

  function pickPreset(id: string) {
    const preset = NICHE_PRESETS.find((p) => p.id === id)
    if (!preset) return
    if (presetId === id) {
      // toggle off
      setPresetId(null)
      return
    }
    setPresetId(id)
    setNiche(preset.description)
    setLanguages([preset.language])
  }

  function pickCustom() {
    if (presetId !== null) setNiche('') // clear the seeded preset text for a fresh start
    setPresetId(null)
    nicheRef.current?.focus()
  }

  async function handleAvatar(file: File | undefined) {
    if (!file) return
    setError('')
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/channel/avatar', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Avatar upload failed')
      setAvatarKey(json.key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Avatar upload failed')
      setAvatarPreview(null)
      setAvatarKey(null)
    } finally {
      setAvatarUploading(false)
    }
  }

  function removeAvatar() {
    setAvatarKey(null)
    setAvatarPreview(null)
  }

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/channel/derive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), nicheDescription: niche.trim(), languages, targetPlatform }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      const d = json.derived as Derived
      setTone(d.toneConfig)
      if (typeof d.targetSeconds === 'number') setTargetSeconds(d.targetSeconds)
      if (d.captionPreset) {
        setCaptionStyle(resolveCaptionStyle(d.captionPreset, {
          highlightColor: d.captionHighlight,
          color: d.captionTextColor,
          position: d.captionPosition,
          fontScale: d.captionFontScale,
        }))
      }
      setStyle(d.stylePreset)
      setRegion(d.worldBible.region)
      setEra(d.worldBible.era)
      setLocations(d.worldBible.canonLocations ?? [])
      setObjects(d.worldBible.canonObjects ?? [])
      setVocab(Object.entries(d.worldBible.vocabulary ?? {}).map(([term, value]) => ({ term, value })))
      setVoiceSearchKeyword(d.voiceSearchKeyword ?? '')
      setTagline(d.tagline ?? '')
      setAudioMood(d.audioMood ?? null)
      setCostCents(json.costCents ?? 0)
      setDerivedSig(`${niche.trim()}|${language}|${targetPlatform}`)
      // Fresh profile invalidates anything derived from the old one.
      setRecommended([])
      setSelectedVoices([])
      // New audio mood → re-rank presets from scratch; clear any prior picks/uploads.
      setSelectedPresetIds([])
      setPresetPickedManually(false)
      setUploadedMusic([])
      setStyleProposals(null)
      setStylePreviews({})
      setSelectedStyleIdx(null)
      setUploadedStyleIdx(null)
      setStyleError('')
      setRefError('')
      setPhase('script')
    } catch (e) {
      setError(friendlyError(e, 'Generation failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSampleDraft() {
    setSampleLoading(true)
    setSampleError('')
    try {
      const res = await fetch('/api/channel/sample-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nicheDescription: niche.trim(),
          languages,
          toneConfig: tone,
          targetSeconds,
          targetPlatform,
          worldBible: worldBiblePayload(),
          voiceStyle: selectedVoices[0]?.description,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Draft failed')
      const s = json.sample as { title: string; hook: string; script: string }
      setSampleScript(s.script?.trim() || s.hook || '')
      setSampleIsAi(true)
      setCostCents((c) => c + (json.costCents ?? 0))
    } catch (e) {
      setSampleError(friendlyError(e, 'Draft failed'))
    } finally {
      setSampleLoading(false)
    }
  }

  // Upload one or more background tracks (Sound step). Appended to the pool; previewed like presets.
  async function handleMusicUpload(files: FileList) {
    setMusicUploading(true)
    setUploadMusicError('')
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/channel/music-upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Upload failed')
        setUploadedMusic((prev) => [...prev, { key: json.key, name: file.name }])
      }
    } catch (e) {
      setUploadMusicError(friendlyError(e, 'Upload failed'))
    } finally {
      setMusicUploading(false)
    }
  }

  // Preview a track by its R2 key — music alone (no narration overlay), one at a time.
  function playMusicPreview(key: string) {
    if (previewAudioRef.current) previewAudioRef.current.pause()
    if (previewingKey === key) { setPreviewingKey(null); return }  // toggle off
    // Cache-bust: preset beds can be regenerated under the same key, so force a fresh fetch.
    const audio = new Audio(`/api/asset?key=${encodeURIComponent(key)}&cb=${Date.now()}`)
    previewAudioRef.current = audio
    setPreviewingKey(key)
    audio.onended = () => setPreviewingKey(null)
    void audio.play().catch(() => setPreviewingKey(null))
  }

  function stopPreview() {
    if (previewAudioRef.current) previewAudioRef.current.pause()
    setPreviewingKey(null)
  }

  async function handleCreate() {
    if (!voiceMode) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/channel/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatarKey,
          description: description.trim() || null,
          nicheDescription: niche.trim(),
          tagline,
          languages,
          targetPlatform,
          toneConfig: tone,
          voiceSearchKeyword,
          targetSeconds,
          captionStyle,
          stylePreset: style.trim(),
          styleImageKey: chosenStyleImageKey,
          worldBible: worldBiblePayload(),
          voiceMode,
          voicePool: selectedVoices,
          sampleScript: sampleScript.trim() || null,
          sampleSource: sampleIsAi ? 'ai' : 'user',
          extraSampleScripts: extraSampleScripts.map((s) => s.trim()).filter(Boolean),
          costCents, // accumulated creation cost → persisted on the channel

          sound: {
            musicMode: musicChoice,
            tracks: chosenTracks,
            audioMood: audioMood ?? undefined,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Create failed')
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
      router.push('/dashboard')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
      setCreating(false)
    }
  }

  return (
    // Focused full-screen flow: covers the app sidebar / mobile top bar so the
    // wizard's own header is the only chrome — no nesting under the global header.
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-bg/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          {/* Exits the wizard back to the channel list — labeled so it isn't mistaken
              for the per-step "Back" button in each step's footer. Guards unsaved progress. */}
          <button type="button" onClick={() => requestLeave('/dashboard')} className="btn-ghost btn-sm -ml-1 flex-shrink-0" title="Back to your channels">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Channels
          </button>
          <span className="hidden h-6 w-px flex-shrink-0 bg-border sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">New channel</h1>
            <p className="truncate text-xs text-muted">{STEP_SUBTITLE[phase]}</p>
          </div>
          <StepDots phase={phase} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl p-5 sm:p-8">
        {error && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* ─────────────────────────── STEP 1 · DESCRIBE ─────────────────────────── */}
        {phase === 'describe' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div className="flex items-end gap-4">
              <AvatarPicker
                committedName={committedName}
                preview={avatarPreview}
                uploading={avatarUploading}
                onPick={handleAvatar}
                onRemove={removeAvatar}
              />
              <div className="flex-1">
                <Field label="Channel name" hint="The publishing brand. Avatar is optional.">
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setCommittedName(name.trim())}
                    placeholder="Your channel name"
                    autoFocus
                  />
                </Field>
              </div>
            </div>

            <Field label="Description" hint="Optional — a short line shown on the channel's card.">
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short line for the channel's card."
                maxLength={140}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink">What&apos;s your channel about?</label>
              <p className="-mt-1 text-xs text-muted">
                Tap a trending topic to start from a template, or describe your own below. Either way you can edit everything.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NICHE_PRESETS.map((p) => {
                  const on = presetId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p.id)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                        on
                          ? 'border-accent bg-accent-soft ring-1 ring-accent'
                          : 'border-border-strong hover:bg-subtle'
                      }`}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${p.color}`}>
                        <NicheIcon name={p.icon} />
                      </span>
                      <span className="text-sm font-medium text-ink">{p.label}</span>
                      <span className="text-xs text-muted">{p.blurb}</span>
                    </button>
                  )
                })}
                {/* Write your own */}
                <button
                  type="button"
                  onClick={pickCustom}
                  className={`flex flex-col items-start gap-1 rounded-lg border border-dashed p-3 text-left transition-all ${
                    presetId === null
                      ? 'border-accent bg-accent-soft ring-1 ring-accent'
                      : 'border-border-strong hover:bg-subtle'
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${presetId === null ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
                    <NicheIcon name="custom" />
                  </span>
                  <span className="text-sm font-medium text-ink">Write your own</span>
                  <span className="text-xs text-muted">Describe it in your words</span>
                </button>
              </div>
            </div>

            <Field label="Describe your channel" hint="Genre, audience, format, tone, how it's narrated — plus any recurring world or characters. The more you give us, the better every reel; we safely fill in the rest.">
              <textarea
                ref={nicheRef}
                className="input h-44 resize-none"
                value={niche}
                onChange={(e) => { setNiche(e.target.value); setPresetId(null) }}
                placeholder="e.g. Filipino horror folktales retold like your lola's late-night stories — slow-burn aswang and kapre encounters in remote barrios, first-person 'this happened to our family' framing, hushed Tagalog narration, dread over gore. (The more you describe the world, characters, and voice, the better.)"
              />
              <p className="mt-1 text-xs text-faint">{niche.trim().length}/20 min characters</p>
            </Field>

            <Field label="Language" hint="Every reel on this channel is narrated in this language. Want another language? Create a separate channel.">
              <Dropdown
                className="w-full sm:w-64"
                value={language}
                onChange={(v) => setLanguages([v])}
                options={SUPPORTED_LANGUAGES}
              />
            </Field>

            <Field label="Target platform" hint="Where these reels get posted — tunes length, caption safe-zones and aspect for that platform.">
              <PlatformPicker value={targetPlatform} onChange={setTargetPlatform} />
            </Field>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
              {/* One consistent label. If the niche/language changed since deriving, clicking
                  Continue silently re-derives first (handleGenerate); otherwise it just advances. */}
              <button
                onClick={derivedFresh ? () => setPhase('script') : handleGenerate}
                disabled={!canGenerate || loading}
                className="btn-accent"
              >
                {loading ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden>
                      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    {hasDerived ? 'Continue' : 'Generate channel profile'}
                    <FwdArrow />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────── STEP 2 · SAMPLE SCRIPT ─────────────────────── */}
        {phase === 'script' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <Recap name={name} description={description} language={language} avatarPreview={avatarPreview} />

            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <SectionLabel>Sample script</SectionLabel>
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    This teaches your channel&apos;s writing voice — every reel is written to match it. Your own
                    example works best; or generate a draft to start from and edit it.
                  </p>
                </div>
                <button onClick={handleSampleDraft} disabled={sampleLoading} className="btn-secondary btn-sm flex-shrink-0">
                  {sampleLoading ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                      </svg>
                      Writing…
                    </>
                  ) : sampleScript.trim() ? 'Regenerate draft' : 'Generate draft'}
                </button>
              </div>
              <textarea
                className="input mt-3 h-64 resize-none leading-relaxed"
                value={sampleScript}
                onChange={(e) => { setSampleScript(e.target.value); setSampleIsAi(false) }}
                placeholder="e.g. Hindi pa rin ako makatulog kapag umuulan — dahil sa nangyari sa amin noong isang gabi sa probinsya... (write or paste a real opening in your channel's voice — this is what every reel will sound like)"
              />
              {sampleError && <p className="mt-2 text-xs text-danger">{sampleError}</p>}

              {/* Optional extra references — few-shot is stronger with 2–3 examples */}
              {extraSampleScripts.map((s, i) => (
                <div key={i} className="mt-3 flex gap-2">
                  <textarea
                    className="input h-28 flex-1 resize-none leading-relaxed"
                    value={s}
                    onChange={(e) => setExtraSampleScripts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder="Another example in your channel's voice (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraSampleScripts((prev) => prev.filter((_, j) => j !== i))}
                    className="btn-ghost btn-sm self-start"
                    title="Remove this reference"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {extraSampleScripts.length < 2 && (
                <button type="button" onClick={() => setExtraSampleScripts((prev) => [...prev, ''])} className="btn-ghost btn-sm mt-3">
                  + Add another reference
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('describe')} className="btn-secondary">
                <BackArrow /> Back
              </button>
              <div className="flex flex-col items-end gap-1">
                {!sampleScript.trim() && (
                  <p className="text-xs text-faint">Add an example — or tap Generate draft — to continue.</p>
                )}
                <button onClick={() => setPhase('voice')} disabled={!sampleScript.trim()} className="btn-accent">
                  Next
                  <FwdArrow />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────── STEP 3 · NARRATOR VOICE ────────────────────── */}
        {phase === 'voice' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <Recap name={name} description={description} language={language} avatarPreview={avatarPreview} />

            <div className="card p-5">
              <SectionLabel>Narrator voice</SectionLabel>
              <p className="mt-1 text-xs text-faint">Real ElevenLabs voices — preview and select. Names &amp; descriptions aren&apos;t editable.</p>

              {/* Mode — radio with explanations */}
              <div className="mt-3 flex flex-col gap-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${voiceMode === 'single' ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}>
                  <input type="radio" name="voiceMode" checked={voiceMode === 'single'} onChange={() => changeMode('single')} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent" />
                  <span>
                    <span className="block text-sm font-medium text-ink">One voice for the whole channel</span>
                    <span className="mt-0.5 block text-xs text-muted">Pick one voice now — every reel on this channel is narrated by it.</span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${voiceMode === 'per_story' ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}>
                  <input type="radio" name="voiceMode" checked={voiceMode === 'per_story'} onChange={() => changeMode('per_story')} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent" />
                  <span>
                    <span className="block text-sm font-medium text-ink">A different voice per story</span>
                    <span className="mt-0.5 block text-xs text-muted">Don&apos;t choose now — pick a voice for each reel when you produce it.</span>
                  </span>
                </label>
              </div>

              {!voiceMode && <p className="mt-2 text-xs text-faint">Choose one to continue.</p>}

              {/* Voice list only appears once "one voice" is chosen */}
              {voiceMode === 'single' && (
                <div className="mt-6">
                  {recsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                      </svg>
                      Finding voices that fit your channel…
                    </div>
                  ) : recsError ? (
                    <div>
                      <p className="text-sm text-danger">{recsError}</p>
                      <button type="button" onClick={() => fetchRecommendations()} className="btn-secondary btn-sm mt-2">Try again</button>
                    </div>
                  ) : (
                    <>
                      {/* Recommended header with the gender filter aligned right */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted">Recommended for your niche</p>
                        <div className="flex items-center gap-0.5 rounded-lg bg-subtle p-0.5">
                          {(['any', 'female', 'male'] as const).map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setVoiceGender(g)}
                              className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${voiceGender === g ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'}`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                      {recommendedFiltered.length === 0 ? (
                        <p className="mt-2 text-sm text-muted">No {voiceGender} recommended voices{!showAllVoices ? ' — try “Show all voices”.' : '.'}</p>
                      ) : (
                        <div className="mt-2 grid grid-cols-1 gap-2">
                          {recommendedFiltered.map((v) => (
                            <VoiceRow
                              key={v.id}
                              v={v}
                              selected={isVoiceSelected(v.id)}
                              playing={playingVoiceId === v.id}
                              reason={v.reason}
                              topPick={v.id === topPickId}
                              onPick={() => pickVoice(v)}
                              onPreview={() => playPreview(v)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Rest of the catalog — appended when expanded */}
                      {showAllVoices &&
                        (allVoicesLoading ? (
                          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                            </svg>
                            Loading all voices…
                          </div>
                        ) : moreFiltered.length > 0 ? (
                          <>
                            <p className="mt-4 text-xs font-medium text-muted">All voices</p>
                            <div className="mt-2 grid grid-cols-1 gap-2">
                              {moreFiltered.map((v) => (
                                <VoiceRow
                                  key={v.id}
                                  v={v}
                                  selected={isVoiceSelected(v.id)}
                                  playing={playingVoiceId === v.id}
                                  onPick={() => pickVoice(v)}
                                  onPreview={() => playPreview(v)}
                                />
                              ))}
                            </div>
                          </>
                        ) : null)}

                      <button
                        type="button"
                        onClick={() => setShowAllVoices((s) => !s)}
                        className="btn-ghost btn-sm mt-3"
                      >
                        {voicesLoading && !allVoicesLoading ? 'Loading…' : showAllVoices ? 'Show recommended only' : 'Show all voices'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('script')} className="btn-secondary">
                <BackArrow /> Back
              </button>
              <button onClick={() => setPhase('sound')} disabled={!canLeaveVoice} className="btn-accent">
                Next <FwdArrow />
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────── STEP 4 · SOUND ─────────────────────────────── */}
        {phase === 'sound' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <Recap name={name} description={description} language={language} avatarPreview={avatarPreview} />

            {/* Background music — one decision; loudness + SFX live in channel Settings, not here. */}
            <div className="card p-5">
              <SectionLabel>Background music</SectionLabel>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The bed under your narration. It auto-ducks under the voice on every reel.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { key: 'preset', label: 'Presets', sub: 'Fitted to your niche' },
                  { key: 'ai', label: 'AI-generated', sub: 'Original, for your channel' },
                  { key: 'upload', label: 'Upload', sub: 'Your own tracks' },
                  { key: 'none', label: 'No music', sub: 'Narration only' },
                ] as const).map((opt) => {
                  const active = musicChoice === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { stopPreview(); setMusicChoice(opt.key) }}
                      className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}
                    >
                      <span className="text-sm font-medium text-ink">{opt.label}</span>
                      <span className="text-xs text-muted">{opt.sub}</span>
                    </button>
                  )
                })}
              </div>

              {/* Presets — our mood beds, ranked by niche + mood; pick one or several (random per reel) */}
              {musicChoice === 'preset' && (
                <div className="mt-4">
                  {(() => {
                    const ranked = rankPresets({ niche, moodTags: audioMood?.moodTags ?? [], tone })
                    if (ranked.length === 0) {
                      return (
                        <p className="rounded-lg border border-border bg-subtle px-3 py-2.5 text-xs leading-relaxed text-muted">
                          Preset beds are being prepared. For now, pick{' '}
                          <span className="font-medium text-ink">AI-generated</span> (original beds for your channel) or{' '}
                          <span className="font-medium text-ink">No music</span>.
                        </p>
                      )
                    }
                    // Show only the top 8 most-relevant beds (ranked by niche + mood/tone) — a
                    // curated shortlist, no overwhelming full library, no off-niche clutter.
                    const beds = ranked.slice(0, 8)
                    return (
                      <>
                        <p className="mb-2 text-xs text-muted">Pick one, or several to vary it.{selectedPresetIds.length > 1 ? <span className="text-accent"> 🎲 We’ll pick one of your {selectedPresetIds.length} at random for each reel.</span> : ''}</p>
                        <div className="flex flex-col gap-2">
                          {beds.map((bed) => {
                            const active = selectedPresetIds.includes(bed.id)
                            return (
                              <div
                                key={bed.id}
                                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${active ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setPresetPickedManually(true); setSelectedPresetIds((prev) => prev.includes(bed.id) ? prev.filter((x) => x !== bed.id) : [...prev, bed.id]) }}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${active ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
                                    {active && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-ink">{bed.mood}</span>
                                    <span className="block truncate text-xs text-muted">{bed.moodTags.join(' · ')}</span>
                                  </span>
                                </button>
                                <button type="button" onClick={() => playMusicPreview(bed.path)} className="btn-secondary btn-sm flex-shrink-0" title="Preview">
                                  {previewingKey === bed.path ? '◼' : '▶'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* AI-generated — bespoke beds composed for the channel (async after creation), mood-matched per reel */}
              {musicChoice === 'ai' && (
                <div className="mt-4 rounded-lg border border-border bg-subtle/50 p-4">
                  <p className="text-xs leading-relaxed text-muted">
                    We compose a few <span className="font-medium text-ink">original background beds for your channel</span> — nothing to pick here. They&apos;re generated right after you create the channel (ready in a minute or two), and each reel automatically uses the one that fits its mood.
                  </p>
                </div>
              )}

              {/* Upload — store the operator's own tracks (copyright is on them); random per reel if >1 */}
              {musicChoice === 'upload' && (
                <div className="mt-4 rounded-lg border border-border bg-subtle/50 p-4">
                  <input
                    ref={musicFileRef}
                    type="file"
                    multiple
                    accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg"
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.length) void handleMusicUpload(e.target.files); e.target.value = '' }}
                  />
                  <button type="button" onClick={() => musicFileRef.current?.click()} disabled={musicUploading} className="btn-secondary btn-sm">
                    {musicUploading ? 'Uploading…' : uploadedMusic.length ? 'Add another' : 'Choose audio file(s)'}
                  </button>
                  {uploadedMusic.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {uploadedMusic.map((u) => (
                        <div key={u.key} className="flex items-center gap-3 rounded-lg border border-border-strong px-3 py-2">
                          <p className="min-w-0 flex-1 truncate text-sm text-ink">{u.name}</p>
                          <button type="button" onClick={() => playMusicPreview(u.key)} className="btn-secondary btn-sm flex-shrink-0" title="Preview">
                            {previewingKey === u.key ? '◼' : '▶'}
                          </button>
                          <button type="button" onClick={() => { stopPreview(); setUploadedMusic((prev) => prev.filter((x) => x.key !== u.key)) }} className="btn-ghost btn-sm flex-shrink-0" title="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {uploadedMusic.length > 1 && <p className="mt-2 text-xs text-accent">🎲 We’ll pick one of your {uploadedMusic.length} at random for each reel.</p>}
                  {uploadMusicError && <p className="mt-2 text-xs text-danger">{uploadMusicError}</p>}
                  <p className="mt-3 rounded-md border border-border bg-bg px-3 py-2 text-xs leading-relaxed text-muted">
                    <span className="font-medium text-ink">⚠ Only upload music you own or have a commercial license for.</span>{' '}
                    Copyrighted tracks can get your reels muted, blocked, or demonetized by TikTok / YouTube / Instagram audio-matching — we can’t clear those rights for you.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => { stopPreview(); setPhase('voice') }} className="btn-secondary">
                <BackArrow /> Back
              </button>
              <button onClick={() => { stopPreview(); setPhase('visual') }} className="btn-accent">
                Next <FwdArrow />
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────── STEP 5 · VISUAL STYLE ──────────────────────── */}
        {phase === 'visual' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <Recap name={name} description={description} language={language} avatarPreview={avatarPreview} />

            <div className="card p-5">
              <SectionLabel>Visual style</SectionLabel>
              <p className="mt-1 text-xs text-faint">
                Pick a look for your channel — or upload your own reference. Each is previewed on a sample scene from your niche.
              </p>
              <input
                ref={styleRefInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => { void handleStyleRefUpload(e.target.files); e.target.value = '' }}
              />
              {refError && <p className="mt-2 text-xs text-danger">{refError}</p>}

              {styleLoading && !styleProposals ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  </svg>
                  Sketching looks for your channel…
                </div>
              ) : styleError && !styleProposals ? (
                <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-4">
                  <p className="text-sm text-danger">{styleError}</p>
                  <p className="mt-1 text-xs text-muted">You can still create the channel with its default style, or try again.</p>
                  <button onClick={() => fetchStyleOptions()} className="btn-secondary btn-sm mt-3">Try again</button>
                </div>
              ) : styleProposals ? (
                (() => {
                  const sel = selectedStyleIdx ?? 0
                  const selStyle = styleProposals.styles[sel]
                  return (
                    <div className="mt-4">
                      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                        {styleProposals.styles.map((s, idx) => {
                          const pv = stylePreviews[idx]
                          const selected = sel === idx
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => selectStyle(idx)}
                              title={`${s.label} — ${s.description}`}
                              className={`group relative aspect-[9/16] overflow-hidden rounded-lg border transition-all ${selected ? 'border-accent ring-2 ring-accent' : 'border-border-strong hover:border-accent/60'}`}
                            >
                              {pv?.imageKey ? (
                                <StylePreviewImage key={pv.imageKey} imageKey={pv.imageKey} />
                              ) : pv?.error ? (
                                <div className="flex h-full w-full items-center justify-center bg-subtle px-2 text-center text-[11px] text-faint">Couldn&apos;t preview</div>
                              ) : (
                                <div className="h-full w-full animate-shimmer bg-gradient-to-r from-subtle via-surface to-subtle bg-[length:200%_100%]" />
                              )}
                              {/* Name overlaid on the image */}
                              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/85 via-ink/40 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium leading-tight text-white">
                                {s.label}
                              </span>
                              {idx === uploadedStyleIdx ? (
                                <span className="absolute left-1.5 top-1.5 rounded bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">Uploaded</span>
                              ) : idx === 0 ? (
                                <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm">Recommended</span>
                              ) : null}
                              {selected && (
                                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-sm">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                                </span>
                              )}
                            </button>
                          )
                        })}
                        {/* Upload your own — integrated tile */}
                        <button
                          type="button"
                          onClick={() => styleRefInputRef.current?.click()}
                          disabled={uploadingRef}
                          className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 text-center text-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-60"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={uploadingRef ? 'animate-spin' : ''} aria-hidden>
                            {uploadingRef ? <path d="M21 12a9 9 0 1 1-6.22-8.56" /> : <><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></>}
                          </svg>
                          <span className="text-[11px] font-medium leading-tight">{uploadingRef ? 'Reading…' : 'Upload your own'}</span>
                        </button>
                      </div>
                      {selStyle && (
                        <p className="mt-3 text-xs text-muted">
                          <span className="font-medium text-ink">{selStyle.label}</span> — {selStyle.description}
                        </p>
                      )}
                    </div>
                  )
                })()
              ) : null}
            </div>

            <div className="card p-5">
              <SectionLabel>Captions</SectionLabel>
              <p className="mt-1 text-xs text-faint">
                Burned into every reel (most are watched on mute) — playing live below, just like in the video.
                Suggested for your niche; switch anytime.
              </p>
              <div className="mt-3">
                <CaptionPreview
                  key={captionStyle.preset}
                  style={captionStyle}
                  safeZonePct={PLATFORM_PRESETS[targetPlatform].safeZoneBottomPct}
                  backgroundImageUrl={chosenStyleImageKey ? `/api/asset?key=${encodeURIComponent(chosenStyleImageKey)}` : undefined}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CAPTION_OPTIONS.map((o) => (
                  <button
                    key={o.preset}
                    type="button"
                    // Switching presets keeps the channel's brand palette (accent + base color)
                    // but resets motion/size/placement to that preset's signature look.
                    onClick={() => setCaptionStyle(resolveCaptionStyle(o.preset, { highlightColor: captionStyle.highlightColor, color: captionStyle.color }))}
                    title={o.vibe}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${captionStyle.preset === o.preset ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent' : 'border-border-strong text-muted hover:bg-subtle'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {(() => {
                const selected = CAPTION_OPTIONS.find((o) => o.preset === captionStyle.preset)
                return selected ? <p className="mt-2.5 text-xs text-muted">{selected.vibe}</p> : null
              })()}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('sound')} className="btn-secondary">
                <BackArrow /> Back
              </button>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-faint">spent ${(costCents / 100).toFixed(2)}</span>
                <button onClick={handleCreate} disabled={creating || !canCreate} className="btn-accent">
                  {creating ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Leave-confirmation: keep the autosaved draft, discard it, or stay. */}
      {leaveTo !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setLeaveTo(null)}
        >
          <div className="card animate-fade-in w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">Leave channel setup?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Keep your draft to finish later, or discard it and start fresh.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setLeaveTo(null)} className="btn-ghost btn-sm">Keep editing</button>
              <button type="button" onClick={leaveDiscardDraft} className="btn-danger btn-sm">Discard</button>
              <button type="button" onClick={leaveKeepDraft} className="btn-accent btn-sm">Leave &amp; save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Polaroid-style develop-in: blurred/faded until the image actually loads. Fills its
// parent (the tile's aspect box), which provides the rounding/clipping.
function StylePreviewImage({ imageKey }: { imageKey: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={`/api/asset?key=${encodeURIComponent(imageKey)}`}
      alt="Style preview"
      onLoad={() => setLoaded(true)}
      className={`h-full w-full object-cover style-develop ${loaded ? 'style-develop-in' : ''}`}
    />
  )
}

// Outlined (stroke) glyphs per niche, consistent with the app's line icons.
// Eyes/dots use zero-length paths with round linecaps.
const ICON_PATHS: Record<string, string> = {
  horror:
    '<path d="M6 19V10a6 6 0 0 1 12 0v9l-2-1.6-2 1.6-2-1.6-2 1.6Z"/><path d="M10 10.5h.01"/><path d="M14 10.5h.01"/>',
  crime: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  reddit:
    '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3a8.38 8.38 0 0 1 8.5 8.5Z"/>',
  motivation:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  facts:
    '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>',
  history:
    '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 4 7h16Z"/>',
  space:
    '<circle cx="12" cy="12" r="5"/><path d="M19.5 9.5c1.4.5 2.3 1.2 2.4 2 .2 1.6-3 3.8-7.4 5s-8.2 1.1-8.9-.3"/>',
  money:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
  psychology:
    '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 12 5.5 4.5 4.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7Z"/>',
  custom: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
}

function NicheIcon({ name }: { name: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? '' }}
    />
  )
}

function BackArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}
function FwdArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  )
}

function Recap({ name, description, language, avatarPreview }: {
  name: string
  description: string
  language: string
  avatarPreview: string | null
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      {avatarPreview ? (
        <img src={avatarPreview} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
      ) : (
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ background: avatarGradient(name || 'channel') }}
        >
          {avatarInitials(name || '?')}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-ink">{name || 'Untitled channel'}</p>
        {description && <p className="truncate text-xs text-muted">{description}</p>}
      </div>
      <span className="badge flex-shrink-0 bg-subtle text-muted">{language}</span>
    </div>
  )
}

function AvatarPicker({ committedName, preview, uploading, onPick, onRemove }: {
  committedName: string
  preview: string | null
  uploading: boolean
  onPick: (file: File | undefined) => void
  onRemove: () => void
}) {
  const hasGradient = !preview && committedName.length > 0
  return (
    <div className="flex flex-col items-center gap-1">
      <label
        className={`group relative flex h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border-strong text-base font-semibold shadow-xs transition-all hover:scale-[1.03] ${
          hasGradient ? 'text-white' : preview ? '' : 'bg-subtle text-faint'
        }`}
        style={hasGradient ? { background: avatarGradient(committedName) } : undefined}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{avatarInitials(committedName)}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100">
          {uploading ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          )}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
      {preview ? (
        <button type="button" onClick={onRemove} className="text-xs text-faint hover:text-danger">Remove</button>
      ) : (
        <span className="text-xs text-faint">Avatar</span>
      )}
    </div>
  )
}

function VoiceRow({ v, selected, playing, reason, topPick, onPick, onPreview }: {
  v: VoiceOption
  selected: boolean
  playing: boolean
  reason?: string
  topPick?: boolean
  onPick: () => void
  onPreview: () => void
}) {
  return (
    <div
      onClick={onPick}
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all ${selected ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPreview() }}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-ink transition-colors hover:bg-subtle"
        title="Preview voice"
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 5v14l11-7L7 5Z" /></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-ink">{v.name}</p>
          <span className="badge bg-subtle text-muted">{v.gender}</span>
          {topPick && <span className="badge bg-accent-soft text-accent">Top pick</span>}
        </div>
        <p className="truncate text-xs text-muted">{v.description || v.accent || '—'}</p>
        {reason && <p className="mt-0.5 truncate text-xs text-accent">{reason}</p>}
      </div>
      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${selected ? 'border-accent bg-accent text-white' : 'border-border-strong'}`}>
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        )}
      </span>
    </div>
  )
}

function StepDots({ phase }: { phase: Phase }) {
  const current = PHASE_ORDER.indexOf(phase)
  return (
    <div className="flex items-center gap-1.5">
      {PHASE_ORDER.map((p, i) => (
        <span key={p} className={`h-1.5 w-5 rounded-full ${i <= current ? 'bg-accent' : 'bg-border-strong'}`} />
      ))}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold tracking-tight text-ink">{children}</p>
}
