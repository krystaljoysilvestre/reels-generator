'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  type ToneConfig,
  type WorldBible,
  type CaptionStyle,
  type CaptionPreset,
  type TargetPlatform,
  type MusicMood,
  type MusicMode,
  CAPTION_PRESETS,
  PLATFORM_PRESETS,
  MUSIC_MOOD_OPTIONS,
  resolveCaptionStyle,
} from '@reels/core'
import { asGenreModule } from '@reels/core/prompts/scenes.v1'
import { stylesForGenre } from '@reels/core/prompts/story-styles.v1'
import { STORY_VOICES } from '@reels/core/prompts/story-voices.v1'
import { CaptionPreview } from '@/components/CaptionPreview'
import { PlatformPicker } from '@/components/PlatformPicker'
import { Dropdown } from '@/components/Dropdown'
import { VisualStyle } from './VisualStyle'

const SETTINGS_VOICE_OPTIONS = Object.entries(STORY_VOICES).map(([id, v]) => ({ value: id, label: v.label }))
const SETTINGS_INFLUENCE_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'full', label: 'Full' },
]

const TONE_KEYS: Array<keyof ToneConfig> = ['intensity', 'warmth', 'energy', 'pacing', 'humor']
const CAPTION_ORDER: CaptionPreset[] = [
  'pop', 'hype', 'karaoke', 'neon', 'whisper', 'impact', 'elegant', 'clean',
  'comic', 'terminal', 'cinematic', 'breaking', 'marker', 'script', 'retro', 'glitch',
]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface Initial {
  name: string
  description: string
  nicheDescription: string
  tagline: string
  targetPlatform: TargetPlatform
  targetSeconds: number
  stylePreset: string
  styleImageKey: string | null
  genreCategory: string
  narrativeStyle: string
  narrativeVoice: string
  styleInfluence: string
  toneConfig: ToneConfig
  worldBible: WorldBible
  captionStyle: CaptionStyle
  generationMode: 'review' | 'auto'
  musicMood: MusicMood | null // channel-default background-music mood; null = auto (from audioMood)
  musicMode: MusicMode // only AI-music channels expose a mood control
  tasteRubric: string | null // story-critic bar; null = built-in default for the genre
}

export function ChannelSettings({ id, initial }: { id: string; initial: Initial }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [niche, setNiche] = useState(initial.nicheDescription)
  const [tagline, setTagline] = useState(initial.tagline)
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>(initial.targetPlatform)
  const [targetSeconds, setTargetSeconds] = useState(initial.targetSeconds)
  const [stylePreset, setStylePreset] = useState(initial.stylePreset)
  const [styleImageKey, setStyleImageKey] = useState<string | null>(initial.styleImageKey)
  const [tone, setTone] = useState<ToneConfig>(initial.toneConfig)
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(initial.captionStyle)
  const [generationMode, setGenerationMode] = useState<'review' | 'auto'>(initial.generationMode)
  const [musicMood, setMusicMood] = useState<MusicMood | null>(initial.musicMood)
  const [region, setRegion] = useState(initial.worldBible.region ?? '')
  const [era, setEra] = useState(initial.worldBible.era ?? '')
  const [locations, setLocations] = useState((initial.worldBible.canonLocations ?? []).join('\n'))
  const [objects, setObjects] = useState((initial.worldBible.canonObjects ?? []).join('\n'))
  const [vocab, setVocab] = useState<Array<{ term: string; value: string }>>(
    Object.entries(initial.worldBible.vocabulary ?? {}).map(([term, value]) => ({ term, value })),
  )
  const [tasteRubric, setTasteRubric] = useState(initial.tasteRubric ?? '')
  // PROSE dimensions (story-styles / story-voices) — editable post-creation (unlike genre).
  const [narrativeStyle, setNarrativeStyle] = useState(initial.narrativeStyle)
  const [narrativeVoice, setNarrativeVoice] = useState(initial.narrativeVoice)
  const [styleInfluence, setStyleInfluence] = useState<'light' | 'medium' | 'full'>(
    initial.styleInfluence === 'light' || initial.styleInfluence === 'full' ? initial.styleInfluence : 'medium',
  )
  const [mining, setMining] = useState(false)
  const [rubricError, setRubricError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleMineRubric() {
    setMining(true)
    setRubricError('')
    try {
      const res = await fetch('/api/channel/mine-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: id }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? 'That didn’t come through — try again.')
      setTasteRubric(j.rubric)
    } catch (e) {
      setRubricError(e instanceof Error ? e.message : 'That didn’t come through — try again.')
    } finally {
      setMining(false)
    }
  }

  function setTier(k: keyof ToneConfig, v: number) {
    setTone((t) => ({ ...t, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      nicheDescription: niche.trim(),
      tagline: tagline.trim(),
      targetPlatform,
      toneConfig: tone,
      targetSeconds,
      stylePreset: stylePreset.trim(),
      styleImageKey,
      captionStyle,
      generationMode,
      musicMood,
      tasteRubric: tasteRubric.trim() || null,
      narrativeStyle,
      narrativeVoice,
      styleInfluence,
      worldBible: {
        region: region.trim(),
        era: era.trim(),
        canonLocations: locations.split('\n').map((s) => s.trim()).filter(Boolean),
        canonObjects: objects.split('\n').map((s) => s.trim()).filter(Boolean),
        vocabulary: Object.fromEntries(vocab.filter((v) => v.term.trim()).map((v) => [v.term.trim(), v.value])),
      },
    }
    try {
      const res = await fetch(`/api/channel/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error ?? 'Save failed')
      }
      router.push(`/channel/${id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button onClick={() => router.push(`/channel/${id}`)} className="btn-ghost btn-sm -ml-1.5" title="Back to channel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <h1 className="flex-1 text-base font-semibold tracking-tight text-ink">Channel settings</h1>
          <button onClick={handleSave} disabled={saving || !name.trim() || !niche.trim()} className="btn-accent btn-sm">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 p-8">
        {error && <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

        {/* Identity */}
        <section className="card space-y-4 p-5">
          <SectionLabel>Identity</SectionLabel>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="input" />
          </Field>
          <Field label="Description" hint="Optional — shown on the channel card/header.">
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} className="input" />
          </Field>
          <Field label="Tagline" hint="One-line positioning.">
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={200} className="input" />
          </Field>
        </section>

        {/* Generation mode */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Creating reels</SectionLabel>
          <div className="flex flex-col gap-2">
            {([
              { key: 'review', label: 'With reviews', sub: 'Stop to approve the story, edit the storyboard, and check the cut on every reel.' },
              { key: 'auto', label: 'Fully automated', sub: 'Take each reel all the way to a finished video — no stops. Publishing stays manual.' },
            ] as const).map((opt) => (
              <label
                key={opt.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${generationMode === opt.key ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}
              >
                <input type="radio" name="generationMode" checked={generationMode === opt.key} onChange={() => setGenerationMode(opt.key)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent" />
                <span>
                  <span className="block text-sm font-medium text-ink">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{opt.sub}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* Niche */}
        <section className="card space-y-4 p-5">
          <SectionLabel>Niche</SectionLabel>
          <textarea value={niche} onChange={(e) => setNiche(e.target.value)} rows={4} maxLength={8000} className="input resize-y" />
        </section>

        {/* Tone */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Tone</SectionLabel>
          {TONE_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-20 text-sm capitalize text-muted">{k}</span>
              <input
                type="range" min={0} max={10} value={Number(tone[k] ?? 0)}
                onChange={(e) => setTier(k, Number(e.target.value))}
                className="flex-1 accent-accent"
              />
              <span className="w-6 text-right font-mono text-xs tabular-nums text-ink">{Number(tone[k] ?? 0)}</span>
            </div>
          ))}
        </section>

        {/* Story taste — the bar the story critic scores candidate drafts against */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Story taste</SectionLabel>
          <p className="text-xs text-muted">
            What separates a story worth publishing from one that gets cut. Every new script has to clear it before it reaches you.
          </p>
          <textarea
            value={tasteRubric}
            onChange={(e) => setTasteRubric(e.target.value)}
            rows={8}
            maxLength={4000}
            placeholder="Leave empty to use the house bar for this genre."
            className="input resize-y font-mono text-xs leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleMineRubric} disabled={mining} className="btn-secondary btn-sm">
              {mining ? 'Studying your decisions…' : 'Write it for me'}
            </button>
            <p className="text-xs text-faint">Drafted from the stories you’ve kept and the ones you’ve cut.</p>
          </div>
          {rubricError && <p className="text-xs text-danger">{rubricError}</p>}
        </section>

        {/* Background music — AI-music channels only. Sets the default bed mood; each reel can override it. */}
        {initial.musicMode === 'ai' && (
          <section className="card space-y-3 p-5">
            <SectionLabel>Background music</SectionLabel>
            <p className="text-xs text-muted">The default mood for every reel&rsquo;s bed. Any reel can override it on its storyboard.</p>
            <select
              value={musicMood ?? ''}
              onChange={(e) => setMusicMood(e.target.value === '' ? null : (e.target.value as MusicMood))}
              className="input"
            >
              <option value="">Auto — from the channel&rsquo;s sound</option>
              {MUSIC_MOOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
              ))}
            </select>
          </section>
        )}

        {/* Target platform */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Target platform</SectionLabel>
          <PlatformPicker
            value={targetPlatform}
            onChange={(v) => {
              setTargetPlatform(v)
              setTargetSeconds((s) => Math.min(s, PLATFORM_PRESETS[v].maxSeconds))
            }}
          />
        </section>

        {/* Reel length */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Reel length</SectionLabel>
          <div className="flex items-center gap-3">
            <input
              type="range" min={15} max={PLATFORM_PRESETS[targetPlatform].maxSeconds} step={5} value={targetSeconds}
              onChange={(e) => setTargetSeconds(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="w-14 text-right font-mono text-xs tabular-nums text-ink">~{targetSeconds}s</span>
          </div>
          <p className="text-xs text-faint">Capped at {PLATFORM_PRESETS[targetPlatform].maxSeconds}s for {PLATFORM_PRESETS[targetPlatform].label}.</p>
        </section>

        {/* Storytelling style — the prose tradition + narrator voice (NOT the visual look or TTS voice) */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Storytelling style</SectionLabel>
          <p className="text-xs text-faint">The tradition this channel tells stories in and how the narrator sounds on the page.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {stylesForGenre(asGenreModule(initial.genreCategory) ?? 'general').length > 0 && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Style
                <Dropdown
                  value={narrativeStyle}
                  onChange={setNarrativeStyle}
                  options={[{ value: '', label: 'Pure genre (no style)' }, ...stylesForGenre(asGenreModule(initial.genreCategory) ?? 'general').map((s) => ({ value: s.id, label: s.label }))]}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Narrator voice
              <Dropdown
                value={narrativeVoice}
                onChange={setNarrativeVoice}
                options={[{ value: '', label: 'Default (genre voice)' }, ...SETTINGS_VOICE_OPTIONS]}
              />
            </label>
            {narrativeStyle && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Style strength
                <Dropdown value={styleInfluence} onChange={(v) => setStyleInfluence(v as 'light' | 'medium' | 'full')} options={SETTINGS_INFLUENCE_OPTIONS} />
              </label>
            )}
          </div>
        </section>

        {/* Captions */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Captions</SectionLabel>
          <CaptionPreview key={captionStyle.preset} style={captionStyle} safeZonePct={PLATFORM_PRESETS[targetPlatform].safeZoneBottomPct} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CAPTION_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCaptionStyle(resolveCaptionStyle(p, { highlightColor: captionStyle.highlightColor, color: captionStyle.color }))}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${captionStyle.preset === p ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent' : 'border-border-strong text-muted hover:bg-subtle'}`}
              >
                {cap(p)}
              </button>
            ))}
          </div>
        </section>

        {/* Visual style — preset gallery + opt-in custom generation */}
        <VisualStyle
          genre={initial.genreCategory}
          niche={niche}
          tone={tone}
          worldBible={{
            region: region.trim(),
            era: era.trim(),
            canonLocations: locations.split('\n').map((s) => s.trim()).filter(Boolean),
            canonObjects: objects.split('\n').map((s) => s.trim()).filter(Boolean),
            vocabulary: Object.fromEntries(vocab.filter((v) => v.term.trim()).map((v) => [v.term.trim(), v.value])),
          }}
          stylePreset={stylePreset}
          styleImageKey={styleImageKey}
          onChange={(sp, sk) => { setStylePreset(sp); setStyleImageKey(sk) }}
        />

        {/* World bible */}
        <section className="card space-y-4 p-5">
          <SectionLabel>Story world</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Region"><input value={region} onChange={(e) => setRegion(e.target.value)} className="input" /></Field>
            <Field label="Era"><input value={era} onChange={(e) => setEra(e.target.value)} className="input" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Canon locations" hint="One per line."><textarea value={locations} onChange={(e) => setLocations(e.target.value)} rows={4} className="input resize-y" /></Field>
            <Field label="Canon objects" hint="One per line."><textarea value={objects} onChange={(e) => setObjects(e.target.value)} rows={4} className="input resize-y" /></Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Vocabulary</p>
            <div className="space-y-2">
              {vocab.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={row.term} placeholder="term"
                    onChange={(e) => setVocab((v) => v.map((r, j) => (j === i ? { ...r, term: e.target.value } : r)))}
                    className="input w-1/3"
                  />
                  <input
                    value={row.value} placeholder="how this channel refers to it"
                    onChange={(e) => setVocab((v) => v.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                    className="input flex-1"
                  />
                  <button onClick={() => setVocab((v) => v.filter((_, j) => j !== i))} className="btn-ghost btn-sm" title="Remove">✕</button>
                </div>
              ))}
              <button onClick={() => setVocab((v) => [...v, { term: '', value: '' }])} className="btn-secondary btn-sm">+ Add term</button>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <button onClick={() => router.push(`/channel/${id}`)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !niche.trim()} className="btn-accent">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-faint">{children}</p>
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
