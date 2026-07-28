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
import { GENRE_OPTIONS, PRESENTATION_OPTIONS } from '@/lib/genre-labels'
import { stylesForGenre } from '@reels/core/prompts/story-styles.v1'
import { STORY_VOICES } from '@reels/core/prompts/story-voices.v1'
import { CaptionPreview } from '@/components/CaptionPreview'
import { PlatformPicker } from '@/components/PlatformPicker'
import { Dropdown } from '@/components/Dropdown'
import { VisualStyle } from './VisualStyle'
import { ChannelAvatar } from '@/components/ChannelAvatar'

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
  avatarKey: string | null
  description: string
  nicheDescription: string
  tagline: string
  targetPlatform: TargetPlatform
  targetSeconds: number
  stylePreset: string
  styleImageKey: string | null
  genreCategory: string
  presentation: '' | 'voiceover' | 'hosted' // how narration reaches the audience (analyzer context)
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
  autoProduce: { enabled: boolean; reelsPerDay: number; startHourUtc: number; autoPublishYouTube: boolean } // the consistency engine cadence
  publish: { mode: 'immediate' | 'slots'; slotsUtc: number[]; daysUtc: number[] } // when a finished reel goes out
  youtubeConfigured: boolean // YOUTUBE_* env keys present → auto-publish is offerable
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Slots are stored as UTC hours but shown in the operator's own time, so a slot can sit on a
// different weekday than the one we store. This maps each visible day back to the UTC day that
// actually lands on it, so picking "Fri" means the Friday the operator sees.
function localDayShift(hourUtc: number): number {
  const probe = new Date(Date.UTC(2001, 0, 7, hourUtc)) // 2001-01-07 was a Sunday
  return (probe.getDay() - probe.getUTCDay() + 7) % 7
}

function formatHour(hourUtc: number): string {
  return new Date(Date.UTC(2000, 0, 1, hourUtc)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: formatHour(h) }))

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
  const [autoProduce, setAutoProduce] = useState(initial.autoProduce)
  const [publish, setPublish] = useState(initial.publish)
  const [musicMood, setMusicMood] = useState<MusicMood | null>(initial.musicMood)
  const [region, setRegion] = useState(initial.worldBible.region ?? '')
  const [era, setEra] = useState(initial.worldBible.era ?? '')
  const [locations, setLocations] = useState((initial.worldBible.canonLocations ?? []).join('\n'))
  const [objects, setObjects] = useState((initial.worldBible.canonObjects ?? []).join('\n'))
  const [vocab, setVocab] = useState<Array<{ term: string; value: string }>>(
    Object.entries(initial.worldBible.vocabulary ?? {}).map(([term, value]) => ({ term, value })),
  )
  const [tasteRubric, setTasteRubric] = useState(initial.tasteRubric ?? '')
  // Genre (the kind of story) — derived by AI at creation, correctable here. Changing it re-scopes
  // everything downstream (writer, registers, scene grammar, voice delivery, styles gallery).
  const [genreCategory, setGenreCategory] = useState(initial.genreCategory)
  // Presentation — how the audience receives the narration; a bias the analyzer reasons from (each story
  // still decides for itself). A separate axis from genre; see hypotheses/voiceover-perspective.md.
  const [presentation, setPresentation] = useState<'' | 'voiceover' | 'hosted'>(initial.presentation)
  // PROSE dimensions (story-styles / story-voices) — editable post-creation.
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
      autoProduce,
      publish,
      genreCategory,
      presentation,
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
          <ChannelAvatar name={initial.name} avatarKey={initial.avatarKey} className="h-9 w-9" textClass="text-xs" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-700 -tracking-[0.02em] text-ink">{initial.name}</h1>
            <p className="truncate text-xs text-muted">Channel settings</p>
          </div>
          <button onClick={() => router.push(`/channel/${id}`)} className="btn-secondary btn-sm">Cancel</button>
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
                className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-4 transition-colors ${generationMode === opt.key ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-mid hover:border-accent-ring hover:bg-subtle'}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-700 text-ink">{opt.label}</span>
                  <span className="mt-1 block text-xs leading-normal text-muted">{opt.sub}</span>
                </span>
                <input type="radio" name="generationMode" checked={generationMode === opt.key} onChange={() => setGenerationMode(opt.key)} className="sr-only" />
                {/* Selected reads as a filled gradient check, per the mock */}
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${generationMode === opt.key ? 'border-transparent bg-brand-3 text-white' : 'border-border-strong'}`}
                >
                  {generationMode === opt.key && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                </span>
              </label>
            ))}
          </div>

          {/* Auto-produce cadence — the consistency engine */}
          <div className="border-t border-border pt-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={autoProduce.enabled}
                onChange={(e) => setAutoProduce((a) => ({ ...a, enabled: e.target.checked }))}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium text-ink">Keep the shelf stocked</span>
                <span className="mt-0.5 block text-xs text-muted">
                  New reels start on their own, every day — no button to press.
                  {generationMode === 'review'
                    ? ' Each one waits for your story approval, so you’ll find drafts in the review queue.'
                    : ' Each one runs all the way to a finished video, ready to download.'}
                  {' '}Production pauses if unposted reels pile up.
                </span>
              </span>
            </label>
            {autoProduce.enabled && (
              <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                  Reels a day
                  <Dropdown
                    value={String(autoProduce.reelsPerDay)}
                    onChange={(v) => setAutoProduce((a) => ({ ...a, reelsPerDay: Number(v) || 1 }))}
                    options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: n === 1 ? '1 reel' : `${n} reels` }))}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                  Starting at
                  <Dropdown
                    value={String(autoProduce.startHourUtc)}
                    onChange={(v) => setAutoProduce((a) => ({ ...a, startHourUtc: Number(v) || 0 }))}
                    options={HOUR_OPTIONS}
                  />
                </label>
              </div>
            )}
          </div>
        </section>

        {/* Publishing — WHEN a finished reel goes out (the section above is when reels get MADE) */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Publishing</SectionLabel>
          <p className="text-xs text-muted">
            {autoProduce.autoPublishYouTube && initial.youtubeConfigured && generationMode === 'auto'
              ? 'Finished reels are posted for you — the schedule below decides when.'
              : 'Nothing posts by itself. Your posting times go on every post package, so you keep the same rhythm by hand.'}
          </p>

          {initial.youtubeConfigured && generationMode === 'auto' && (
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={autoProduce.autoPublishYouTube}
                onChange={(e) => setAutoProduce((a) => ({ ...a, autoPublishYouTube: e.target.checked }))}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium text-ink">Post to YouTube on its own</span>
                <span className="mt-0.5 block text-xs text-muted">Finished reels go straight to your YouTube channel — title, caption, and AI label included.</span>
              </span>
            </label>
          )}

          <div className={initial.youtubeConfigured && generationMode === 'auto' ? 'border-t border-border pt-3' : ''}>
            <p className="text-xs font-medium text-muted">When to post</p>
            <div className="mt-2 flex flex-col gap-2">
              {([
                { key: 'immediate', label: 'As soon as it’s ready', sub: 'Each reel goes out the moment it’s finished.' },
                { key: 'slots', label: 'On a posting schedule', sub: 'Reels wait for your next posting time, so the channel keeps a rhythm.' },
              ] as const).map((opt) => (
                <label
                  key={opt.key}
                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${publish.mode === opt.key ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-mid hover:border-accent-ring hover:bg-subtle'}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-700 text-ink">{opt.label}</span>
                    <span className="mt-0.5 block text-xs leading-normal text-muted">{opt.sub}</span>
                  </span>
                  <input type="radio" name="publishMode" checked={publish.mode === opt.key} onChange={() => setPublish((p) => ({ ...p, mode: opt.key }))} className="sr-only" />
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${publish.mode === opt.key ? 'border-transparent bg-brand-3 text-white' : 'border-border-strong'}`}
                  >
                    {publish.mode === opt.key && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                </label>
              ))}
            </div>

            {publish.mode === 'slots' && (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted">Days</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {DAY_LABELS.map((label, localDay) => {
                      // Each chip is the operator's day; the stored value is the matching UTC day.
                      const utcDay = (localDay - localDayShift(publish.slotsUtc[0] ?? 13) + 7) % 7
                      const on = publish.daysUtc.includes(utcDay)
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPublish((p) => ({
                              ...p,
                              daysUtc: on ? p.daysUtc.filter((d) => d !== utcDay) : [...p.daysUtc, utcDay],
                            }))
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-600 transition-colors ${on ? 'border-accent bg-accent-soft text-accent' : 'border-border-mid text-muted hover:border-accent-ring hover:bg-subtle'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {publish.daysUtc.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted">Pick at least one day, or reels will post every day.</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-muted">Times</p>
                  <p className="mt-0.5 text-xs text-muted">Shown in your time. One reel goes out per time slot.</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {publish.slotsUtc.map((hour, i) => (
                      <div key={`${hour}-${i}`} className="flex items-center gap-2">
                        <div className="w-40">
                          <Dropdown
                            value={String(hour)}
                            onChange={(v) =>
                              setPublish((p) => ({
                                ...p,
                                slotsUtc: p.slotsUtc.map((h, j) => (j === i ? Number(v) || 0 : h)),
                              }))
                            }
                            options={HOUR_OPTIONS}
                          />
                        </div>
                        {publish.slotsUtc.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setPublish((p) => ({ ...p, slotsUtc: p.slotsUtc.filter((_, j) => j !== i) }))}
                            className="btn-ghost btn-sm"
                            title="Remove this time"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {publish.slotsUtc.length < 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPublish((p) => {
                          const next = [...p.slotsUtc]
                          const last = next[next.length - 1] ?? 13
                          next.push((last + 4) % 24)
                          return { ...p, slotsUtc: next }
                        })
                      }
                      className="btn-secondary btn-sm mt-2"
                    >
                      Add a time
                    </button>
                  )}
                  {autoProduce.enabled && publish.slotsUtc.length < autoProduce.reelsPerDay && (
                    <p className="mt-2 text-xs text-[#9A6B12]">
                      You make {autoProduce.reelsPerDay} reels a day but only have {publish.slotsUtc.length}{' '}
                      {publish.slotsUtc.length === 1 ? 'time' : 'times'} to post them — the extras wait for a later day.
                    </p>
                  )}
                </div>
              </div>
            )}
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

        {/* Storytelling style — the kind of story + prose tradition + narrator voice (NOT the visual look or TTS voice) */}
        <section className="card space-y-3 p-5">
          <SectionLabel>Storytelling style</SectionLabel>
          <p className="text-xs text-faint">
            The kind of story this channel tells, the tradition it works in, and how the narrator sounds on the page.
            Mixing genres? Pick the dominant one — your channel description carries the blend.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              Kind of story
              <Dropdown
                value={asGenreModule(genreCategory) ?? 'general'}
                onChange={(v) => {
                  setGenreCategory(v)
                  setNarrativeStyle('') // styles are scoped to the genre — a switch resets to pure genre
                }}
                options={GENRE_OPTIONS}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              On-screen narrator
              <Dropdown
                value={presentation}
                onChange={(v) => setPresentation(v as '' | 'voiceover' | 'hosted')}
                options={PRESENTATION_OPTIONS}
              />
            </label>
            {stylesForGenre(asGenreModule(genreCategory) ?? 'general').length > 0 && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                Style
                <Dropdown
                  value={narrativeStyle}
                  onChange={setNarrativeStyle}
                  options={[{ value: '', label: 'Pure genre (no style)' }, ...stylesForGenre(asGenreModule(genreCategory) ?? 'general').map((s) => ({ value: s.id, label: s.label }))]}
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
          genre={genreCategory}
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
  return <p className="micro-label">{children}</p>
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {/* The mock sets the hint inline after the label ("Description · shown on the channel card"). */}
      <label className="text-sm font-600 text-ink">
        {label}
        {hint && <span className="ml-1.5 font-400 text-faint">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}
