'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NICHE_PRESETS } from './niche-presets'
import { SUPPORTED_LANGUAGES } from './languages'
import { Dropdown } from '@/components/Dropdown'
import { avatarGradient, avatarInitials } from '@/components/ChannelAvatar'

const DRAFT_KEY = 'reels:new-channel-draft'

// After the API's own timeout + retries, a transient failure surfaces here —
// show a clear "try again" instead of a raw SDK message.
function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : fallback
  return /connection|timeout|timed out|network|fetch failed|502|ECONN/i.test(msg)
    ? 'Couldn’t reach the AI service — please try again.'
    : msg
}

const TONE_KEYS = ['suspense', 'dread', 'pacing', 'gore', 'humor'] as const
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
  stylePreset: string
  worldBible: {
    region: string
    era: string
    canonLocations: string[]
    canonObjects: string[]
    vocabulary: Record<string, string>
  }
  voiceSearchKeyword: string
}

export function NewChannelWizard() {
  const router = useRouter()
  const [phase, setPhase] = useState<'describe' | 'review'>('describe')

  // ── describe inputs ──
  const [name, setName] = useState('')
  const [committedName, setCommittedName] = useState('') // drives avatar color; updated on blur to avoid per-keystroke flicker
  const [description, setDescription] = useState('')
  const [niche, setNiche] = useState('')
  const [languages, setLanguages] = useState<string[]>(['English'])
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
  const [tone, setTone] = useState<Tone>({ suspense: 7, dread: 8, pacing: 6, gore: 2, humor: 1 })
  const [style, setStyle] = useState('')
  const [region, setRegion] = useState('')
  const [era, setEra] = useState('')
  const [locations, setLocations] = useState<string[]>([])
  const [objects, setObjects] = useState<string[]>([])
  const [vocab, setVocab] = useState<Array<{ term: string; value: string }>>([])

  // ── narrator voices (real ElevenLabs voices) ──
  const [voiceMode, setVoiceMode] = useState<VoiceMode | null>(null) // null = nothing chosen yet

  const [selectedVoices, setSelectedVoices] = useState<ChannelVoice[]>([])
  const [recommended, setRecommended] = useState<Array<VoiceOption & { reason: string }>>([])
  const [recsLoading, setRecsLoading] = useState(false)
  const [recsError, setRecsError] = useState('')
  const [allVoices, setAllVoices] = useState<VoiceOption[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [showAllVoices, setShowAllVoices] = useState(false)
  const [voiceGender, setVoiceGender] = useState<'any' | 'female' | 'male'>('any')
  const [voiceSearchKeyword, setVoiceSearchKeyword] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const language = languages[0] ?? 'English'

  // ── sample reel script preview (step 2) ──
  const [sample, setSample] = useState<{ title: string; hook: string; script: string } | null>(null)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [sampleError, setSampleError] = useState('')

  // ── draft persistence: survive reloads / leaving the page until created ──
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        if (typeof d.phase === 'string') setPhase(d.phase)
        if (typeof d.name === 'string') setName(d.name)
        if (typeof d.committedName === 'string') setCommittedName(d.committedName)
        if (typeof d.description === 'string') setDescription(d.description)
        if (typeof d.niche === 'string') setNiche(d.niche)
        if (Array.isArray(d.languages) && d.languages.length) setLanguages(d.languages)
        if (d.presetId === null || typeof d.presetId === 'string') setPresetId(d.presetId)
        if (typeof d.avatarKey === 'string') {
          setAvatarKey(d.avatarKey)
          setAvatarPreview(`/api/asset?key=${encodeURIComponent(d.avatarKey)}`)
        }
        if (typeof d.costCents === 'number') setCostCents(d.costCents)
        if (d.tone) setTone(d.tone)
        if (typeof d.style === 'string') setStyle(d.style)
        if (typeof d.region === 'string') setRegion(d.region)
        if (typeof d.era === 'string') setEra(d.era)
        if (Array.isArray(d.locations)) setLocations(d.locations)
        if (Array.isArray(d.objects)) setObjects(d.objects)
        if (Array.isArray(d.vocab)) setVocab(d.vocab)
        if (d.voiceMode === 'single' || d.voiceMode === 'per_story') setVoiceMode(d.voiceMode)
        if (Array.isArray(d.selectedVoices)) setSelectedVoices(d.selectedVoices)
        if (typeof d.voiceSearchKeyword === 'string') setVoiceSearchKeyword(d.voiceSearchKeyword)
      }
    } catch {
      /* ignore malformed draft */
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          phase, name, committedName, description, niche, languages, presetId,
          avatarKey, costCents, tone, style, region, era, locations, objects, vocab,
          voiceMode, selectedVoices, voiceSearchKeyword,
        }),
      )
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [hydrated, phase, name, committedName, description, niche, languages, presetId, avatarKey, costCents, tone, style, region, era, locations, objects, vocab, voiceMode, selectedVoices, voiceSearchKeyword])

  // Single mode: recommend voices that fit the niche/language/tone (Claude picks
  // from the real catalog). Per-story mode picks voices later, at render time.
  useEffect(() => {
    if (phase !== 'review' || voiceMode !== 'single' || recommended.length > 0 || recsLoading) return
    setRecsLoading(true)
    setRecsError('')
    fetch('/api/voices/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nicheDescription: niche.trim(), language, toneConfig: tone, searchKeyword: voiceSearchKeyword || undefined }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to recommend voices')
        const recs = (json.voices ?? []) as Array<VoiceOption & { reason: string }>
        setRecommended(recs)
        // Pre-select the top pick so Create is ready.
        setSelectedVoices((prev) =>
          prev.length === 0 && recs[0]
            ? [{ providerId: recs[0].id, name: recs[0].name, gender: recs[0].gender, description: recs[0].description }]
            : prev,
        )
      })
      .catch((e) => setRecsError(friendlyError(e, 'Failed to recommend voices')))
      .finally(() => setRecsLoading(false))
  }, [phase, voiceMode, recommended.length, recsLoading, niche, language, tone, voiceSearchKeyword])

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
  // Must pick a mode; single needs a chosen voice, per-story defers to render.
  const canCreate = voiceMode === 'per_story' || (voiceMode === 'single' && selectedVoices.length > 0)

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
        body: JSON.stringify({ name: name.trim(), nicheDescription: niche.trim(), languages }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      const d = json.derived as Derived
      setTone(d.toneConfig)
      setStyle(d.stylePreset)
      setRegion(d.worldBible.region)
      setEra(d.worldBible.era)
      setLocations(d.worldBible.canonLocations ?? [])
      setObjects(d.worldBible.canonObjects ?? [])
      setVocab(Object.entries(d.worldBible.vocabulary ?? {}).map(([term, value]) => ({ term, value })))
      setVoiceSearchKeyword(d.voiceSearchKeyword ?? '')
      setCostCents(json.costCents ?? 0)
      setPhase('review')
    } catch (e) {
      setError(friendlyError(e, 'Generation failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSample() {
    setSampleLoading(true)
    setSampleError('')
    try {
      const vocabulary: Record<string, string> = {}
      for (const { term, value } of vocab) if (term.trim()) vocabulary[term.trim()] = value
      const res = await fetch('/api/channel/sample-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nicheDescription: niche.trim(),
          languages,
          toneConfig: tone,
          worldBible: {
            region: region.trim(),
            era: era.trim(),
            canonLocations: locations.filter((s) => s.trim()),
            canonObjects: objects.filter((s) => s.trim()),
            vocabulary,
          },
          voiceStyle: selectedVoices[0]?.description,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sample failed')
      setSample(json.sample)
    } catch (e) {
      setSampleError(friendlyError(e, 'Sample failed'))
    } finally {
      setSampleLoading(false)
    }
  }

  async function handleCreate() {
    if (!voiceMode) return
    setCreating(true)
    setError('')
    try {
      const vocabulary: Record<string, string> = {}
      for (const { term, value } of vocab) if (term.trim()) vocabulary[term.trim()] = value
      const res = await fetch('/api/channel/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatarKey,
          description: description.trim() || null,
          nicheDescription: niche.trim(),
          languages,
          toneConfig: tone,
          stylePreset: style.trim(),
          worldBible: {
            region: region.trim(),
            era: era.trim(),
            canonLocations: locations.filter((s) => s.trim()),
            canonObjects: objects.filter((s) => s.trim()),
            vocabulary,
          },
          voiceMode,
          voicePool: selectedVoices,
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
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/dashboard" className="btn-ghost btn-sm -ml-1.5" title="Back to portfolio">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold tracking-tight text-ink">New channel</h1>
            <p className="text-xs text-muted">
              {phase === 'describe' ? 'Step 1 · Describe the channel' : 'Step 2 · Review & edit'}
            </p>
          </div>
          <StepDots phase={phase} />
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-5 sm:p-8">
        {error && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {phase === 'describe' ? (
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
                    placeholder="e.g. Aswang Files"
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
                placeholder="e.g. Late-night provincial horror, told like a confession."
                maxLength={140}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink">Niche</label>
              <p className="-mt-1 text-xs text-muted">
                Tap a trending niche to start from a template, or write your own below. Either way you can edit everything.
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
                  <span className="text-xs text-muted">Describe a custom niche</span>
                </button>
              </div>
            </div>

            <Field label="Niche description" hint="What is this channel about? Genre, audience, format, tone — the more specific, the better the result.">
              <textarea
                ref={nicheRef}
                className="input h-36 resize-none"
                value={niche}
                onChange={(e) => { setNiche(e.target.value); setPresetId(null) }}
                placeholder="e.g. Filipino horror narration channel. First-person confessional encounters with supernatural entities set in rural provinces. Tagalog-first with natural Taglish. Slow-burn dread, sensory detail, twist endings."
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

            <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
              <button onClick={handleGenerate} disabled={!canGenerate || loading} className="btn-accent">
                {loading ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden>
                      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    Generate channel profile
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in flex flex-col gap-6">
            {/* Recap */}
            <div className="card flex items-center gap-4 p-5">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="" className="h-12 w-12 flex-shrink-0 rounded-xl object-cover" />
              ) : (
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white"
                  style={{ background: avatarGradient(name || 'channel') }}
                >
                  {avatarInitials(name || '?')}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight text-ink">{name || 'Untitled channel'}</p>
                {description && <p className="truncate text-sm text-muted">{description}</p>}
                <span className="badge mt-1.5 bg-subtle text-muted">{language}</span>
              </div>
            </div>

            <p className="-mb-1 text-xs text-muted">
              We&apos;ve generated this channel&apos;s tone, visual style, and story world from your niche.
              Pick the narrator voice and preview a sample below — the rest stays editable later.
            </p>

            {/* Narrator voice */}
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

              {!voiceMode && (
                <p className="mt-2 text-xs text-faint">Choose one to continue.</p>
              )}

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
                    <p className="text-sm text-danger">{recsError}</p>
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

            {/* Sample reel script */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SectionLabel>Sample reel script</SectionLabel>
                  <p className="mt-1 text-xs text-faint">Preview the channel&apos;s voice from this profile. Not saved — just a gut-check.</p>
                </div>
                <button onClick={handleSample} disabled={sampleLoading} className="btn-secondary btn-sm flex-shrink-0">
                  {sampleLoading ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                      </svg>
                      Writing…
                    </>
                  ) : sample ? 'Regenerate' : 'Preview sample'}
                </button>
              </div>
              {sampleError && <p className="mt-2 text-xs text-danger">{sampleError}</p>}
              {sample && (
                <div className="mt-3 rounded-lg border border-border bg-subtle/40 p-4">
                  <p className="text-sm font-semibold text-ink">{sample.title}</p>
                  <p className="mt-1 text-sm italic text-accent">“{sample.hook}”</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{sample.script}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('describe')} className="btn-secondary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs tabular-nums text-faint">derivation ${(costCents / 100).toFixed(3)}</span>
                <button onClick={handleCreate} disabled={creating || !canCreate} className="btn-accent">
                  {creating ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
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
          // eslint-disable-next-line @next/next/no-img-element
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

function StepDots({ phase }: { phase: 'describe' | 'review' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-1.5 w-6 rounded-full ${phase === 'describe' ? 'bg-accent' : 'bg-border-strong'}`} />
      <span className={`h-1.5 w-6 rounded-full ${phase === 'review' ? 'bg-accent' : 'bg-border-strong'}`} />
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

