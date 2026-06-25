'use client'

import { useState } from 'react'
import { presetsForGenre, stylePresetThumbKey, type ToneConfig, type WorldBible } from '@reels/core'

// Channel visual style: pick from the preset gallery (free — thumbnails pre-rendered once) OR generate a
// bespoke, channel-specific look on demand ("Customize look" — paid image renders, opt-in). Selecting any
// option reports { stylePreset, styleImageKey } up to ChannelSettings, which persists on Save.

type Proposal = { label: string; description: string; stylePreset: string }
type Preview = { loading?: boolean; imageKey?: string; error?: string }

const assetUrl = (key: string) => `/api/asset?key=${encodeURIComponent(key)}`

export function VisualStyle({
  genre, niche, tone, worldBible, stylePreset, styleImageKey, onChange,
}: {
  genre: string
  niche: string
  tone: ToneConfig
  worldBible: WorldBible
  stylePreset: string
  styleImageKey: string | null
  onChange: (stylePreset: string, styleImageKey: string | null) => void
}) {
  const presets = presetsForGenre(genre)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)
  const [sampleScene, setSampleScene] = useState('')
  const [previews, setPreviews] = useState<Record<number, Preview>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showManual, setShowManual] = useState(false)

  async function generate() {
    setLoading(true); setError(''); setProposals(null); setPreviews({})
    try {
      const res = await fetch('/api/channel/style-options', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheDescription: niche.trim(), toneConfig: tone, worldBible }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not generate looks')
      const styles = (json.styles ?? []) as Proposal[]
      setSampleScene(json.sampleScene ?? '')
      setProposals(styles)
      styles.forEach((p, i) => void preview(i, p, json.sampleScene ?? ''))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate looks')
    } finally {
      setLoading(false)
    }
  }

  async function preview(idx: number, p: Proposal, scene: string) {
    setPreviews((s) => ({ ...s, [idx]: { loading: true } }))
    try {
      const res = await fetch('/api/channel/style-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stylePreset: p.stylePreset, sampleScene: scene }),
      })
      const json = await res.json()
      if (!res.ok) { setPreviews((s) => ({ ...s, [idx]: { error: json.error ?? 'Preview failed' } })); return }
      setPreviews((s) => ({ ...s, [idx]: { imageKey: json.imageKey } }))
    } catch {
      setPreviews((s) => ({ ...s, [idx]: { error: 'Preview failed' } }))
    }
  }

  function Card({ imgKey, label, selected, onPick }: { imgKey?: string | undefined; label: string; selected: boolean; onPick: () => void }) {
    return (
      <button
        type="button"
        onClick={onPick}
        title={label}
        className={`group relative aspect-[9/16] overflow-hidden rounded-lg border transition-all ${selected ? 'border-accent ring-2 ring-accent' : 'border-border-strong hover:border-accent/60'}`}
      >
        {imgKey ? (
          <img src={assetUrl(imgKey)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full animate-shimmer bg-gradient-to-r from-subtle via-surface to-subtle bg-[length:200%_100%]" />
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/85 via-ink/40 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium leading-tight text-white">
          {label}
        </span>
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white shadow-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          </span>
        )}
      </button>
    )
  }

  return (
    <section className="card space-y-3 p-5">
      <SectionLabel>Visual style</SectionLabel>
      <p className="text-xs text-faint">Pick a look from the gallery, or generate a custom one tailored to this channel. Changes apply to new reels; ones you&apos;ve already made keep their look.</p>

      {/* Preset gallery — free (thumbnails pre-rendered once) */}
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {presets.map((p) => {
          const key = stylePresetThumbKey(p.id)
          return <Card key={p.id} imgKey={key} label={p.label} selected={styleImageKey === key} onPick={() => onChange(p.stylePreset, key)} />
        })}
      </div>

      {/* Customize — bespoke, on demand (paid renders) */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" onClick={() => void generate()} disabled={loading || !niche.trim()} className="btn-secondary btn-sm disabled:opacity-50">
          {loading ? (
            <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Generating…</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9z" /></svg>Customize look</>
          )}
        </button>
        <span className="text-[11px] text-faint">Generates a few looks made for this channel (renders preview images — a few cents each).</span>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Generated custom looks */}
      {proposals && proposals.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {proposals.map((p, i) => {
            const pv = previews[i]
            const key = pv?.imageKey
            return (
              <Card
                key={i}
                imgKey={key}
                label={p.label}
                selected={!!key && styleImageKey === key}
                onPick={() => { if (key) onChange(p.stylePreset, key) }}
              />
            )
          })}
        </div>
      )}

      {/* Advanced: edit the raw DNA */}
      <button type="button" onClick={() => setShowManual((s) => !s)} className="text-[11px] font-medium text-muted hover:text-ink">
        {showManual ? 'Hide' : 'Edit style description manually'}
      </button>
      {showManual && (
        <textarea
          value={stylePreset}
          onChange={(e) => onChange(e.target.value, styleImageKey)}
          rows={4}
          className="input resize-y text-xs leading-relaxed"
          placeholder="Describe the look — medium, mood, colour, lighting…"
        />
      )}
      {sampleScene && proposals && <p className="text-[11px] text-faint">Previewed on: {sampleScene}</p>}
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-faint">{children}</p>
}
