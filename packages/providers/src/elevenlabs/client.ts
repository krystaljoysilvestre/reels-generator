import { ElevenLabsClient } from 'elevenlabs'
import type { Readable } from 'node:stream'
import { uploadBuffer } from '../shared/storage.js'
import { ProviderError, ProviderRateLimitError } from '../shared/types.js'
import type { AlignedChar, SfxResult, TtsProvider, TtsResult } from './types.js'
import type { VoiceSettings } from '@reels/core'

const TTS_COST_CENTS_PER_1K_CHARS = 30  // ElevenLabs Starter ~$0.30/1k chars
const SFX_COST_CENTS_FLAT = 2

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

export class ElevenLabsTtsProvider implements TtsProvider {
  async synthesize(params: {
    narration: string
    voiceId: string
    reelId: string
    voiceSettings?: VoiceSettings
  }): Promise<TtsResult> {
    const client = getClient()

    try {
      // convertWithTimestamps returns AudioWithTimestampsResponse (not a stream)
      // narration submitted verbatim — no pre-processing [M10]
      const response = await client.textToSpeech.convertWithTimestamps(params.voiceId, {
        text: params.narration,
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_128',
        // Per-reel delivery derived from the story's mood (omitted → ElevenLabs defaults).
        ...(params.voiceSettings ? { voice_settings: params.voiceSettings } : {}),
      }, TTS_OPTS)

      const { audio_base64, alignment } = response

      if (!alignment) {
        throw new ProviderError('elevenlabs', 'No alignment data in TTS response')
      }

      const audioBuffer = Buffer.from(audio_base64, 'base64')
      const alignedChars = toAlignedChars(
        params.narration,
        alignment.characters,
        alignment.character_start_times_seconds,
        alignment.character_end_times_seconds,
      )

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
}): Promise<SfxResult> {
  const client = getClient()

  try {
    // textToSoundEffects.convert returns a Readable stream
    const stream = (await client.textToSoundEffects.convert({
      text: params.prompt,
      duration_seconds: params.durationSec ?? 2,
      prompt_influence: 0.3,
    }, SFX_OPTS)) as Readable

    const audioBuffer = await readableToBuffer(stream)
    const slug = params.anchorLabel.toLowerCase().replace(/\s+/g, '-').slice(0, 40)
    const storageKey = `reels/${params.reelId}/sfx/${slug}.mp3`
    await uploadBuffer(storageKey, audioBuffer, 'audio/mpeg')

    const durationMs = Math.ceil((params.durationSec ?? 2) * 1000)

    return { audioStorageKey: storageKey, durationMs, costCents: SFX_COST_CENTS_FLAT }
  } catch (err) {
    if (Number((err as Record<string, unknown>)['statusCode']) === 429) {
      throw new ProviderRateLimitError('elevenlabs')
    }
    throw new ProviderError('elevenlabs', String(err))
  }
}

// ── Music generation (Eleven Music) ───────────────────────────────────────────
// The installed `elevenlabs` SDK (v1) exposes no music resource, so call the REST
// endpoint directly (verified: POST /v1/music, xi-api-key, {prompt, music_length_ms}
// → audio/mpeg). Returns the raw MP3 buffer; the CALLER uploads to R2, because the
// two consumers use different keys (channel signature track vs preset bed).

const MUSIC_COST_CENTS_FLAT = 10  // rough per-generation estimate for cost tracking
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
    const res = await fetch('https://api.elevenlabs.io/v1/music', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      // force_instrumental GUARANTEES no vocals (prompt text alone doesn't reliably suppress them).
      body: JSON.stringify({
        prompt: params.prompt,
        music_length_ms: musicLengthMs,
        force_instrumental: params.forceInstrumental ?? true,
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (res.status === 429) throw new ProviderRateLimitError('elevenlabs')
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ProviderError('elevenlabs', `music generation failed (${res.status}): ${body.slice(0, 300)}`)
    }
    const audio = Buffer.from(await res.arrayBuffer())
    return { audio, durationMs: musicLengthMs, costCents: MUSIC_COST_CENTS_FLAT }
  } catch (err) {
    if (err instanceof ProviderError || err instanceof ProviderRateLimitError) throw err
    throw new ProviderError('elevenlabs', `music request failed: ${String(err)}`)
  }
}
