import { ElevenLabsClient } from 'elevenlabs'
import type { Readable } from 'node:stream'
import { uploadBuffer } from '../shared/storage.js'
import { ProviderError, ProviderRateLimitError } from '../shared/types.js'
import { withProviderLimit } from '../shared/limiter.js'
import type { AlignedChar, SfxResult, TtsProvider, TtsResult } from './types.js'
import type { VoiceSettings } from '@reels/core'

// ── ElevenLabs cost basis (unified, Phase A 2026-07-24) ───────────────────────────────────────────────
// ALL ElevenLabs rates below derive from ONE documented plan basis, so unit economics are honest and re-
// derivable (constitution principle 7 — per-story cost accounting is a named foundation). We license on the
// Creator plan (see the ElevenLabs music-licensing note): $22 / 121,000 credits = 0.01818¢/credit. The old
// constants split bases — TTS/SFX quoted a Starter $5/30k basis while music is licensed on Creator — a ~10%
// skew. 2026 ElevenLabs rates: TTS ~1 credit/char; SFX 40 credits/sec when duration_seconds is set (the path
// we always take); Music 900 credits/min.
const ELEVEN_CENTS_PER_CREDIT = 2200 / 121_000 // = 0.01818¢/credit
// TTS: ~1 credit/char → 1000 chars ≈ 18.2¢; rounded up so a reel never under-counts.
const TTS_COST_CENTS_PER_1K_CHARS = 20
// SFX (duration specified): 40 credits/sec × 0.01818 ≈ 0.727¢/s; rounded up. Scales with clip length.
const SFX_COST_CENTS_PER_SEC = 0.75
// Default prompt adherence. Higher = the clip sounds more like the literal prompt (good for specific
// one-shots); lower leaves room for richer, more organic texture (ambience). Per-cue override via param.
const SFX_DEFAULT_PROMPT_INFLUENCE = 0.5
// ElevenLabs SFX prompt hard cap (~450 chars → 400 request). We cap under it so a long prompt truncates
// instead of failing the reel.
const SFX_PROMPT_MAX_CHARS = 420

function getClient(): ElevenLabsClient {
  const apiKey = process.env['ELEVENLABS_API_KEY']
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')
  return new ElevenLabsClient({ apiKey })
}

// Per-request resilience: each attempt times out, and transient failures
// (connection/429/5xx) auto-retry once. TTS gets a longer budget than metadata.
const QUICK_OPTS = { maxRetries: 1, timeoutInSeconds: 30 }
const TTS_OPTS = { maxRetries: 1, timeoutInSeconds: 120 }
const SFX_OPTS = { maxRetries: 1, timeoutInSeconds: 60 }

// ── Voice library ───────────────────────────────────────────────────────────
// Real, selectable voices from the ElevenLabs account. Metadata is read-only;
// previewUrl plays an instant sample (no synthesis cost).

export interface VoiceOption {
  id: string          // ElevenLabs voice_id
  name: string        // short name, e.g. "Sarah"
  gender: string      // male | female | neutral
  description: string // e.g. "mature, reassuring, confident"
  accent: string
  previewUrl: string
}

// Map our display languages → ElevenLabs language codes. Tagalog/Taglish → 'fil'.
const LANG_CODE: Record<string, string> = {
  english: 'en', tagalog: 'fil', taglish: 'fil', filipino: 'fil',
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  polish: 'pl', dutch: 'nl', japanese: 'ja', chinese: 'zh', korean: 'ko',
  hindi: 'hi', arabic: 'ar', turkish: 'tr', russian: 'ru', indonesian: 'id',
  malay: 'ms', vietnamese: 'vi', ukrainian: 'uk', greek: 'el', czech: 'cs',
  danish: 'da', finnish: 'fi', croatian: 'hr', bulgarian: 'bg', romanian: 'ro',
  slovak: 'sk', tamil: 'ta', swedish: 'sv',
}

export function toElevenLabsLang(display: string): string {
  return LANG_CODE[display.trim().toLowerCase()] ?? 'en'
}

function shortNameDesc(fullName: string, fallbackDesc: string): { name: string; description: string } {
  const [short, ...rest] = fullName.split(' - ')
  return { name: short || fullName || 'Voice', description: (rest.join(' - ') || fallbackDesc || '').slice(0, 120) }
}

function mapSharedVoice(v: Record<string, unknown>): VoiceOption {
  const { name, description } = shortNameDesc(String(v['name'] ?? ''), String(v['descriptive'] ?? v['description'] ?? ''))
  return {
    id: String(v['voice_id'] ?? ''),
    name,
    gender: String(v['gender'] ?? 'neutral'),
    description,
    accent: String(v['accent'] ?? ''),
    previewUrl: String(v['preview_url'] ?? ''),
  }
}

const getShared = (params: Record<string, unknown>) =>
  (getClient().voices.getShared as unknown as (p: Record<string, unknown>, o: typeof QUICK_OPTS) => Promise<Record<string, unknown>>)(params, QUICK_OPTS)

// Lists narrator voices for `language` from the shared library, scoped to
// narration use-case and sorted by popularity. `opts.search` adds a genre/topic
// keyword (e.g. "horror") to surface voices branded for that niche.
export async function listVoices(language?: string, opts?: { search?: string }): Promise<VoiceOption[]> {
  const code = language ? toElevenLabsLang(language) : 'en'
  const base = { language: code, useCases: 'narrative_story', sort: 'cloned_by_count', pageSize: 40 }

  let res = await getShared(opts?.search ? { ...base, search: opts.search } : base)
  let voices = ((res['voices'] ?? []) as unknown) as Array<Record<string, unknown>>

  // The genre keyword may be too narrow → retry without it.
  if (voices.length === 0 && opts?.search) {
    res = await getShared(base)
    voices = ((res['voices'] ?? []) as unknown) as Array<Record<string, unknown>>
  }
  // Some languages have few/no narration-tagged voices → widen to any use-case.
  if (voices.length === 0) {
    res = await getShared({ language: code, sort: 'cloned_by_count', pageSize: 40 })
    voices = ((res['voices'] ?? []) as unknown) as Array<Record<string, unknown>>
  }

  return voices.map(mapSharedVoice)
}

// Expand ElevenLabs CharacterAlignmentResponseModel → AlignedChar[].
// Validates the docs/08 §1 invariant: length must equal Array.from(narration).length.
function toAlignedChars(
  narration: string,
  chars: string[],
  startSecs: number[],
  endSecs: number[],
): AlignedChar[] {
  const narrationCps = Array.from(narration)

  if (chars.length !== narrationCps.length) {
    throw new ProviderError(
      'elevenlabs',
      `Alignment length mismatch: narration has ${narrationCps.length} code points, ` +
        `alignment has ${chars.length}. narration must be submitted verbatim [M10]`,
    )
  }

  return chars.map((ch, i) => ({
    ch,
    startMs: Math.round((startSecs[i] ?? 0) * 1000),
    endMs: Math.round((endSecs[i] ?? 0) * 1000),
  }))
}

async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks)
}

// ── TTS synthesis ─────────────────────────────────────────────────────────────

// eleven_multilingual_v2 caps one request at ~10k chars. Long-form narrations (a 10-min video ≈ 9k
// chars, and BYO scripts can exceed it) are synthesized in chunks whose CONCATENATION IS BYTE-IDENTICAL
// to the narration, so the merged alignment stays 1:1 with Array.from(narration) [M10]. Chunk seams cut
// at sentence/whitespace boundaries (never mid-word, never mid-surrogate).
const TTS_CHUNK_THRESHOLD_CHARS = 9_500
const TTS_CHUNK_MAX_CHARS = 9_000

export function splitNarrationForTts(narration: string, maxChars: number = TTS_CHUNK_MAX_CHARS): string[] {
  if (narration.length <= maxChars) return [narration]
  const chunks: string[] = []
  let start = 0
  while (start < narration.length) {
    if (narration.length - start <= maxChars) {
      chunks.push(narration.slice(start))
      break
    }
    const window = narration.slice(start, start + maxChars)
    // Prefer the last sentence end in the window; a boundary in the front half wastes half the request
    // budget, so fall back to the last whitespace (then a hard cut, guarding the surrogate pair).
    let cut = -1
    const re = /[.!?…]+["»”')\]]*\s/g
    for (let m = re.exec(window); m; m = re.exec(window)) cut = m.index + m[0].length
    if (cut < maxChars * 0.5) {
      const ws = window.search(/\s\S*$/) // last whitespace run's start
      cut = ws > 0 ? ws + 1 : -1
    }
    if (cut <= 0) {
      cut = maxChars
      const cu = narration.charCodeAt(start + cut)
      if (cu >= 0xdc00 && cu <= 0xdfff) cut-- // don't split a surrogate pair
    }
    chunks.push(narration.slice(start, start + cut))
    start += cut
  }
  return chunks
}

// Exact audio length of a CBR MPEG-1 Layer III stream (ElevenLabs mp3_44100_128): walk the frame
// headers and sum samples. Chunk alignments are offset by the REAL audio length of the chunks before
// them — the alignment's own last-char end understates the file by the encoder tail, and that error
// would accumulate across seams as caption/scene drift. Returns null on anything unparseable.
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] // kbps
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000]
export function mp3DurationMs(buf: Buffer): number | null {
  let i = 0
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    // Skip an ID3v2 tag (syncsafe 28-bit size)
    i = 10 + (((buf[6]! & 0x7f) << 21) | ((buf[7]! & 0x7f) << 14) | ((buf[8]! & 0x7f) << 7) | (buf[9]! & 0x7f))
  }
  let samples = 0
  let sampleRate = 44100
  let frames = 0
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1]! & 0xe0) !== 0xe0) { i++; continue }
    const versionBits = (buf[i + 1]! >> 3) & 0x03
    const layerBits = (buf[i + 1]! >> 1) & 0x03
    if (versionBits !== 3 || layerBits !== 1) { i++; continue } // MPEG-1 Layer III only
    const bitrate = MPEG1_L3_BITRATES[(buf[i + 2]! >> 4) & 0x0f]
    const sr = MPEG1_SAMPLE_RATES[(buf[i + 2]! >> 2) & 0x03]
    if (!bitrate || !sr) { i++; continue }
    const frameLen = Math.floor((144_000 * bitrate) / sr) + ((buf[i + 2]! >> 1) & 0x01)
    if (frameLen <= 0) { i++; continue }
    samples += 1152
    sampleRate = sr
    frames++
    i += frameLen
  }
  return frames > 0 ? Math.round((samples / sampleRate) * 1000) : null
}

export class ElevenLabsTtsProvider implements TtsProvider {
  async synthesize(params: {
    narration: string
    voiceId: string
    reelId: string
    voiceSettings?: VoiceSettings
  }): Promise<TtsResult> {
    const client = getClient()

    try {
      // Narration over the model's single-request cap synthesizes in chunks that concatenate back to
      // the verbatim text (see splitNarrationForTts) [M10]. One chunk = today's single-request path.
      const chunks = params.narration.length > TTS_CHUNK_THRESHOLD_CHARS
        ? splitNarrationForTts(params.narration)
        : [params.narration]

      const audioBuffers: Buffer[] = []
      const alignedChars: AlignedChar[] = []
      let offsetMs = 0

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!
        // convertWithTimestamps returns AudioWithTimestampsResponse (not a stream)
        // chunk text submitted verbatim — no pre-processing [M10]
        const response = await withProviderLimit('elevenlabs', () => client.textToSpeech.convertWithTimestamps(params.voiceId, {
          text: chunk,
          model_id: 'eleven_multilingual_v2',
          output_format: 'mp3_44100_128',
          // Per-reel delivery derived from the story's mood (omitted → ElevenLabs defaults).
          ...(params.voiceSettings ? { voice_settings: params.voiceSettings } : {}),
          // Prosody continuity across chunk seams: the model hears what surrounds this chunk.
          ...(i > 0 ? { previous_text: chunks[i - 1]!.slice(-300) } : {}),
          ...(i < chunks.length - 1 ? { next_text: chunks[i + 1]!.slice(0, 300) } : {}),
        }, TTS_OPTS))

        const { audio_base64, alignment } = response
        if (!alignment) {
          throw new ProviderError('elevenlabs', `No alignment data in TTS response (chunk ${i + 1}/${chunks.length})`)
        }

        const audioBuffer = Buffer.from(audio_base64, 'base64')
        const chunkChars = toAlignedChars(
          chunk,
          alignment.characters,
          alignment.character_start_times_seconds,
          alignment.character_end_times_seconds,
        )
        for (const c of chunkChars) {
          alignedChars.push({ ...c, startMs: c.startMs + offsetMs, endMs: c.endMs + offsetMs })
        }
        audioBuffers.push(audioBuffer)
        // Offset the NEXT chunk by this chunk's real audio length (frame-walked). The alignment's own
        // last-char end understates the file by the encoder tail — an error that would accumulate at
        // every seam as caption/scene drift. Fall back to the alignment end if the frames don't parse.
        offsetMs += mp3DurationMs(audioBuffer) ?? (chunkChars[chunkChars.length - 1]?.endMs ?? 0)
      }

      // MP3 frames concatenate cleanly (each ElevenLabs response is a fresh CBR stream, and seams sit
      // in the silence of a sentence boundary); everything downstream decodes through ffmpeg anyway.
      const audioBuffer = audioBuffers.length === 1 ? audioBuffers[0]! : Buffer.concat(audioBuffers)

      const lastChar = alignedChars[alignedChars.length - 1]
      const durationMs = lastChar?.endMs ?? 0

      const storageKey = `reels/${params.reelId}/voiceover.mp3`
      await uploadBuffer(storageKey, audioBuffer, 'audio/mpeg')

      const costCents = Math.ceil((params.narration.length / 1000) * TTS_COST_CENTS_PER_1K_CHARS)

      return { audioStorageKey: storageKey, durationMs, alignment: alignedChars, costCents }
    } catch (err) {
      if (err instanceof ProviderError) throw err
      if (Number((err as Record<string, unknown>)['statusCode']) === 429) {
        throw new ProviderRateLimitError('elevenlabs')
      }
      throw new ProviderError('elevenlabs', String(err))
    }
  }
}

// ── SFX generation ────────────────────────────────────────────────────────────

export async function generateSfx(params: {
  prompt: string
  reelId: string
  anchorLabel: string
  durationSec?: number
  promptInfluence?: number
  // Sustained cue: ask ElevenLabs for a seamlessly loopable clip (the mixer loops it across a story span).
  loop?: boolean
  // Optional stable suffix appended AFTER the (truncated) anchor slug. Two cues whose anchors share a
  // 40-char prefix — or a new design reusing an old anchor with a different sound — would otherwise map to
  // the SAME storage key and silently collide; a per-cue suffix (e.g. a hash of anchor+prompt+duration)
  // keeps each distinct cue on its own key.
  slugSuffix?: string
}): Promise<SfxResult> {
  const client = getClient()
  const durationSec = params.durationSec ?? 2
  // ElevenLabs text-to-sound-effects rejects prompts over ~450 chars with a 400 (which, un-caught, fails
  // the whole reel). Cap defensively so no prompt — LLM or deterministic — can ever break a render.
  const text = params.prompt.length > SFX_PROMPT_MAX_CHARS ? params.prompt.slice(0, SFX_PROMPT_MAX_CHARS) : params.prompt

  try {
    // textToSoundEffects.convert returns a Readable stream. `loop` is supported by the API but missing
    // from the installed SDK v1 body type, so it rides through a cast.
    const body = {
      text,
      duration_seconds: durationSec,
      prompt_influence: params.promptInfluence ?? SFX_DEFAULT_PROMPT_INFLUENCE,
      ...(params.loop ? { loop: true } : {}),
    } as Parameters<typeof client.textToSoundEffects.convert>[0]
    const stream = (await withProviderLimit('elevenlabs', () => client.textToSoundEffects.convert(body, SFX_OPTS))) as Readable

    const audioBuffer = await readableToBuffer(stream)
    const slug = params.anchorLabel.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
    const suffix = params.slugSuffix ? `-${params.slugSuffix}` : ''
    const storageKey = `reels/${params.reelId}/sfx/${slug}${suffix}.mp3`
    await uploadBuffer(storageKey, audioBuffer, 'audio/mpeg')

    const durationMs = Math.ceil(durationSec * 1000)
    const costCents = Math.max(1, Math.ceil(durationSec * SFX_COST_CENTS_PER_SEC))

    return { audioStorageKey: storageKey, durationMs, costCents }
  } catch (err) {
    if (Number((err as Record<string, unknown>)['statusCode']) === 429) {
      throw new ProviderRateLimitError('elevenlabs')
    }
    throw new ProviderError('elevenlabs', String(err))
  }
}

// ── Speech overlay (a SECOND voice for operator "spoken sound" cues) ───────────
// A short spoken/whispered line laid over the narration (e.g. an old woman whispering "come closer").
// Unlike the narrator's synthesize() — which writes the fixed voiceover key and needs alignment — this
// writes a CALLER-CHOSEN key (so it never clobbers the voiceover) and only needs the clip + its length.
export async function generateSpeechClip(params: {
  text: string
  voiceId: string
  storageKey: string
  voiceSettings?: VoiceSettings
}): Promise<{ audioStorageKey: string; durationMs: number; costCents: number }> {
  const client = getClient()
  try {
    const response = await withProviderLimit('elevenlabs', () => client.textToSpeech.convertWithTimestamps(params.voiceId, {
      text: params.text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
      ...(params.voiceSettings ? { voice_settings: params.voiceSettings } : {}),
    }, TTS_OPTS))
    const audioBuffer = Buffer.from(response.audio_base64, 'base64')
    const ends = response.alignment?.character_end_times_seconds
    const durationMs = ends && ends.length ? Math.ceil(ends[ends.length - 1]! * 1000) : 0
    await uploadBuffer(params.storageKey, audioBuffer, 'audio/mpeg')
    const costCents = Math.ceil((params.text.length / 1000) * TTS_COST_CENTS_PER_1K_CHARS)
    return { audioStorageKey: params.storageKey, durationMs, costCents }
  } catch (err) {
    if (err instanceof ProviderError) throw err
    if (Number((err as Record<string, unknown>)['statusCode']) === 429) throw new ProviderRateLimitError('elevenlabs')
    throw new ProviderError('elevenlabs', String(err))
  }
}

// ── Music generation (Eleven Music) ───────────────────────────────────────────
// The installed `elevenlabs` SDK (v1) exposes no music resource, so call the REST
// endpoint directly (verified: POST /v1/music, xi-api-key, {prompt, music_length_ms}
// → audio/mpeg). Returns the raw MP3 buffer; the CALLER uploads to R2, because the
// two consumers use different keys (channel signature track vs preset bed).

// Music: 900 credits/min → cost scales with clip length. The old flat 10¢ under-counted every reel over
// ~40s (real ~16¢/60s, ~37¢/135s → 3.7× at 135s). Music credits are a deterministic function of length, so
// this is effectively exact.
const MUSIC_CREDITS_PER_MIN = 900
function musicCostCents(lengthMs: number): number {
  return Math.max(1, Math.ceil((lengthMs / 60_000) * MUSIC_CREDITS_PER_MIN * ELEVEN_CENTS_PER_CREDIT))
}
const MUSIC_MIN_MS = 10_000       // Eleven Music length bounds
const MUSIC_MAX_MS = 300_000

export interface MusicResult {
  audio: Buffer
  durationMs: number
  costCents: number
}

export async function generateMusic(params: {
  prompt: string
  lengthMs: number
  forceInstrumental?: boolean  // default true — these are background beds, vocals would fight narration
}): Promise<MusicResult> {
  const apiKey = process.env['ELEVENLABS_API_KEY']
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

  const musicLengthMs = Math.min(MUSIC_MAX_MS, Math.max(MUSIC_MIN_MS, Math.round(params.lengthMs)))

  try {
    const res = await withProviderLimit('elevenlabs', () => fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      // force_instrumental GUARANTEES no vocals (prompt text alone doesn't reliably suppress them).
      body: JSON.stringify({
        prompt: params.prompt,
        music_length_ms: musicLengthMs,
        force_instrumental: params.forceInstrumental ?? true,
      }),
      signal: AbortSignal.timeout(180_000),
    }))
    if (res.status === 429) throw new ProviderRateLimitError('elevenlabs')
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ProviderError('elevenlabs', `music generation failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const audio = Buffer.from(await res.arrayBuffer())
    return { audio, durationMs: musicLengthMs, costCents: musicCostCents(musicLengthMs) }
  } catch (err) {
    if (err instanceof ProviderError || err instanceof ProviderRateLimitError) throw err
    throw new ProviderError('elevenlabs', `music request failed: ${String(err)}`)
  }
}
