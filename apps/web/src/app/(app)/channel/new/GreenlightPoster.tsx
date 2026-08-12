'use client'

// The wizard's right pane: a 4:5 "greenlight poster" that fills in as the brief is answered, so the
// creator watches the channel become a thing instead of filling a form. PURELY PRESENTATIONAL — it
// reads the wizard's existing state and owns none of it, and it never triggers work of its own (the
// background reuses whatever style preview the Visual step already rendered).

const CREW_SEP = '   ·   '

export interface PosterProps {
  stepIndex: number // 0-based PHASE_ORDER index — gates which lines have "landed" yet
  name: string
  description: string
  initials: string
  language: string
  platformLabel: string
  genreTags: string[]
  voiceMode: '' | 'single' | 'per_story'
  voiceName: string
  musicLabel: string
  styleLabel: string
  captionLabel: string
  /** Rendered preview of the chosen visual style, if the Visual step has one. */
  styleImageUrl: string | null
  /** The uploaded avatar, if there is one — it replaces the initials tile. */
  avatarUrl: string | null
}

export function GreenlightPoster({
  stepIndex,
  name,
  description,
  initials,
  language,
  platformLabel,
  genreTags,
  voiceMode,
  voiceName,
  musicLabel,
  styleLabel,
  captionLabel,
  styleImageUrl,
  avatarUrl,
}: PosterProps) {
  // The crew line accumulates as each decision lands — voice, then music, then captions.
  const crew: string[] = []
  if (voiceMode === 'per_story') crew.push('Voice · per story')
  else if (voiceName) crew.push(`Voice · ${voiceName}`)
  if (musicLabel) crew.push(`Music · ${musicLabel}`)
  if (stepIndex >= 4 && captionLabel) crew.push(`Captions · ${captionLabel}`)

  const build = [
    { label: 'Channel', value: name.trim() || '', done: name.trim() !== '' },
    {
      label: 'Narrator',
      value: voiceMode === 'per_story' ? 'Per story' : voiceName,
      done: voiceMode === 'per_story' || voiceName !== '',
    },
    { label: 'Sound', value: musicLabel, done: musicLabel !== '' },
    { label: 'Look', value: styleLabel, done: styleLabel !== '' },
    { label: 'Captions', value: stepIndex >= 4 ? captionLabel : '', done: stepIndex >= 4 && captionLabel !== '' },
  ]

  return (
    <aside className="hidden w-[420px] flex-shrink-0 flex-col overflow-hidden border-l border-border bg-[linear-gradient(180deg,#F6F4FC,#FBFAFF)] xl:flex">
      <div className="flex flex-1 flex-col overflow-y-auto p-[30px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="mono-label text-[#9B7BC8]">Greenlight · live preview</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[#43C08A]" />
            DRAFT 001
          </span>
        </div>

        {/* The poster. Background is the chosen look once one exists, plum until then. */}
        <div
          className="relative aspect-[4/5] w-full flex-shrink-0 overflow-hidden rounded-2xl border border-[#17140F] bg-night-plum shadow-[0_24px_50px_-24px_rgba(30,16,60,0.4)]"
          style={styleImageUrl ? { backgroundImage: `url(${styleImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {!styleImageUrl && <span className="absolute inset-0 bg-[linear-gradient(160deg,#1A0E2E,#4A1A5E_55%,#9B3BFF)]" />}
          {/* Scrim keeps the type legible over any artwork. */}
          <span className="absolute inset-0 bg-[linear-gradient(to_top,rgba(12,8,20,0.92),rgba(12,8,20,0.35)_58%,rgba(12,8,20,0.5))]" />
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_8%,rgba(255,45,155,0.35),transparent_60%),radial-gradient(circle_at_15%_100%,rgba(47,164,255,0.28),transparent_62%)]" />
          {/* Crop marks — the "this is a poster being cut" motif. */}
          <span className="absolute left-2 top-2 h-3.5 w-3.5 border-l border-t border-white/50" />
          <span className="absolute right-2 top-2 h-3.5 w-3.5 border-r border-t border-white/50" />
          <span className="absolute bottom-2 left-2 h-3.5 w-3.5 border-b border-l border-white/50" />
          <span className="absolute bottom-2 right-2 h-3.5 w-3.5 border-b border-r border-white/50" />

          <div className="absolute inset-0 flex flex-col p-[22px]">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/60">
              <span className="truncate">CH · {name.trim() ? name.trim().replace(/\s+/g, '-') : 'UNTITLED'}</span>
              <span className="flex-shrink-0">
                {language.slice(0, 2).toUpperCase()} · {platformLabel}
              </span>
            </div>

            <div className="flex-1" />

            {/* The same tile the picker shows on the left — an uploaded avatar takes it over the moment
                it's chosen, so the poster wears the channel's real face and not its initials. */}
            <div
              className={`mb-3 flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-lg font-display text-[19px] font-800 text-white shadow-[0_10px_26px_-8px_rgba(0,0,0,0.5)] ${
                avatarUrl ? '' : 'bg-pair-purple-pink'
              }`}
            >
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <h2 className="font-display text-[30px] font-900 leading-[0.98] -tracking-[0.02em] text-white">
              {name.trim() || 'Your channel'}
            </h2>
            {description.trim() && (
              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-white/80">{description.trim()}</p>
            )}
            {crew.length > 0 && (
              <p className="mt-2.5 truncate font-mono text-[11px] text-white/90">{crew.join(CREW_SEP)}</p>
            )}
            {genreTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genreTags.map((t) => (
                  <span key={t} className="rounded-2xl border border-white/20 bg-white/[0.14] px-2.5 py-1 text-[11px] font-600 text-white">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Checklist — what the brief has settled so far. */}
        <div className="mt-6">
          <p className="mono-label mb-3">The build so far</p>
          <div className="flex flex-col gap-2.5">
            {build.map((b) => (
              <div key={b.label} className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px] ${
                    b.done ? 'bg-pair-purple-pink' : 'bg-subtle-strong shadow-[inset_0_0_0_1px_#E4E1EE]'
                  }`}
                >
                  {b.done && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-[13px] text-muted">{b.label}</span>
                <span className={b.done ? 'max-w-[170px] truncate text-xs font-600 text-ink' : 'font-mono text-[11px] text-faint-soft'}>
                  {b.done ? b.value : 'Pending'}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9B3BFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="text-xs text-muted">
              First reel in <span className="font-mono font-700 text-ink">~90s</span> once set up
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
