'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NICHE_PRESETS, findPreset, trendingId } from './niche-presets'
import { SUPPORTED_LANGUAGES } from './languages'
import { Dropdown } from '@/components/Dropdown'
import { avatarGradient, avatarInitials } from '@/components/ChannelAvatar'
import { CaptionPreview } from '@/components/CaptionPreview'
import { PlatformPicker } from '@/components/PlatformPicker'
import { type CaptionPreset, type CaptionStyle, type TargetPlatform, type AudioMood, resolveCaptionStyle, CaptionStyleSchema, resolvePlatformPreset, PUBLISH_PLATFORMS, PRESET_BEDS, rankPresets, presetsForGenre, stylePresetThumbKey, sampleSceneForGenre } from '@reels/core'
import { SOURCE_POLICY_CHOICES, mustAskSourcePolicy, type SourcePolicy } from '@reels/core'
import { type GenreModule, asGenreModule } from '@reels/core/prompts/scenes.v1'
import { stylesForGenre } from '@reels/core/prompts/story-styles.v1'
import { GENRE_OPTIONS, genreLabel } from '@/lib/genre-labels'
import { getTrendingNiches, type TrendingNiche } from '@/lib/trending-niches'
import { KendrixMark } from '@/components/Wordmark'
import { GreenlightPoster } from './GreenlightPoster'

type StyleInfluence = 'light' | 'medium' | 'full'

// v2: caption persistence changed from preset+highlight to a resolved captionStyle object.
// Bumping the key drops pre-v2 drafts (which would otherwise fall back to the default
// caption look) instead of half-restoring them.
const DRAFT_KEY = 'reels:new-channel-draft:v2'

// Most LLM question-rounds the clarify loop may spend on one pitch identity (the curated genre-tile
// round is free and uncounted). The model ending the loop by having nothing to ask is the designed
// exit; this is the cost/patience backstop (~1¢ a round).
const CLARIFY_MAX_ROUNDS = 3

// Longest niche description the channel APIs accept — every route that takes one caps at this,
// so raising it here alone would just move the rejection server-side.
const NICHE_MAX = 8000

type Phase = 'describe' | 'script' | 'voice' | 'sound' | 'visual'
const PHASE_ORDER: Phase[] = ['describe', 'script', 'voice', 'sound', 'visual']
// The display heading for each step; the step number comes from PHASE_ORDER.
const STEP_TITLE: Record<Phase, string> = {
  describe: 'Pitch your channel',
  script: "Teach the channel's voice",
  voice: 'Pick the narrator voice',
  sound: 'Set the sound',
  visual: 'Choose the visual style',
}
// One line under each heading saying what this step decides — the brief reads as a brief.
const STEP_SUB: Record<Phase, string> = {
  describe: 'One publishing brand — its niche, voice, look and rules. Fill the brief; the poster builds as you go.',
  script: 'Show us how it should sound. Paste a real opening, or have one written to preview the voice.',
  voice: 'One voice for the whole channel, or a fresh pick per reel.',
  sound: 'Choose the music bed under every reel.',
  visual: 'Lock the look and the caption style — the final piece.',
}
// Short labels for the header timeline.
const STEP_TAB: Record<Phase, string> = {
  describe: 'Describe',
  script: 'Script',
  voice: 'Voice',
  sound: 'Sound',
  visual: 'Visual',
}
// Compact labels for the poster's slate line and checklist (the pickers keep their own fuller copy).
const PLATFORM_LABELS: Record<TargetPlatform, string> = {
  tiktok: 'TikTok',
  youtube_shorts: 'Shorts',
  facebook_reels: 'Reels',
  youtube_long: 'Long-form',
  all: 'All',
}
const MUSIC_LABELS: Record<'preset' | 'ai' | 'upload' | 'none', string> = {
  ai: 'Original score',
  preset: 'From our library',
  upload: 'Your own music',
  none: 'No music',
}

// After the API's own timeout + retries, a transient failure surfaces here —
// show a clear "try again" instead of a raw SDK message.
function friendlyError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : fallback
  return /connection|timeout|timed out|network|fetch failed|502|ECONN/i.test(msg)
    ? 'Couldn’t connect — please try again.'
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
  // The channel's own rules, compiled from the creator's own words. '' when the idea states none.
  editorialPrinciples?: string
  // Absent when the pitch left it genuinely ambiguous — the wizard then ASKS (mustAskSourcePolicy).
  sourcePolicy?: SourcePolicy
  genreCategory: GenreModule
  presentation?: '' | 'voiceover' | 'hosted'
  narrativeStyle?: string
  narrativeVoice?: string
  audioMood: AudioMood
  // Follow-ups for dimensions the description left open — asked once, answers appended to the niche.
  clarifyingQuestions?: Array<{ question: string; examples: string; prefix: string }>
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
// The picture on a style card: a pre-rendered preset thumbnail or an uploaded reference. Nothing in
// the wizard renders one on demand any more, so there is no loading or error state to model — a card
// with no key just shows its placeholder. `error` stays readable because drafts saved by the old
// paid-preview flow can still carry one.
interface PreviewState {
  imageKey?: string
  error?: string
}

export function NewChannelWizard({
  initialDraft = null,
  initialDraftChannelId = null,
  initialPresetId = null,
  initialTrendingId = null,
}: {
  initialDraft?: Record<string, unknown> | null // stored wizard state when resuming a saved draft
  initialDraftChannelId?: string | null // the draft channel's id, so finishing promotes that same row
  // Deep links from the dashboard's quick-start cards — a curated preset id, or a trending card's
  // slug. Both are applied ONCE on arrival, and only over an untouched brief (a resumed draft wins).
  initialPresetId?: string | null
  initialTrendingId?: string | null
} = {}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('describe')

  // ── describe inputs ──
  const [name, setName] = useState('')
  const [committedName, setCommittedName] = useState('') // drives avatar color; updated on blur to avoid per-keystroke flicker
  const [description, setDescription] = useState('')
  // The card line a preset last filled in. Picking a preset seeds the description too, but only while
  // it's still ours to overwrite — the moment the creator types their own, this stops matching and we
  // leave it alone.
  const [seededDescription, setSeededDescription] = useState('')
  // The name is the ONE field never filled in for the creator — it's their channel's identity, and a
  // suggested name that survives to publish is a channel nobody chose. Emptiness is flagged at the
  // moment of commitment (handleNext) instead of disabling the button: a dead button never says why.
  const [nameMissing, setNameMissing] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [niche, setNiche] = useState('')
  const [languages, setLanguages] = useState<string[]>(['English'])
  // Every feed this channel posts to — shapes caption/length derivation + render presets. A SET, because
  // creators cross-post; the reel is cut to the spec satisfying all of them (resolvePlatformPreset).
  const [targetPlatforms, setTargetPlatforms] = useState<TargetPlatform[]>(['tiktok', 'youtube_shorts', 'facebook_reels'])
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
  // Once the creator sets burn-captions themselves, switching platform stops overriding their choice.
  const [captionsTouched, setCaptionsTouched] = useState(false)
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
  // The channel's OWN rules, compiled by channel.v1 from rules the creator actually wrote. Composed
  // onto the editorial gate's rubric (never replacing it). '' whenever the idea states no rule — the
  // common, correct case — and the gate then uses its built-in bar for the genre.
  const [editorialPrinciples, setEditorialPrinciples] = useState('')
  // SOURCE POLICY — what this channel may treat as REAL. Derived when the pitch makes it clear; when it
  // doesn't, we ASK, because guessing is unsafe in both directions (invent where the channel is about
  // real documented things, or name real people where the creator wanted pure fiction).
  // Pre-selected to the safest option rather than left blank: this must never be a silent default, and
  // it must never be required work either — so skipping means accepting a choice they can SEE.
  const [sourcePolicy, setSourcePolicy] = useState<SourcePolicy>(SOURCE_POLICY_CHOICES[0]!.value)
  const [askPolicy, setAskPolicy] = useState(false)
  // AI-derived genre bucket → picks the writer identity + scene-prompt genre module. '' until derived;
  // the create route keyword-classifies the niche as a fallback when this is empty.
  const [genreCategory, setGenreCategory] = useState<'' | GenreModule>('')
  const [presentation, setPresentation] = useState<'' | 'voiceover' | 'hosted'>('')
  // PROSE dimensions (story-styles / story-voices) — derived as a default, operator-overridable.
  // NOT the visual `style`/`stylePreset` or the TTS voice. '' = pure genre / identity-default voice.
  const [narrativeStyle, setNarrativeStyle] = useState('')
  const [narrativeVoice, setNarrativeVoice] = useState('')
  const [styleInfluence, setStyleInfluence] = useState<StyleInfluence>('medium')
  // Step 2 states the derived style instead of asking for it; this opens the overrides.
  const [styleOpen, setStyleOpen] = useState(false)
  const [tagline, setTagline] = useState('') // AI-derived one-line positioning (persisted on the channel)
  // Follow-up questions from the derive (dimensions the description left open). Answers append to the
  // niche text and re-derive. `clarifyHandledText` remembers WHICH niche text was already asked about —
  // so a rewritten channel idea gets fresh questions, while the answer-append re-derive (pre-marked as
  // handled) can't loop into asking again.
  const [clarify, setClarify] = useState<Array<{ question: string; examples: string; prefix: string }>>([])
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({})
  const [clarifyHandledText, setClarifyHandledText] = useState('')
  // Follow-up-question fetch for a pitch the creator wrote themselves (genre tiles ship curated ones).
  // The card LOOPS: "Add & continue" folds the answers into the pitch and asks for the next round of
  // questions on the enriched text, until the model says the pitch is complete (returns none) or the
  // round cap is hit. Skip bows out any time; the footer CTA bails out of the loop into the build.
  const clarifyFetchRef = useRef<AbortController | null>(null) // in-flight fetch — a derive or unmount aborts it
  const clarifyAskedRef = useRef('') // last text asked about: one ask per distinct text, even if it returned none
  const clarifyCardRef = useRef<HTMLDivElement>(null) // scrolled into view when questions arrive post-derive
  const clarifyRoundsRef = useRef(0) // LLM rounds spent on this pitch identity (the curated tile round is free)
  const [clarifyLoading, setClarifyLoading] = useState(false) // a next-round fetch is in flight (card buttons lock)
  const [clarifyDone, setClarifyDone] = useState(false) // the model had no more questions — the pitch is complete
  // "Trending now" rail — live web-searched niches (server caches for a day; hidden when empty/unavailable).
  // Sits ABOVE the static presets, so a skeleton holds its space while loading (no layout jump).
  const [trending, setTrending] = useState<TrendingNiche[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const language = languages[0] ?? 'English'
  // The one spec the whole set resolves to — the frame, the length cap and the caption safe-zone every
  // step downstream reasons from. Sorted for the derive signature so re-ticking the same feeds in a
  // different order can't look like a change and charge for a fresh derive.
  const platformPreset = resolvePlatformPreset(targetPlatforms)
  const platformSig = [...targetPlatforms].sort().join(',')

  // Label for the derived prose style, shown next to the genre in step 2. '' = pure genre (nothing to name).
  const narrativeStyleLabel = genreCategory && narrativeStyle
    ? (stylesForGenre(genreCategory).find((s) => s.id === narrativeStyle)?.label ?? '')
    : ''

  // ── the channel's example (step 2) — written for them on arrival; theirs to edit or replace ──
  // The two modes keep SEPARATE text, so toggling between them never destroys either one — the example we
  // wrote and a script they wrote are different things and both are worth keeping. `sampleScript` /
  // `sampleIsAi` below are derived from whichever mode is active; everything downstream reads those.
  const [aiSample, setAiSample] = useState('') // the example we wrote for them
  const [aiSampleEdited, setAiSampleEdited] = useState(false) // …once they touch it, it counts as theirs
  const [ownSample, setOwnSample] = useState('') // the script they wrote or pasted
  // Extra references are PASTE-ONLY by design: they persist as reference stories (create/route.ts marks
  // every extra source:'user'), and a sample we wrote must never enter the reference pool — the Writer
  // would then be learning its own output. The creator's scripts are the whole point of the extras.
  const [extraSampleScripts, setExtraSampleScripts] = useState<string[]>([]) // optional additional references (max 2)
  const [sampleMode, setSampleMode] = useState<'forme' | 'own'>('forme') // primary example: written for them vs. their own
  const [mainSteer, setMainSteer] = useState('') // optional idea that steers the next rewrite
  const [drafting, setDrafting] = useState(false) // an example is being written right now
  const [sampleError, setSampleError] = useState('')
  // Step 2 opens with an example already written. Sticky for the session (and saved in the draft) so a
  // creator who clears it — or resumes later — is never charged for a second one they didn't ask for.
  const [autoWroteSample, setAutoWroteSample] = useState(false)
  // Step 1 → step 2 HOLDS until the example is written, so step 2 never opens on a spinner or on a story
  // left over from the previous identity. The wait stays continuous — the step-1 button keeps narrating.
  const [preparingExample, setPreparingExample] = useState(false)
  // An example WE wrote demonstrates one channel identity. When that identity moves — a new
  // description/language (re-derive) or a different genre/style — the example is rewritten to match.
  // Deferred through this flag so the rewrite reads the NEW identity, not the one being replaced.
  const [pendingSampleRewrite, setPendingSampleRewrite] = useState(false)

  // The ACTIVE example — whichever mode the creator is in is the one the channel gets. Everything
  // downstream (create, the rewrite checks, the labels) reads these two and stays mode-agnostic.
  const sampleScript = sampleMode === 'own' ? ownSample : aiSample
  const sampleIsAi = sampleMode === 'forme' && aiSample.trim() !== '' && !aiSampleEdited
  // Writes go to the field belonging to the active mode; editing OUR example marks it theirs.
  function setActiveSample(text: string) {
    if (sampleMode === 'own') { setOwnSample(text); return }
    setAiSample(text)
    setAiSampleEdited(true)
  }

  // ── sound (step 4) — background music ──
  const [audioMood, setAudioMood] = useState<AudioMood | null>(null)  // derived brief (drives AI render-gen + preset ranking)
  const [musicChoice, setMusicChoice] = useState<'preset' | 'ai' | 'upload' | 'none'>('ai') // AI is the recommended default — original, story-fit music with nothing to pick
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
  const deriveAbortRef = useRef<AbortController | null>(null) // aborts an in-flight step-1 derive on unmount / re-fire
  // Operator-uploaded reference image → vision-derived style, added as a pickable tile.
  const [uploadingRef, setUploadingRef] = useState(false)
  const [refError, setRefError] = useState('')
  const [uploadedStyleIdx, setUploadedStyleIdx] = useState<number | null>(null)
  const styleRefInputRef = useRef<HTMLInputElement>(null)

  // Pending exit target — non-null shows the "leave channel setup?" confirm modal.
  const [leaveTo, setLeaveTo] = useState<string | null>(null)
  // The saved-draft channel row (if this wizard was resumed from one, or after "Leave & save"): so
  // re-saves update the same row and finishing promotes it to 'active' instead of orphaning a draft.
  const [draftChannelId, setDraftChannelId] = useState<string | null>(initialDraftChannelId)
  const [savingDraft, setSavingDraft] = useState(false)

  // Chosen style image = the previewed image of the selected card, if it was previewed.
  const chosenStyleImageKey =
    selectedStyleIdx != null ? stylePreviews[selectedStyleIdx]?.imageKey ?? null : null

  // ── draft persistence: survive reloads / leaving the page until created ──
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      // Resuming a saved draft → hydrate from the DB blob; otherwise from the localStorage autosave.
      const raw = initialDraft ? null : localStorage.getItem(DRAFT_KEY)
      const d = initialDraft ?? (raw ? JSON.parse(raw) : null)
      if (d) {
        if (['describe', 'script', 'voice', 'sound', 'visual'].includes(d.phase)) setPhase(d.phase)
        if (typeof d.name === 'string') setName(d.name)
        if (typeof d.committedName === 'string') setCommittedName(d.committedName)
        if (typeof d.description === 'string') setDescription(d.description)
        if (typeof d.seededDescription === 'string') setSeededDescription(d.seededDescription)
        if (typeof d.niche === 'string') setNiche(d.niche)
        if (Array.isArray(d.languages) && d.languages.length) setLanguages(d.languages)
        // Drafts saved before the set existed carry one value (possibly the old 'all' bucket) — widen it
        // rather than dropping the creator's choice.
        if (Array.isArray(d.targetPlatforms)) {
          const picked = d.targetPlatforms.filter((v: unknown): v is TargetPlatform => typeof v === 'string' && (PUBLISH_PLATFORMS as readonly string[]).includes(v))
          if (picked.length) setTargetPlatforms(picked)
        } else if (typeof d.targetPlatform === 'string') {
          if ((PUBLISH_PLATFORMS as readonly string[]).includes(d.targetPlatform)) setTargetPlatforms([d.targetPlatform as TargetPlatform])
          else if (d.targetPlatform === 'all') setTargetPlatforms(['tiktok', 'youtube_shorts', 'facebook_reels'])
        }
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
        if (typeof d.editorialPrinciples === 'string') setEditorialPrinciples(d.editorialPrinciples)
        if (d.sourcePolicy && typeof d.sourcePolicy === 'object') setSourcePolicy(d.sourcePolicy as SourcePolicy)
        { const g = asGenreModule(typeof d.genreCategory === 'string' ? d.genreCategory : null); if (g) setGenreCategory(g) }
        if (d.presentation === '' || d.presentation === 'voiceover' || d.presentation === 'hosted') setPresentation(d.presentation)
        if (typeof d.narrativeStyle === 'string') setNarrativeStyle(d.narrativeStyle)
        if (typeof d.narrativeVoice === 'string') setNarrativeVoice(d.narrativeVoice)
        if (d.styleInfluence === 'light' || d.styleInfluence === 'medium' || d.styleInfluence === 'full') setStyleInfluence(d.styleInfluence)
        if (typeof d.tagline === 'string') setTagline(d.tagline)
        if (typeof d.derivedSig === 'string') setDerivedSig(d.derivedSig)
        if (d.sampleMode === 'forme' || d.sampleMode === 'own') setSampleMode(d.sampleMode)
        // Drafts saved before the split stored ONE shared field — route it into the mode it belonged to
        // so a resumed draft never loses its example.
        if (typeof d.aiSample === 'string') setAiSample(d.aiSample)
        else if (typeof d.sampleScript === 'string' && d.sampleMode !== 'own') setAiSample(d.sampleScript)
        if (typeof d.aiSampleEdited === 'boolean') setAiSampleEdited(d.aiSampleEdited)
        else if (typeof d.sampleIsAi === 'boolean') setAiSampleEdited(!d.sampleIsAi)
        if (typeof d.ownSample === 'string') setOwnSample(d.ownSample)
        else if (typeof d.sampleScript === 'string' && d.sampleMode === 'own') setOwnSample(d.sampleScript)
        if (typeof d.autoWroteSample === 'boolean') setAutoWroteSample(d.autoWroteSample)
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
        // Same-browser resume: relink to the draft row this autosave was last saved to (the DB-resume
        // path sets this from the prop instead, so the blob itself never carries it).
        if (typeof d.draftChannelId === 'string') setDraftChannelId(d.draftChannelId)
      }
    } catch {
      /* ignore malformed draft */
    }
    setHydrated(true)
  }, [])

  // The full wizard state as a plain serializable object — the single source for both the
  // localStorage autosave and the DB draft blob (sent to /api/channel/save-draft on "Leave & save").
  function buildDraft() {
    // Persist only resolved previews (drop loading/error transients).
    const previewKeys: Record<number, PreviewState> = {}
    for (const [k, v] of Object.entries(stylePreviews)) {
      if (v.imageKey) previewKeys[Number(k)] = { imageKey: v.imageKey }
    }
    return {
      phase, name, committedName, description, seededDescription, niche, languages, targetPlatforms, presetId,
      avatarKey, costCents, tone, style, region, era, locations, objects, vocab,
      voiceMode, selectedVoices, recommended, voiceSearchKeyword, editorialPrinciples, sourcePolicy, genreCategory, presentation, narrativeStyle, narrativeVoice, styleInfluence, tagline, derivedSig,
      targetSeconds, captionStyle, sampleMode, aiSample, aiSampleEdited, ownSample, autoWroteSample, extraSampleScripts,
      audioMood, musicChoice, selectedPresetIds, presetPickedManually, uploadedMusic,
      styleProposals, selectedStyleIdx, uploadedStyleIdx, stylePreviews: previewKeys,
    }
  }

  useEffect(() => {
    if (!hydrated) return
    try {
      // draftChannelId rides along only in localStorage (not the DB blob) so same-browser resume can
      // relink to the row; the DB-resume path supplies it via prop instead.
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...buildDraft(), draftChannelId }))
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [hydrated, phase, name, committedName, description, seededDescription, niche, languages, targetPlatforms, presetId, avatarKey, costCents, tone, targetSeconds, style, region, era, locations, objects, vocab, voiceMode, selectedVoices, recommended, voiceSearchKeyword, editorialPrinciples, sourcePolicy, genreCategory, presentation, narrativeStyle, narrativeVoice, styleInfluence, tagline, derivedSig, captionStyle, sampleMode, aiSample, aiSampleEdited, ownSample, autoWroteSample, extraSampleScripts, audioMood, musicChoice, selectedPresetIds, presetPickedManually, uploadedMusic, styleProposals, selectedStyleIdx, uploadedStyleIdx, stylePreviews, draftChannelId])

  // ── Unsaved-progress guard ──────────────────────────────────────────────────
  // The draft autosaves, but leaving mid-flow still deserves a heads-up so the operator
  // can choose to keep it for later or discard it. The wizard is a fixed overlay that
  // covers the app sidebar, so the only in-app exit is the header "Channels" button; we
  // also guard browser Back / close / refresh.
  // Either mode's text counts — the inactive one is still work worth keeping.
  const hasProgress =
    name.trim() !== '' || niche.trim() !== '' || derivedSig !== '' ||
    aiSample.trim() !== '' || ownSample.trim() !== '' || avatarKey !== null

  // No `beforeunload` confirm on reload / tab-close: the draft autosaves to localStorage on every
  // change and restores on return, so reloading or closing loses nothing — the native prompt would
  // just nag about a non-problem. (Browser Back still routes through our own in-app modal below.)

  // Abort an in-flight step-1 derive if the wizard unmounts (e.g. the operator confirms leaving) so
  // the dropped request doesn't keep the model running for a result no one will receive.
  useEffect(() => () => { deriveAbortRef.current?.abort(); clarifyFetchRef.current?.abort() }, [])

  // Snapshot of the values the async clarify fetch re-checks at RESOLVE time — its closure's copies
  // are frozen at call time and go stale while the request is in flight.
  const clarifyFreshRef = useRef({ phase: 'describe' as Phase, niche: '', clarifyLen: 0, busy: false })
  useEffect(() => { clarifyFreshRef.current = { phase, niche, clarifyLen: clarify.length, busy: loading || preparingExample } })

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

  // "Trending now" rail: reuse the fetch the "Create channel" click already started (see
  // lib/trending-niches — the in-flight promise survives client-side navigation). Direct loads
  // (deep link / refresh / draft resume) start it here instead. Best-effort — empty hides the rail.
  useEffect(() => {
    let cancelled = false
    getTrendingNiches()
      .then((niches) => { if (!cancelled) setTrending(niches) })
      .finally(() => { if (!cancelled) setTrendingLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Quick-start deep links from the dashboard. Applied once, and only over an UNTOUCHED brief — a
  // resumed draft or anything already typed always wins, so a stale link can't wipe real work. Curated
  // presets resolve immediately; a trending slug has to wait for the rail to load before it can match.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (!hydrated || deepLinkDone.current) return
    if (niche.trim() !== '' || initialDraft) { deepLinkDone.current = true; return }
    if (initialPresetId && findPreset(initialPresetId)) {
      deepLinkDone.current = true
      pickPreset(initialPresetId)
      return
    }
    if (initialTrendingId) {
      if (trendingLoading) return // rail still in flight — try again when it lands
      const match = trending.find((t) => trendingId(t.label) === initialTrendingId)
      deepLinkDone.current = true
      if (match) pickTrending(match)
    }
  }, [hydrated, trendingLoading, trending, initialPresetId, initialTrendingId])

  // Requested an exit: prompt if there's progress, otherwise just go.
  function requestLeave(href: string) {
    if (hasProgress) setLeaveTo(href)
    else router.push(href)
  }
  // "Leave & save" → persist the draft as a real channel (status='draft') so it shows on the dashboard
  // and can be resumed from any browser. The localStorage autosave is the fallback if the request fails.
  async function leaveKeepDraft() {
    const href = leaveTo ?? '/dashboard'
    setSavingDraft(true)
    try {
      const res = await fetch('/api/channel/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The column is a denormalized copy for the dashboard card and the route caps it, so clamp
        // rather than let an over-limit draft fail to save. draftState carries the full text back.
        body: JSON.stringify({ draftChannelId, name, nicheDescription: niche.trim().slice(0, NICHE_MAX), draftState: buildDraft() }),
      })
      if (res.ok) {
        const { channelId } = (await res.json()) as { channelId: string }
        setDraftChannelId(channelId)
        // Relink the localStorage autosave to this row before navigating away.
        try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...buildDraft(), draftChannelId: channelId })) } catch { /* noop */ }
      }
    } catch {
      /* network error — the localStorage autosave still holds the draft, so nothing is lost */
    }
    setSavingDraft(false)
    setLeaveTo(null)
    router.push(href)
  }
  // "Discard" → drop the work: clear the autosave and delete the draft row if one was saved.
  async function leaveDiscardDraft() {
    const href = leaveTo ?? '/dashboard'
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
    if (draftChannelId) {
      try { await fetch(`/api/channel/save-draft?id=${draftChannelId}`, { method: 'DELETE' }) } catch { /* noop */ }
    }
    setDraftChannelId(null)
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

  // The cached catalog belongs to the language it was fetched for — a language change makes it
  // wrong, and the lazy-load below won't refetch while it's non-empty. Drop it so "Show all
  // voices" can't serve the previous language's voices.
  const allVoicesLang = useRef(language)
  useEffect(() => {
    if (allVoicesLang.current !== language) {
      allVoicesLang.current = language
      setAllVoices([])
    }
  }, [language])

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

  // No auto-render here on purpose. Onboarding spends NOTHING on visuals: every style card gets its
  // picture for free — the preset gallery from pre-rendered thumbnails, an uploaded reference from its
  // own upload — so there is nothing left to pay an image model for. This used to kick off a paid
  // render per card, from the era when the wizard proposed bespoke LLM styles; the only way it could
  // still fire was a resumed draft with a missing preview, where it would silently bill the creator
  // mid-onboarding. Such a card now shows its placeholder instead. Bespoke looks stay opt-in and paid,
  // behind "Customize look" in channel Settings.

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

  // Onboarding spends NOTHING on visuals: the gallery is our fixed preset library with thumbnails
  // pre-rendered once (served from R2). Selecting a preset sets the channel's style DNA; its thumbnail
  // doubles as the chosen style-sample image. A bespoke, channel-specific look is generated later, opt-in,
  // via "Customize look" in Settings. (Upload-your-own below still works and is operator-initiated.)
  function fetchStyleOptions() {
    styleReqRef.current++
    const genre = genreCategory || 'general'
    const presets = presetsForGenre(genre)
    const proposals: StyleProposals = {
      // The scene the thumbnails were rendered on — shown under the gallery so the creator knows what
      // they're comparing, and reused if they later render a bespoke preview.
      sampleScene: sampleSceneForGenre(genre),
      styles: presets.map((p) => ({ label: p.label, description: p.description, stylePreset: p.stylePreset })),
    }
    const previews: Record<number, PreviewState> = {}
    // Genre-keyed thumbnail. /api/asset falls back to the pre-genre key when a genre's thumbnails
    // haven't been rendered yet, so this is safe to use before the render script has run.
    presets.forEach((p, i) => { previews[i] = { imageKey: stylePresetThumbKey(p.id, genre) } })
    setStyleProposals(proposals)
    setStylePreviews(previews)
    setSelectedStyleIdx(0)
    setUploadedStyleIdx(null)
    if (presets[0]) setStyle(presets[0].stylePreset)
    setStyleLoading(false)
    setStyleError('')
  }

  function selectStyle(idx: number) {
    const card = styleProposals?.styles[idx]
    if (!card) return
    setSelectedStyleIdx(idx)
    setStyle(card.stylePreset)
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

  // The niche field is soft-capped rather than maxLength-clamped: a hard cap silently swallows the
  // tail of a long paste, so we take the text and show an error instead. Both bounds match what the
  // derive/create APIs accept, so the field can never submit something they'd reject.
  const nicheLength = niche.trim().length
  const nicheOverLimit = nicheLength > NICHE_MAX
  const canGenerateNiche = nicheLength >= 20 && !nicheOverLimit
  // Name is deliberately NOT here: an empty name flags + scrolls on click (handleNext) instead of
  // silently disabling the button.
  const canGenerate = canGenerateNiche && languages.length > 0
  // Profile is "fresh" if the niche+language haven't changed since we derived it —
  // then we can Continue without re-calling the API. (Name/description/avatar don't
  // feed the creative bible, so editing them doesn't stale it.)
  const hasDerived = derivedSig !== ''
  const derivedFresh = hasDerived && derivedSig === `${niche.trim()}|${language}|${platformSig}`
  // Must pick a mode; single needs a chosen voice, per-story defers to render.
  const canLeaveVoice = voiceMode === 'per_story' || (voiceMode === 'single' && selectedVoices.length > 0)
  // An example being rewritten is mid-flight: every step after 2 is a pre-filled confirmation, so a
  // fast click-through can reach Create before it lands and persist the PREVIOUS genre's story as the
  // channel's example. Hold Create until the writing settles.
  const sampleSettling = drafting || pendingSampleRewrite
  const canCreate = canLeaveVoice && !sampleSettling

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

  // ── Poster values (display only) ─────────────────────────────────────────────
  // Every one of these reads existing state; the poster adds no state and triggers no work. The look
  // reuses whatever preview the Visual step already rendered, so it never causes a paid render.
  const posterInitials = avatarInitials(committedName || name || 'K')
  // The slate names the feeds, not the resolved spec: it's the creator's choice being reflected back.
  const posterPlatformLabel = targetPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(' · ').toUpperCase()
  const posterGenreTags = [
    genreCategory ? genreLabel(genreCategory) : '',
    narrativeStyleLabel,
    ...(audioMood?.moodTags ?? []).slice(0, 1),
  ].filter(Boolean) as string[]
  // Gated on reaching the Sound step, not on `musicChoice` — that state starts at its recommended
  // default, so an ungated poster ticked "Sound · Original score" on step 1 and claimed a decision the
  // creator hadn't made yet. The poster only ever reports what the brief has actually settled.
  const posterMusicLabel = PHASE_ORDER.indexOf(phase) >= 3 && musicChoice ? MUSIC_LABELS[musicChoice] : ''
  const posterStyleLabel =
    selectedStyleIdx !== null ? (styleProposals?.styles[selectedStyleIdx]?.label ?? '') : ''
  const posterCaptionLabel = CAPTION_OPTIONS.find((o) => o.preset === captionStyle.preset)?.label ?? ''
  const posterStyleImageKey = selectedStyleIdx !== null ? stylePreviews[selectedStyleIdx]?.imageKey : undefined
  const posterStyleImageUrl = posterStyleImageKey ? `/api/asset?key=${encodeURIComponent(posterStyleImageKey)}` : null

  // Voice lists for single mode (gender-filtered). The recommend route returns the model's true
  // picks (each carrying a reason) followed by the whole browsable in-language pool (reason '').
  // Only the true picks render under "Recommended" — the pool waits behind "Show all voices",
  // merged with the lazily fetched catalog. Eighty rows under a "Recommended" header is a wall.
  const matchesGender = (v: { gender: string }) =>
    voiceGender === 'any' || (v.gender || '').toLowerCase() === voiceGender
  const trueRecs = recommended.filter((v) => v.reason)
  const recsForHeader = trueRecs.length > 0 ? trueRecs : recommended.slice(0, 5)
  const recommendedFiltered = recsForHeader.filter(matchesGender)
  const browsePool: VoiceOption[] = []
  {
    const seenIds = new Set(recsForHeader.map((v) => v.id))
    for (const v of [...recommended, ...allVoices]) {
      if (v.id && !seenIds.has(v.id)) { seenIds.add(v.id); browsePool.push(v) }
    }
  }
  const moreFiltered = browsePool.filter(matchesGender)
  const topPickId = recsForHeader[0]?.id
  const allVoicesLoading = showAllVoices && voicesLoading && browsePool.length === 0

  // The card line is cosmetic, so a preset fills it as a courtesy — never over anything the creator
  // wrote. Blurbs can run past the input's cap (the trending schema allows 160), so clamp.
  function seedDescription(blurb: string) {
    if (description.trim() !== '' && description !== seededDescription) return
    const line = blurb.trim().slice(0, 140)
    setDescription(line)
    setSeededDescription(line)
  }

  // Called whenever the channel's identity changes under a written example. A script the CREATOR
  // wrote is never touched: it's their voice, the one input we can't regenerate, and it stays what
  // they want the channel to sound like. Ours is only a demo of the identity, so it follows it.
  function refreshSampleForIdentityChange() {
    if (!sampleIsAi || sampleScript.trim() === '') return
    setPendingSampleRewrite(true)
  }

  // Does the example need writing before step 2 is worth showing?
  function exampleNeedsWriting(): boolean {
    if (sampleMode === 'own') return false            // they're writing it themselves
    if (sampleScript.trim() !== '') return sampleIsAi  // ours is stale now; THEIRS is never touched
    return !autoWroteSample                            // none yet, and we haven't already written one
  }

  // The single step-1 → step-2 advance. Falls through instantly when there's nothing to write (a script
  // they wrote, one they cleared on purpose, or "I'll write my own"); otherwise holds on step 1 while the
  // example is written. Back-navigation from step 3 does NOT come through here — going back never waits.
  function goToScript() {
    if (!exampleNeedsWriting()) { setPhase('script'); return }
    setPreparingExample(true)
  }

  // The single step-1 advance (the footer CTA). Validates the name — the one field never filled in
  // for them — then folds any clarify answers into the pitch and derives, or just moves on.
  function handleNext() {
    if (name.trim() === '') {
      setNameMissing(true)
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      nameInputRef.current?.focus({ preventScroll: true })
      return
    }
    const additions = clarify
      .map((q, i) => {
        const a = (clarifyAnswers[i] ?? '').trim()
        return a ? `${q.prefix} ${a}` : null
      })
      .filter((v): v is string => !!v)
    if (clarify.length > 0) setClarify([])
    if (additions.length > 0) {
      // Answers change the pitch → re-derive with the enriched text, pre-marked as asked so the
      // derive can't loop into asking about it again.
      const newNiche = `${niche.trim()}\n${additions.join('\n')}`
      setNiche(newNiche)
      setClarifyHandledText(newNiche)
      void handleGenerate(newNiche, newNiche)
      return
    }
    if (derivedFresh) { goToScript(); return }
    void handleGenerate()
  }

  // One round-trip to /api/channel/clarify. Returns the (possibly empty) question list, or null when
  // the call failed or was aborted — callers treat null as "bow out quietly", never as an error state.
  async function fetchClarifyQuestions(text: string, signal: AbortSignal): Promise<Array<{ question: string; examples: string; prefix: string }> | null> {
    try {
      const res = await fetch('/api/channel/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nicheDescription: text, language }),
        signal,
      })
      if (!res.ok) return null
      const json = await res.json()
      setCostCents((c) => c + (json.costCents ?? 0))
      return Array.isArray(json.questions)
        ? (json.questions as Array<{ question: string; examples: string; prefix: string }>).filter((q) => q?.question && q?.prefix)
        : []
    } catch {
      return null // aborted or offline — advisory, stay quiet
    }
  }

  // A pitch the creator wrote themselves gets its follow-ups from a small server call — fired on blur
  // and after a typing lull. Guards keep it cheap and quiet: minimum length, one ask per distinct text
  // (the route caches too, so even a repeat is free server-side), never while a card is already up or
  // a derive is running. Purely advisory: any failure just means no questions.
  function maybeFetchClarify() {
    const text = niche.trim()
    if (phase !== 'describe' || loading || preparingExample) return
    if (presetId !== null) return // tile/trending picks carry their own follow-ups (or deliberately none)
    if (clarify.length > 0) return // never replace a card that's up — answers may be mid-type
    if (text.length < 30) return // not enough pitch yet to know what's missing
    if (text === clarifyAskedRef.current || text === clarifyHandledText) return
    if (clarifyRoundsRef.current >= CLARIFY_MAX_ROUNDS) return
    clarifyAskedRef.current = text
    clarifyRoundsRef.current += 1
    clarifyFetchRef.current?.abort()
    const controller = new AbortController()
    clarifyFetchRef.current = controller
    void fetchClarifyQuestions(text, controller.signal).then((qs) => {
      // Only surface if the pitch hasn't moved on while we asked.
      const fresh = clarifyFreshRef.current
      if (qs && qs.length > 0 && fresh.phase === 'describe' && !fresh.busy && fresh.clarifyLen === 0 && fresh.niche.trim() === text) {
        setClarify(qs.slice(0, 2))
        setClarifyAnswers({})
        setClarifyHandledText(text)
      }
    })
  }

  // "Add & continue": fold the answers into the pitch (visible immediately in the textarea above),
  // then ask for the NEXT round of questions on the enriched text. The loop ends when the model has
  // nothing left to ask — that's the "we have what we need" signal — or at the round cap.
  async function handleClarifyAdd() {
    const additions = clarify
      .map((q, i) => {
        const a = (clarifyAnswers[i] ?? '').trim()
        return a ? `${q.prefix} ${a}` : null
      })
      .filter((v): v is string => !!v)
    if (additions.length === 0) return // button is disabled blank — Skip is the blank path
    const newNiche = `${niche.trim()}\n${additions.join('\n')}`
    setNiche(newNiche)
    setClarifyHandledText(newNiche)
    clarifyAskedRef.current = newNiche
    setClarifyAnswers({})
    if (clarifyRoundsRef.current >= CLARIFY_MAX_ROUNDS) {
      setClarify([]) // enough rounds — quietly stop asking; the answers are already folded in
      return
    }
    clarifyRoundsRef.current += 1
    setClarifyLoading(true)
    clarifyFetchRef.current?.abort()
    const controller = new AbortController()
    clarifyFetchRef.current = controller
    const qs = await fetchClarifyQuestions(newNiche, controller.signal)
    setClarifyLoading(false)
    if (clarifyFetchRef.current !== controller) return // superseded by a derive or unmount
    if (qs === null) { setClarify([]); return } // fetch failed — the folded answers still count
    if (qs.length > 0) {
      setClarify(qs.slice(0, 2))
    } else {
      setClarify([])
      setClarifyDone(true) // the model had nothing left to ask
    }
  }

  // Skip: dismiss the card and stop asking about this text — the derive won't re-ask it either.
  function handleClarifySkip() {
    const text = niche.trim()
    setClarify([])
    setClarifyAnswers({})
    setClarifyHandledText(text)
    clarifyAskedRef.current = text
  }

  // The typing-lull trigger (blur on the textarea is the other). 2.5s of stillness reads as "done
  // writing this thought"; the per-text dedupe above makes a premature fire harmless — asked once,
  // and the route's cache makes even a true repeat free.
  useEffect(() => {
    if (!hydrated) return
    const t = setTimeout(maybeFetchClarify, 2500)
    return () => clearTimeout(t)
  }, [niche, hydrated])

  function pickPreset(id: string) {
    // findPreset, not the grid list: a dashboard quick-start or a resumed draft can name a curated niche
    // that no longer has a tile, and it should still seed its text rather than silently do nothing.
    const preset = findPreset(id)
    if (!preset) return
    // This gallery is single-select, so a repeat tap is a NO-OP, not a toggle-off. Two reasons: it used to
    // leave nothing highlighted while the textarea still held that template's text — a state that reads as
    // a glitch — and re-seeding instead would overwrite a description the creator had since edited.
    // "Write your own" (pickCustom) is the deliberate way out, and typing your own text deselects too.
    if (presetId === id) return
    setPresetId(id)
    setNiche(preset.description)
    setLanguages([preset.language])
    seedDescription(preset.blurb)
    // The genre's own follow-ups, up the moment the tile lands. Showing them marks the seeded text as
    // asked (same rule as the derive's questions), so the derive can't re-ask about the same text.
    setClarify(preset.clarify ?? [])
    setClarifyAnswers({})
    if (preset.clarify?.length) setClarifyHandledText(preset.description)
    clarifyRoundsRef.current = 0 // fresh identity, fresh question budget
    setClarifyDone(false)
  }

  // Applying a trending card. Extracted from the rail's onClick so the dashboard's quick-start cards
  // can land on the same code path via ?trending= instead of duplicating the seeding rules.
  function pickTrending(t: TrendingNiche) {
    const id = trendingId(t.label)
    if (presetId === id) return // same single-select rule as the genre tiles — a repeat tap changes nothing
    setPresetId(id)
    setNiche(t.description)
    // The rail's language is free text from a live search, so it can name one we don't support (or one
    // we deliberately removed). Only honor it if the picker offers it — that list is the promise we can
    // actually produce it.
    setLanguages([SUPPORTED_LANGUAGES.includes(t.language) ? t.language : 'English'])
    seedDescription(t.blurb)
    // No follow-ups for a trending pick: the feed's descriptions are already specific.
    setClarify([])
    setClarifyAnswers({})
    clarifyRoundsRef.current = 0
    setClarifyDone(false)
  }

  function pickCustom() {
    if (presetId !== null) {
      setNiche('') // clear the seeded preset text for a fresh start
      if (description === seededDescription) { setDescription(''); setSeededDescription('') }
    }
    setPresetId(null)
    // The abandoned tile's questions don't apply to a blank pitch — their own arrive on blur/lull.
    setClarify([])
    setClarifyAnswers({})
    clarifyRoundsRef.current = 0
    setClarifyDone(false)
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

  // `nicheOverride` lets the clarify flow re-derive with freshly-appended answers in the same click
  // (setNiche is async, so reading `niche` state right after setting it would use the stale text).
  // `handledOverride` marks that text as already-asked for the same reason — the state set in the
  // submit handler wouldn't be visible to this closure yet.
  async function handleGenerate(nicheOverride?: string, handledOverride?: string) {
    const nicheText = (nicheOverride ?? niche).trim()
    const handledText = handledOverride ?? clarifyHandledText
    // Cancel any prior in-flight derive — and the advisory clarify fetch, which the derive supersedes.
    deriveAbortRef.current?.abort()
    clarifyFetchRef.current?.abort()
    const controller = new AbortController()
    deriveAbortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/channel/derive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), nicheDescription: nicheText, languages, targetPlatforms }),
        signal: controller.signal,
      })
      const json = await res.json()
      if (!res.ok) {
        // Surface the specific field that failed validation instead of a bare "Invalid input".
        const fieldErrors = json.issues?.fieldErrors as Record<string, string[]> | undefined
        const detail = fieldErrors && Object.entries(fieldErrors).map(([f, msgs]) => `${f}: ${msgs?.[0]}`).join('; ')
        throw new Error(detail || json.error || 'Generation failed')
      }
      const d = json.derived as Derived
      setTone(d.toneConfig)
      if (typeof d.targetSeconds === 'number') setTargetSeconds(d.targetSeconds)
      if (d.captionPreset) {
        // The AI picks the LOOK; whether captions burn at all is a platform/creator decision, so carry
        // the current on/off through — otherwise deriving would silently switch a long-form channel back on.
        setCaptionStyle((prev) => ({
          ...resolveCaptionStyle(d.captionPreset!, {
            highlightColor: d.captionHighlight,
            color: d.captionTextColor,
            position: d.captionPosition,
            fontScale: d.captionFontScale,
          }),
          enabled: prev.enabled,
        }))
      }
      setStyle(d.stylePreset)
      setRegion(d.worldBible.region)
      setEra(d.worldBible.era)
      setLocations(d.worldBible.canonLocations ?? [])
      setObjects(d.worldBible.canonObjects ?? [])
      setVocab(Object.entries(d.worldBible.vocabulary ?? {}).map(([term, value]) => ({ term, value })))
      setVoiceSearchKeyword(d.voiceSearchKeyword ?? '')
      setEditorialPrinciples(d.editorialPrinciples ?? '')
      // mustAskSourcePolicy is CODE, not prompt compliance: a live derivation once omitted the policy
      // (correctly — the pitch was genuinely ambiguous) and emitted no question either, which would have
      // left the channel silently on the restrictive default with the creator never asked.
      if (d.sourcePolicy) { setSourcePolicy(d.sourcePolicy); setAskPolicy(false) }
      else { setSourcePolicy(SOURCE_POLICY_CHOICES[0]!.value); setAskPolicy(mustAskSourcePolicy(d)) }
      setGenreCategory(d.genreCategory ?? '')
      setPresentation(d.presentation === 'voiceover' || d.presentation === 'hosted' ? d.presentation : '')
      setNarrativeStyle(d.narrativeStyle ?? '')
      setNarrativeVoice(d.narrativeVoice ?? '')
      setTagline(d.tagline ?? '')
      setAudioMood(d.audioMood ?? null)
      setCostCents((c) => c + (json.costCents ?? 0)) // add — a re-derive doesn't undo earlier spend
      setDerivedSig(`${nicheText}|${language}|${platformSig}`)
      // Fresh profile invalidates anything derived from the old one.
      setRecommended([])
      setSelectedVoices([])
      // The step-2 example is NOT queued for rewrite here — goToScript() below writes it before it
      // shows the step, so queuing it too would pay for two writes of the same thing.
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
      // Follow-up questions: if the profile left dimensions open, pause and ask — unless THIS exact
      // text was already asked about (answered or skipped). A rewritten idea gets fresh questions;
      // the answer-append re-derive arrives pre-marked as handled, so it can never loop.
      const qs = Array.isArray(d.clarifyingQuestions) ? d.clarifyingQuestions.filter((q) => q?.question && q?.prefix) : []
      if (qs.length > 0 && nicheText !== handledText) {
        setClarify(qs.slice(0, 3))
        setClarifyAnswers({})
        setClarifyHandledText(nicheText)
        // The creator is down at the footer when these arrive — bring the card to them.
        setTimeout(() => clarifyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
      } else {
        goToScript()
      }
    } catch (e) {
      // Aborted (unmount / re-fire) is intentional — not an error to show, and any newer call owns the UI now.
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(friendlyError(e, 'Generation failed'))
    } finally {
      // Only the latest derive clears the spinner, so a superseded one can't flip it off mid-flight.
      if (deriveAbortRef.current === controller) {
        deriveAbortRef.current = null
        setLoading(false)
      }
    }
  }

  // Write the channel's example. `promptHint` is an optional idea they typed (blank = come up with one).
  // `reviseDraft` is THEIR OWN text to rebuild in the channel's voice — passed only for a script they
  // wrote or edited. An untouched example of ours is replaced outright, never fed back to itself.
  // `silent` suppresses the error line for writes the creator didn't ask for (the one on arrival): a
  // spend cap or a flaky call shouldn't greet them with a failure for something they never clicked.
  async function handleSampleDraft(promptHint: string, opts: { reviseDraft?: string; silent?: boolean } = {}) {
    const { reviseDraft, silent } = opts
    setDrafting(true)
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
          targetPlatforms,
          worldBible: worldBiblePayload(),
          voiceStyle: selectedVoices[0]?.description,
          ...(genreCategory ? { genreCategory } : {}),
          ...(narrativeStyle ? { narrativeStyle } : {}),
          ...(narrativeVoice ? { narrativeVoice } : {}),
          styleInfluence,
          ...(promptHint.trim() ? { promptHint: promptHint.trim() } : {}),
          ...(reviseDraft?.trim() ? { reviseDraft: reviseDraft.trim() } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Surface the specific field that failed (e.g. a too-long steer) instead of a bare "Invalid input".
        const fieldErrors = json.issues?.fieldErrors as Record<string, string[]> | undefined
        const detail = fieldErrors && Object.entries(fieldErrors).map(([f, msgs]) => `${f}: ${msgs?.[0]}`).join('; ')
        throw new Error(detail || json.error || 'Draft failed')
      }
      const s = json.sample as { title: string; hook: string; script: string }
      setAiSample(s.script?.trim() || s.hook || '')
      setAiSampleEdited(false)
      setCostCents((c) => c + (json.costCents ?? 0))
    } catch (e) {
      if (!silent) setSampleError(friendlyError(e, 'Draft failed'))
    } finally {
      setDrafting(false)
    }
  }

  // Rewrites the example after an identity change. Runs from an effect rather than inline in the
  // change handlers because handleSampleDraft reads the genre/style/description off state — firing it
  // in the same tick would write an example for the identity we just replaced. A failed rewrite
  // leaves the previous example in place (surfaced by sampleError), never an empty field.
  // Waiting on any in-flight write also COALESCES: the flag is a boolean, so ten fast genre toggles
  // collapse into the one call in flight plus a single final rewrite, instead of ten paid calls.
  useEffect(() => {
    if (!pendingSampleRewrite || drafting) return
    setPendingSampleRewrite(false)
    void handleSampleDraft(mainSteer)
  }, [pendingSampleRewrite, drafting])

  // Writes the example while the creator is STILL ON STEP 1, then advances — that ordering is the whole
  // point: step 2 opens on a finished story, never on a spinner or the previous genre's story. Runs from
  // an effect so the derive's state has committed and the write reads the new identity. Advances even
  // when the write fails: a spend cap or a flaky call must never trap someone on step 1.
  useEffect(() => {
    if (!preparingExample) return
    let cancelled = false
    void (async () => {
      if (exampleNeedsWriting()) {
        setAutoWroteSample(true)
        await handleSampleDraft(mainSteer, { silent: true })
      }
      if (cancelled) return
      setPreparingExample(false)
      setPhase('script')
    })()
    return () => { cancelled = true }
  }, [preparingExample])

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
          targetPlatforms,
          toneConfig: tone,
          voiceSearchKeyword,
          editorialPrinciples, // '' when the idea stated no rule of its own — the gate keeps its genre default
          sourcePolicy, // what this channel may treat as REAL; frozen onto every reel it makes
          ...(genreCategory ? { genreCategory } : {}), // omit when not derived → create route keyword-classifies
          ...(presentation ? { presentation } : {}), // omit when no lean → create route defaults to ''
          ...(narrativeStyle ? { narrativeStyle } : {}),
          ...(narrativeVoice ? { narrativeVoice } : {}),
          styleInfluence,
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
          // costCents is deliberately NOT sent: the server records each paid call as it happens and
          // attributes the total to this channel. The running figure below is display only.
          draftChannelId, // if this was a saved draft, promote that row instead of inserting a new one

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
      // Land on the new channel, not the dashboard — the next beat is making the first reel.
      router.push(`/channel/${json.channelId}`)
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
          <KendrixMark size={26} />
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-800 -tracking-[0.01em] text-ink">New channel</h1>
          <StepTimeline phase={phase} onGo={setPhase} />
          {/* The safe exit, in plain sight — before this it existed only inside the leave-confirm
              modal, so saving looked like an escape hatch instead of a feature. Gated on progress
              so an untouched wizard can't mint empty draft rows. */}
          {hasProgress && (
            <button
              type="button"
              onClick={() => void leaveKeepDraft()}
              disabled={savingDraft}
              className="btn-ghost btn-sm hidden flex-shrink-0 sm:inline-flex"
            >
              {savingDraft ? 'Saving…' : 'Save & finish later'}
            </button>
          )}
          <button
            type="button"
            onClick={() => requestLeave('/dashboard')}
            aria-label="Close setup"
            title="Close setup"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm border border-border-mid bg-surface text-muted transition-colors hover:border-accent-ring hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Two panes: the brief scrolls on the left, the poster it produces sits on the right. Below xl
          the poster is hidden and the brief takes the full width. */}
      <div className="flex min-h-0 flex-1">
      {/* min-w-0 matters: a flex item defaults to min-width:auto, so the horizontal trending rail (and
          any long unbroken string) would widen this pane past its share instead of scrolling inside it,
          squeezing the poster or overflowing the page. */}
      <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[600px] p-5 sm:px-10 sm:pb-14 sm:pt-8">
        {error && (
          <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Step title — a tracked "brief" label over the display heading, then what this step decides. */}
        <div className="mb-6">
          <p className="mono-label">
            The brief · step {PHASE_ORDER.indexOf(phase) + 1} of {PHASE_ORDER.length}
          </p>
          <h2 className="mt-2 font-display text-[27px] font-800 -tracking-[0.025em] text-ink">
            {STEP_TITLE[phase]}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{STEP_SUB[phase]}</p>
        </div>

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
              {/* min-w-0 so a long name can't push the avatar out of the row. The hint the old field
                  carried is gone: the pencil badge already says the avatar is editable, and "optional"
                  now lives on the Description label below, where the mock puts it. */}
              <div className="min-w-0 flex-1">
                <Field label="Channel name">
                  <input
                    ref={nameInputRef}
                    className={`input py-3 text-[15px]${nameMissing ? ' input-error' : ''}`}
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameMissing(false) }}
                    onBlur={() => setCommittedName(name.trim())}
                    placeholder="Your channel name"
                    maxLength={80}
                    autoFocus
                    aria-invalid={nameMissing}
                    aria-describedby={nameMissing ? 'name-error' : undefined}
                  />
                  {nameMissing && (
                    <p id="name-error" className="text-xs text-danger">Your channel needs a name.</p>
                  )}
                </Field>
              </div>
            </div>

            <Field label="Description" hint="· optional — shown on the channel's card">
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short line for the channel's card."
                maxLength={140}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <SectionLabel>What&apos;s your channel about?</SectionLabel>
              <p className="-mt-1 text-xs leading-relaxed text-muted">
                Start from what&apos;s trending, tap a template, or describe your own. You can edit everything.
              </p>

              {/* Trending now — LIVE web-searched niches with strong current payout (refreshed daily).
                  Leads the gallery; a skeleton holds the space while loading so the page never jumps.
                  Quietly removed when the fetch has nothing (static presets always work). */}
              {(trendingLoading || trending.length > 0) && (
                <div>
                  {/* A live dot rather than an icon: the rail IS a feed, and the pulse says so
                      without spending a word. The cadence sits on the right, out of the way. */}
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2.5 text-sm font-700 text-ink">
                      <span className="relative inline-flex h-2 w-2 flex-shrink-0">
                        <span className="absolute inset-0 animate-ping rounded-full bg-brand-pink" />
                        <span className="absolute inset-0 rounded-full bg-brand-pink" />
                      </span>
                      Trending now
                    </p>
                    <span className="flex-shrink-0 text-xs text-faint">Updated daily</span>
                  </div>
                  {/* A horizontal rail, not a grid: the live feed returns 3–6 cards and a grid of six
                      pushes the brief's own fields off-screen in the narrower two-pane layout. */}
                  {trendingLoading ? (
                    <div className="flex gap-2.5 overflow-x-auto px-0.5 pb-3 pt-0.5">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-[180px] flex-none animate-pulse rounded-md border border-border-strong bg-surface p-3">
                          <div className="h-3.5 w-14 rounded-full bg-subtle" />
                          <div className="mt-2 h-4 w-3/4 rounded bg-subtle" />
                          <div className="mt-1.5 h-3 w-full rounded bg-subtle" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="animate-fade-in flex gap-2.5 overflow-x-auto px-0.5 pb-3 pt-0.5">
                      {trending.map((t, i) => {
                        // Keyed by label, not position: the rail refreshes daily, and an index-based id
                        // would highlight whatever card happens to sit in that slot when a draft resumes.
                        const id = trendingId(t.label)
                        const on = presetId === id
                        return (
                          <button
                            key={`${i}-${id}`}
                            type="button"
                            title={t.whyNow}
                            onClick={() => pickTrending(t)}
                            aria-pressed={on}
                            className={`flex w-[180px] flex-none flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-all ${
                              on ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong bg-surface hover:bg-subtle'
                            }`}
                          >
                            <span className={`rounded-full px-2 py-[2px] font-mono text-[9px] font-700 uppercase tracking-micro ${t.rpm === 'high' ? 'bg-success-soft text-success' : 'bg-subtle-strong text-muted'}`}>
                              {t.rpm === 'high' ? 'High payout' : 'Rising'}
                            </span>
                            <span className="line-clamp-1 text-sm font-medium text-ink">{t.label}</span>
                            <span className="line-clamp-2 text-xs text-muted">{t.blurb}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {NICHE_PRESETS.map((p) => {
                  const on = presetId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p.id)}
                      aria-pressed={on}
                      className={`flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-all ${
                        on
                          ? 'border-accent bg-accent-soft ring-1 ring-accent'
                          : 'border-border-strong bg-surface hover:bg-subtle'
                      }`}
                    >
                      {/* Chosen → the chip saturates into its own hue's gradient, so the active genre is
                          readable from the icon alone and not just from the card's border. */}
                      <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-sm transition-colors ${on ? p.selectedColor ?? 'bg-pair-purple-pink text-white' : p.color}`}>
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
                  aria-pressed={presetId === null}
                  className={`flex flex-col items-start gap-1 rounded-md border border-dashed p-3 text-left transition-all ${
                    presetId === null
                      ? 'border-accent bg-accent-soft ring-1 ring-accent'
                      : 'border-border-strong bg-surface hover:bg-subtle'
                  }`}
                >
                  <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-sm ${presetId === null ? 'bg-accent-soft text-accent' : 'bg-subtle-strong text-accent'}`}>
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
                className={`input h-44 resize-none${nicheOverLimit ? ' input-error' : ''}`}
                value={niche}
                onChange={(e) => { setNiche(e.target.value); setPresetId(null); setClarifyDone(false) }}
                onBlur={maybeFetchClarify}
                aria-invalid={nicheOverLimit}
                aria-describedby={nicheOverLimit ? 'niche-error' : undefined}
                placeholder="e.g. 'true-crime cases cracked by one overlooked detail, calm narration', or 'cozy 2-minute pasta recipes, warm and upbeat', or 'mind-bending space facts told with awe'. Cover the genre, audience, format, tone, and how it's narrated — the more detail, the better; we safely fill in the rest."
              />
              {/* No running counter — length isn't the point until it's a problem. */}
              {nicheOverLimit && (
                <p id="niche-error" className="mt-1 text-xs text-danger">
                  That&apos;s {(nicheLength - NICHE_MAX).toLocaleString()} characters too long — trim it and we&apos;ll take it from there.
                </p>
              )}
            </Field>

            {/* Follow-up questions — curated ones land with a genre tile, fetched ones for a pitch the
                creator wrote (maybeFetchClarify), and the derive still returns its own for text that was
                never asked. "Add & continue" folds answers in and LOOPS: the model reads the enriched
                pitch and asks the next round, until it has nothing left to ask (or the round cap). Skip
                bows out; the footer CTA stays visible throughout and bails out into the build. */}
            {clarify.length > 0 && (
              // Brand-washed panel rather than a white card: it reads as the tool leaning in mid-form,
              // not as another section of the form. Matches the mock's inline treatment.
              <div ref={clarifyCardRef} className="animate-fade-in rounded-[14px] border border-accent/40 bg-wash-purple-pink p-[18px]">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[8px] bg-pair-purple-pink">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />
                    </svg>
                  </span>
                  <h3 className="font-display text-sm font-800 text-ink">Before we build — a couple of questions</h3>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">Optional — blank is fine. Answers become part of the channel and sharpen every reel it makes.</p>
                {clarify.map((q, i) => (
                  <label key={`${q.question}-${i}`} className="mt-3.5 block">
                    <span className="mb-1.5 block text-[12.5px] font-600 text-ink">{q.question}</span>
                    <input
                      value={clarifyAnswers[i] ?? ''}
                      onChange={(e) => setClarifyAnswers((a) => ({ ...a, [i]: e.target.value }))}
                      placeholder={q.examples ? `e.g. ${q.examples}` : ''}
                      maxLength={200}
                      disabled={clarifyLoading}
                      className="input rounded-sm py-2.5 text-[13px]"
                    />
                  </label>
                ))}
                <div className="mt-4 flex items-center justify-end gap-2.5">
                  <button type="button" onClick={handleClarifySkip} disabled={clarifyLoading} className="btn-ghost btn-sm">
                    Skip
                  </button>
                  {/* Disabled until something's answered — blank + continue IS Skip, so only one button owns it. */}
                  <button
                    type="button"
                    onClick={() => void handleClarifyAdd()}
                    disabled={clarifyLoading || !clarify.some((_, i) => (clarifyAnswers[i] ?? '').trim() !== '')}
                    className="btn-accent btn-sm btn-glow"
                  >
                    {clarifyLoading ? 'Working…' : (<>Add &amp; continue <FwdArrow /></>)}
                  </button>
                </div>
              </div>
            )}

            {/* SOURCE POLICY — the one question the engine must never guess at.
                Separate from the clarify loop above on purpose: that loop takes free text, folds it into
                the pitch and re-derives. This one writes a STRUCTURED field directly, because
                round-tripping a settled answer back through prose and hoping the next derivation
                re-extracts it is the exact lossiness this dimension exists to remove.
                Never blocks: an option is always selected, so "skip" means accepting a visible choice. */}
            {askPolicy && (
              <div className="animate-fade-in mt-3 rounded-[14px] border border-accent/40 bg-wash-purple-pink p-[18px]">
                <h3 className="font-display text-sm font-800 text-ink">What can this channel treat as real?</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  This decides whether your stories can name real places and real people, or keep everything invented. You can change it later in settings.
                </p>
                <div className="mt-3 grid gap-2">
                  {SOURCE_POLICY_CHOICES.map((c) => {
                    const active = JSON.stringify(c.value) === JSON.stringify(sourcePolicy)
                    return (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => setSourcePolicy(c.value)}
                        aria-pressed={active}
                        className={`rounded-[10px] border px-3.5 py-2.5 text-left transition-colors ${
                          active ? 'border-accent bg-white shadow-sm' : 'border-line bg-white/60 hover:border-accent/50'
                        }`}
                      >
                        <span className="block text-[13px] font-700 text-ink">{c.label}</span>
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{c.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* The loop's landing: the model read the enriched pitch and had nothing left to ask. */}
            {clarifyDone && clarify.length === 0 && (
              <p className="animate-fade-in flex items-center gap-1.5 text-xs font-600 text-success">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                That&apos;s everything we need — your pitch is ready.
              </p>
            )}

            <Field label="Language" hint="Narrated in this language. Need another? Make a separate channel.">
              <Dropdown
                className="w-full sm:w-64"
                value={language}
                onChange={(v) => setLanguages([v])}
                options={SUPPORTED_LANGUAGES}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden>
                    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
                  </svg>
                }
              />
            </Field>

            <Field label="Where will you post?" hint="Pick every platform you'll publish to — we fit length, safe-zones and aspect to each. Change anytime.">
              <PlatformPicker
                value={targetPlatforms}
                onChange={(next) => {
                  setTargetPlatforms(next)
                  // Burned captions are a mute-autoplay answer: essential in a feed, wrong for long-form,
                  // where viewers have sound on and YouTube's own CC track is better (selectable, translatable).
                  // Only a default — the creator can flip it back on in the Captions card below.
                  if (!captionsTouched) {
                    const vertical = resolvePlatformPreset(next).aspect === '9:16'
                    setCaptionStyle((cs) => ({ ...cs, enabled: vertical }))
                  }
                }}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
              {/* One consistent label, always visible — the follow-up card above is optional inputs,
                  not a gate. handleNext validates the name, folds any answers into the pitch, and
                  re-derives when the pitch changed since the last derive; otherwise it just advances. */}
              <button
                onClick={handleNext}
                disabled={!canGenerate || loading || preparingExample}
                className="btn-accent btn-lg btn-glow"
              >
                {loading || preparingExample ? (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden>
                      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                    </svg>
                    <DeriveBeats />
                  </>
                ) : (
                  <>
                    {hasDerived ? 'Continue' : 'Build my channel'}
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

            {/* The style is already chosen from the description — this states it rather than asking.
                "Change" is the escape hatch for a bad read; the finer knobs live in Settings. */}
            {genreCategory && (
              <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <SectionLabel>Storytelling style</SectionLabel>
                    <p className="mt-1.5 text-sm font-medium text-ink">
                      {genreLabel(genreCategory)}
                      {narrativeStyleLabel && <span className="text-muted"> · {narrativeStyleLabel}</span>}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      Chosen from your description — every reel on this channel is written this way.
                    </p>
                  </div>
                  {!styleOpen && (
                    <button type="button" onClick={() => setStyleOpen(true)} className="btn-ghost btn-sm">
                      Change
                    </button>
                  )}
                </div>

                {styleOpen && (
                  <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                      Kind of story
                      <Dropdown
                        value={genreCategory}
                        onChange={(v) => {
                          setGenreCategory(v as GenreModule)
                          setNarrativeStyle('') // styles are scoped to the genre — a switch resets to pure genre
                          refreshSampleForIdentityChange() // the example below demonstrated the old genre
                        }}
                        options={GENRE_OPTIONS}
                      />
                    </label>
                    {stylesForGenre(genreCategory).length > 0 && (
                      <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
                        Style
                        <Dropdown
                          value={narrativeStyle}
                          onChange={(v) => { setNarrativeStyle(v); refreshSampleForIdentityChange() }}
                          options={[{ value: '', label: 'Classic — no added style' }, ...stylesForGenre(genreCategory).map((s) => ({ value: s.id, label: s.label }))]}
                        />
                      </label>
                    )}
                    <p className="text-xs text-faint sm:col-span-2">
                      Mixing genres? Pick the dominant one — your description carries the blend into every reel.
                      Finer tuning lives in channel settings.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="card p-5">
              <SectionLabel>Your channel&apos;s voice</SectionLabel>
              <p className="mt-1 text-xs text-faint">
                We wrote you an example. Edit it, rewrite it, or paste your own — whatever you leave here is what
                every reel learns from.
              </p>

              {/* Two clear paths: keep ours, or write your own. Each keeps its OWN text, so switching
                  back and forth never loses either — and our example can't drift into the box they
                  write in, which is what would launder it into a reference script. */}
              <div className="mt-3 inline-flex rounded-lg border border-border bg-subtle p-0.5">
                {([
                  ['forme', 'Write one for me'],
                  ['own', "I'll write my own"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSampleMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      sampleMode === mode ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {sampleMode === 'forme' ? (
                <div className="mt-4">
                  {/* While a write is pending or in flight the OLD example is never shown: it belongs to
                      the genre/description that was just replaced, and a stale story reads as a wrong
                      one. It stays in state, so a failed write falls back to it instead of an empty box. */}
                  {sampleSettling ? (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
                        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                      </svg>
                      {sampleScript.trim() ? 'Rewriting your example…' : 'Writing an example in your channel’s voice…'}
                    </div>
                  ) : (
                    <>
                      {/* Honest framing: an untouched draft of ours persists for the record but is NOT a
                          reference (circular DNA — see create/route.ts). Editing flips it to 'user',
                          which does teach the voice, so tell the creator exactly that. */}
                      <p className="text-xs text-faint">
                        {!sampleScript.trim()
                          ? 'Write an example to hear how your channel sounds — or switch to “I’ll write my own”.'
                          : sampleIsAi
                            ? 'How your channel could sound. Make it yours — rewrite even a few lines — and it starts teaching your channel’s voice.'
                            : 'Your example — edit it freely. Rewrite rebuilds this same story in your channel’s voice.'}
                      </p>
                      {sampleScript.trim() && (
                        <textarea
                          className="input mt-2 h-64 resize-none leading-relaxed"
                          value={sampleScript}
                          onChange={(e) => setActiveSample(e.target.value)}
                        />
                      )}
                      {/* One control. The idea line steers it; a script THEY wrote is rebuilt rather than
                          replaced, so a rough draft pasted here comes back told properly. */}
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          className="input flex-1"
                          value={mainSteer}
                          onChange={(e) => setMainSteer(e.target.value)}
                          placeholder={sampleScript.trim() ? 'Optional — an idea, or a change to make' : 'Optional — what should it be about?'}
                          maxLength={2000}
                        />
                        <button
                          type="button"
                          onClick={() => handleSampleDraft(mainSteer, sampleIsAi ? {} : { reviseDraft: sampleScript })}
                          disabled={drafting}
                          className="btn-secondary flex-shrink-0"
                        >
                          {drafting ? 'Writing…' : sampleScript.trim() ? 'Rewrite' : 'Write it'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <textarea
                  className="input mt-4 h-64 resize-none leading-relaxed"
                  value={sampleScript}
                  onChange={(e) => setActiveSample(e.target.value)}
                  placeholder="Write or paste a real opening in your channel's voice — the first lines exactly as you'd want them narrated, in any niche and any language. This is what every reel will sound like, so the closer to your real voice, the better."
                />
              )}
              {sampleError && <p className="mt-2 text-xs text-danger">{sampleError}</p>}

              {/* More examples — few-shot is stronger with 2–3. Offered only once a first example exists.
                  Paste-only on purpose: these persist as reference stories, and an example we wrote must
                  never teach the Writer its own output. */}
              {(sampleScript.trim() || extraSampleScripts.length > 0) && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs text-faint">Got more scripts of your own? Each one sharpens the match — add up to two (optional).</p>
                  {extraSampleScripts.map((s, i) => (
                    <div key={i} className="mt-3">
                      <div className="relative">
                        <textarea
                          className="input h-28 w-full resize-none pl-3 pr-11 leading-relaxed"
                          value={s}
                          onChange={(e) => setExtraSampleScripts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                          placeholder="Paste another script of yours"
                        />
                        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => setExtraSampleScripts((prev) => prev.filter((_, j) => j !== i))}
                            className="rounded-md p-1.5 text-faint transition-colors hover:bg-subtle hover:text-danger"
                            title="Remove this example"
                            aria-label="Remove this example"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {extraSampleScripts.length < 2 && (
                    <button type="button" onClick={() => setExtraSampleScripts((prev) => [...prev, ''])} className="btn-ghost btn-sm mt-3">
                      + Paste another script
                    </button>
                  )}
              </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('describe')} className="btn-secondary btn-lg">
                <BackArrow /> Back
              </button>
              <div className="flex flex-col items-end gap-1">
                {!sampleScript.trim() && (
                  <p className="text-xs text-faint">No script is fine — your channel learns from its first approved reels.</p>
                )}
                <button onClick={() => setPhase('voice')} className="btn-accent btn-lg btn-glow">
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
              <p className="mt-1 text-xs text-faint">Preview and pick a voice. Names and descriptions aren&apos;t editable.</p>

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
              <button onClick={() => setPhase('script')} className="btn-secondary btn-lg">
                <BackArrow /> Back
              </button>
              <button onClick={() => setPhase('sound')} disabled={!canLeaveVoice} className="btn-accent btn-lg btn-glow">
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
                The music under your narration — it always stays soft under the voice, never over it.
              </p>

              {/* Radio rows — same pattern as Step 3's voice mode, for consistency. */}
              <div className="mt-4 flex flex-col gap-2">
                {([
                  { key: 'ai', label: 'Original score', sub: 'A fresh track composed for every reel — nothing to pick.', badge: 'Recommended' },
                  { key: 'preset', label: 'From our library', sub: 'Pick ready-made tracks fitted to your channel.', badge: '' },
                  { key: 'upload', label: 'Your own music', sub: 'Upload tracks you have the rights to use.', badge: '' },
                  { key: 'none', label: 'No music', sub: 'Narration only.', badge: '' },
                ] as const).map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${musicChoice === opt.key ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border-strong hover:bg-subtle'}`}
                  >
                    <input
                      type="radio"
                      name="musicChoice"
                      checked={musicChoice === opt.key}
                      onChange={() => { stopPreview(); setMusicChoice(opt.key) }}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{opt.label}</span>
                        {opt.badge ? (
                          <span className="rounded-full bg-accent/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-accent">{opt.badge}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{opt.sub}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* Presets — our mood beds, ranked by niche + mood; pick one or several (random per reel) */}
              {musicChoice === 'preset' && (
                <div className="mt-4">
                  {(() => {
                    const ranked = rankPresets({ niche, moodTags: audioMood?.moodTags ?? [], tone })
                    if (ranked.length === 0) {
                      return (
                        <p className="rounded-lg border border-border bg-subtle px-3 py-2.5 text-xs leading-relaxed text-muted">
                          Presets are being prepared. For now, pick{' '}
                          <span className="font-medium text-ink">Original score</span> (a fresh track per reel) or{' '}
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

              {/* AI-generated — the effect (fresh bed per reel) is in the row sub; this adds cost + vetting detail. */}
              {musicChoice === 'ai' && (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Every reel gets its own track — a few cents per reel — composed for that story&apos;s mood and your channel&apos;s sound, so no two reels share music. You&apos;ll hear it in the preview before publishing. Prefer no per-reel cost? Pick <span className="font-medium text-ink">From our library</span>.
                </p>
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
              <button onClick={() => { stopPreview(); setPhase('voice') }} className="btn-secondary btn-lg">
                <BackArrow /> Back
              </button>
              <button onClick={() => { stopPreview(); setPhase('visual') }} className="btn-accent btn-lg btn-glow">
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
                Pick a look for your channel — or upload your own reference. You can generate a custom look tailored to your channel later, in Settings.
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
                                <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-ink/85 px-1.5 py-0.5 font-mono text-[8px] font-700 uppercase tracking-micro leading-none text-white shadow-sm">Uploaded</span>
                              ) : idx === 0 ? (
                                <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-accent px-1.5 py-0.5 font-mono text-[8px] font-700 uppercase tracking-micro leading-none text-white shadow-sm">Recommended</span>
                              ) : null}
                              {selected && (
                                <span className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-pair-purple-pink text-white shadow-sm">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
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
                      {/* Name the shared scene: every card is the SAME moment, so the only thing
                          being compared is the look. Without this the repetition reads as a bug. */}
                      {styleProposals.sampleScene && (
                        <p className="mt-1 text-[11px] text-faint">
                          Every look shown on the same scene — {styleProposals.sampleScene}
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
                {platformPreset.aspect === '16:9'
                  ? 'Long-form viewers watch with sound on, so we leave the picture clean by default. Turn this on if you want words burned into the video.'
                  : 'Burned into every reel (most are watched on mute) — playing live below, just like in the video. Suggested for your niche; switch anytime.'}
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium text-muted">
                <input
                  type="checkbox"
                  checked={captionStyle.enabled !== false}
                  onChange={(e) => {
                    setCaptionsTouched(true)
                    setCaptionStyle((cs) => ({ ...cs, enabled: e.target.checked }))
                  }}
                />
                Burn captions onto the video
              </label>
              {captionStyle.enabled !== false && (
                <>
                  <div className="mt-3">
                    <CaptionPreview
                      key={captionStyle.preset}
                      style={captionStyle}
                      safeZonePct={platformPreset.safeZoneBottomPct}
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
                        onClick={() => setCaptionStyle((cs) => ({ ...resolveCaptionStyle(o.preset, { highlightColor: cs.highlightColor, color: cs.color }), enabled: cs.enabled }))}
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
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
              <button onClick={() => setPhase('sound')} className="btn-secondary btn-lg">
                <BackArrow /> Back
              </button>
              {/* Setup spend is recorded server-side per call and claimed by the channel at create;
                  it is deliberately not shown here — a running meter reads as a taxi meter and makes
                  creators hesitate on every optional button. Totals live in /admin/costs. */}
              <div className="flex flex-col items-end gap-1">
                {sampleSettling && <p className="text-xs text-faint">Finishing your example…</p>}
                <button onClick={handleCreate} disabled={creating || !canCreate} className="btn-accent btn-lg btn-glow">
                  {creating ? 'Creating…' : 'Create channel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

        <GreenlightPoster
          stepIndex={PHASE_ORDER.indexOf(phase)}
          name={name}
          description={description}
          initials={posterInitials}
          language={language}
          platformLabel={posterPlatformLabel}
          genreTags={posterGenreTags}
          voiceMode={voiceMode ?? ''}
          voiceName={selectedVoices[0]?.name ?? ''}
          musicLabel={posterMusicLabel}
          styleLabel={posterStyleLabel}
          captionLabel={posterCaptionLabel}
          styleImageUrl={posterStyleImageUrl}
        />
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
              Save it as a draft on your dashboard to pick up later, or discard it and start fresh.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setLeaveTo(null)} disabled={savingDraft} className="btn-ghost btn-sm">Keep editing</button>
              <button type="button" onClick={leaveDiscardDraft} disabled={savingDraft} className="btn-danger btn-sm">Discard</button>
              <button type="button" onClick={leaveKeepDraft} disabled={savingDraft} className="btn-accent btn-sm">{savingDraft ? 'Saving…' : 'Leave & save'}</button>
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
  drama:
    '<path d="M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 12 5.5 4.5 4.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7Z"/>',
  comedy:
    '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
  lifestyle:
    '<path d="M20 7h-9M14 17H5M17 3l3 4-3 4M7 21l-3-4 3-4"/>',
  general:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
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

// Narrates the whole step-1 wait so it never reads as a hang. It covers two phases back to back — the
// profile build, then writing the channel's first example — which is why the later beats are about the
// story. Clamps on the last beat rather than looping, so a slow call doesn't look like it restarted.
const DERIVE_BEATS = [
  'Reading your idea…',
  'Finding your genre…',
  'Casting the narrator…',
  'Setting the look…',
  'Writing your first story…',
  'Almost there…',
]
function DeriveBeats() {
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBeat((b) => Math.min(b + 1, DERIVE_BEATS.length - 1)), 2800)
    return () => clearInterval(t)
  }, [])
  return <>{DERIVE_BEATS[beat]}</>
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
        <img src={avatarPreview} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
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
  // A rounded square, not a circle: it's the same tile the channel wears on its poster, its card and the
  // reel slate, so the shape should agree everywhere. The gradient stays per-NAME (avatarGradient) rather
  // than the mock's one fixed pair — that tint is the channel's identity, and the dashboard card's corner
  // glow is derived from the same seed. The pencil badge replaces the old hover-only camera overlay and
  // its "Avatar" caption: discoverable without hovering, and it costs no vertical space.
  const hasGradient = !preview && committedName.length > 0
  return (
    <div className="relative flex-shrink-0">
      <label
        className={`relative flex h-[60px] w-[60px] cursor-pointer items-center justify-center overflow-hidden rounded-lg font-display text-[21px] font-800 shadow-xs transition-transform hover:scale-[1.03] ${
          hasGradient ? 'text-white' : preview ? '' : 'border border-border-strong bg-subtle text-faint'
        }`}
        style={hasGradient ? { background: avatarGradient(committedName) } : undefined}
        title={preview ? 'Change avatar' : 'Add an avatar (optional)'}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{avatarInitials(committedName)}</span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-spin" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" />
            </svg>
          </span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
      {/* Outside the label but pointer-events-none, so it reads as attached while every click still
          lands on the label's file input — one target, no dead pixels. */}
      <span className="pointer-events-none absolute -bottom-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border border-border-mid bg-surface shadow-sm">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9B3BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
      {/* Only reachable once there's something to remove, so the empty state stays a single control. */}
      {preview && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove avatar"
          aria-label="Remove avatar"
          className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-border-mid bg-surface text-faint shadow-sm transition-colors hover:border-danger/40 hover:text-danger"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
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
      {/* Gradient disc when chosen; an empty ring otherwise — the pick reads at a glance down the list. */}
      <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full ${selected ? 'bg-pair-purple-pink text-white' : 'border border-border-strong'}`}>
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        )}
      </span>
    </div>
  )
}

// Header progress. Steps already passed are clickable so the creator can go back and change an answer;
// FORWARD stays with the step's own CTA, which is where the gating lives (a profile must be derived
// before steps 2–5 have anything to show, and the voice step needs a pick).
function StepTimeline({ phase, onGo }: { phase: Phase; onGo: (p: Phase) => void }) {
  const current = PHASE_ORDER.indexOf(phase)
  return (
    <div className="hidden items-center md:flex">
      {PHASE_ORDER.map((p, i) => {
        const active = i === current
        const done = i < current
        return (
          <div key={p} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onGo(p)}
              disabled={i > current}
              title={done ? `Back to ${STEP_TAB[p]}` : STEP_TAB[p]}
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[11px] font-700 transition-colors ${
                active
                  ? 'bg-brand-3 text-white'
                  : done
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'bg-subtle-strong text-faint shadow-[inset_0_0_0_1px_#E4E1EE]'
              } ${i > current ? 'cursor-default' : 'cursor-pointer'}`}
            >
              {i + 1}
            </button>
            <span className={`text-xs ${active ? 'font-700 text-ink' : 'font-500 text-faint'}`}>{STEP_TAB[p]}</span>
            {i < PHASE_ORDER.length - 1 && <span className="mx-2 h-0.5 w-5 bg-border-mid" aria-hidden />}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-wrap items-baseline gap-x-2 text-sm font-600 text-ink">
        {label}
        {hint && <span className="text-xs font-400 text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[15px] font-700 -tracking-[0.01em] text-ink">{children}</p>
}
