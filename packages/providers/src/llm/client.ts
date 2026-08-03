import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { z } from 'zod'
import { ProviderError, ProviderRateLimitError, attachSpend } from '../shared/types.js'
import { withProviderLimit } from '../shared/limiter.js'
import { buildInputHash } from './input-hash.js'

// Provider-neutral LLM client. Generation runs on OpenAI by default; QA passes opt into
// Anthropic with `provider: 'anthropic'`. Every call, regardless of provider:
//  - requests JSON-only output and strips code fences before parsing
//  - validates with the caller's zod schema
//  - attempts one repair call on schema failure
//  - returns cost_cents alongside the parsed result

export type LlmProvider = 'openai' | 'anthropic'

// Provider-neutral message shape. String content covers the common case; the parts form
// carries vision input (an image + a question) without leaking either SDK's wire format.
export type LlmImagePart = { type: 'image'; mediaType: string; base64: string }
export type LlmTextPart = { type: 'text'; text: string }
export type LlmContentPart = LlmTextPart | LlmImagePart
export type LlmContent = string | LlmContentPart[]
export interface LlmMessage {
  role: 'user' | 'assistant'
  content: LlmContent
}

export interface LlmCallOptions<T> {
  templateVersion: string // e.g. 'story.v1'
  schema: z.ZodType<T>
  system: string
  messages: LlmMessage[]
  provider?: LlmProvider // defaults to 'openai' (generation); QA passes 'anthropic'
  model?: string
  maxTokens?: number
  temperature?: number // 0–1 (Anthropic's range; OpenAI accepts it too). Omit = provider default.
  // OpenAI only: answer from LIVE web results via the search-preview model (defaults the model to
  // gpt-4o-mini-search-preview). Those models reject `temperature`, so it's ignored when set here.
  // Each transport call adds OPENAI_WEB_SEARCH_FEE_CENTS on top of token cost.
  webSearch?: boolean
}

export interface LlmResult<T> {
  data: T
  costCents: number
  inputHash: string
}

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-6',
}

// Per-model pricing in cents per million tokens (input / output). Re-verify at each model bump.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI (USD/M → cents/M)
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'gpt-4o-mini-search-preview': { input: 15, output: 60 }, // token rates match mini; search fee added separately
  // Anthropic (QA) — cents per Mtok, matching published USD pricing ($/Mtok × 100)
  'claude-opus-4-8': { input: 500, output: 2500 },       // $5 / $25
  'claude-sonnet-4-6': { input: 300, output: 1500 },     // $3 / $15
  'claude-haiku-4-5-20251001': { input: 100, output: 500 }, // $1 / $5 — live QA model
}

const JSON_INSTRUCTION = '\n\nRespond with valid JSON only. No markdown, no code fences.'

// Per-call web-search tool fee for the search-preview models — OpenAI lists ~$27.50/1k calls
// (gpt-4o-mini-search-preview, medium search context, pricing page as of 2026-07). Rounded UP per
// the cost-accounting rule (never undercount); re-verify at each model bump.
const OPENAI_WEB_SEARCH_FEE_CENTS = 3

function calcCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']!
  return Math.ceil((inputTokens * rate.input + outputTokens * rate.output) / 1_000_000)
}

function stripFences(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers in case a model adds them anyway.
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

// Parse + validate, KEEPING the reason on failure. A bare `catch { return null }` here used to erase the
// only evidence of what went wrong: a schema failure reached the pipeline_steps row as 200 characters of
// raw JSON and no field names, so the same failure could never be diagnosed after the fact.
type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string }

// Exported for tests: the failure REASON is the product here, so it's worth pinning down.
export function tryParse<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  let json: unknown
  try {
    json = JSON.parse(stripFences(raw))
  } catch (err) {
    return { ok: false, reason: `not valid JSON (${err instanceof Error ? err.message : 'parse error'})` }
  }
  const parsed = schema.safeParse(json)
  if (parsed.success) return { ok: true, data: parsed.data }
  // Name the offending paths — "scenes.4.cameraMove: invalid enum value" is actionable; "failed" is not.
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  const more = parsed.error.issues.length > 5 ? ` (+${parsed.error.issues.length - 5} more)` : ''
  return { ok: false, reason: `schema mismatch — ${issues}${more}` }
}

let _anthropic: Anthropic | undefined
function getAnthropic() {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  // Each request times out at 60s and the SDK auto-retries transient failures
  // (connection errors, 429, 5xx) with backoff — so a blip doesn't strand the caller.
  _anthropic ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })
  return _anthropic
}

let _openai: OpenAI | undefined
function getOpenAI() {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  _openai ??= new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 })
  return _openai
}

// ── Per-provider transport: take neutral system+messages, return text + token usage ──

interface TransportResult {
  text: string
  inputTokens: number
  outputTokens: number
  // The model ran out of output budget mid-sentence rather than choosing to stop. Truncated JSON fails
  // schema validation for a reason that has nothing to do with the prompt, and the repair attempt — same
  // ceiling, longer input — fails the same way. Worth naming instead of guessing.
  truncated: boolean
}

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content }
    return {
      role: m.role,
      content: m.content.map((p) =>
        p.type === 'text'
          ? { type: 'text' as const, text: p.text }
          : {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: p.mediaType as 'image/png' | 'image/jpeg' | 'image/webp', data: p.base64 },
            },
      ),
    }
  })
}

async function callAnthropic(model: string, system: string, messages: LlmMessage[], maxTokens: number, temperature?: number): Promise<TransportResult> {
  const res = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system: system + JSON_INSTRUCTION,
    messages: toAnthropicMessages(messages),
    ...(temperature !== undefined ? { temperature } : {}),
  })
  return {
    text: res.content.find((b) => b.type === 'text')?.text ?? '',
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    truncated: res.stop_reason === 'max_tokens',
  }
}

function toOpenAIMessages(system: string, messages: LlmMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const mapped: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam
    const parts = m.content.map((p) =>
      p.type === 'text'
        ? { type: 'text' as const, text: p.text }
        : { type: 'image_url' as const, image_url: { url: `data:${p.mediaType};base64,${p.base64}` } },
    )
    return { role: m.role, content: parts } as OpenAI.Chat.ChatCompletionMessageParam
  })
  return [{ role: 'system', content: system + JSON_INSTRUCTION }, ...mapped]
}

async function callOpenAI(model: string, system: string, messages: LlmMessage[], maxTokens: number, temperature?: number, webSearch?: boolean): Promise<TransportResult> {
  // Search-preview models reject `temperature`; `web_search_options` may lag in the SDK's param type,
  // so the params object is widened rather than the field cast away.
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & { web_search_options?: Record<string, never> } = {
    model,
    max_tokens: maxTokens,
    messages: toOpenAIMessages(system, messages),
    ...(temperature !== undefined && !webSearch ? { temperature } : {}),
    ...(webSearch ? { web_search_options: {} } : {}),
  }
  const res = await getOpenAI().chat.completions.create(params)
  return {
    text: res.choices[0]?.message?.content ?? '',
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
    truncated: res.choices[0]?.finish_reason === 'length',
  }
}

// Map a raw SDK error into the provider error taxonomy. Both the OpenAI and Anthropic SDKs surface the
// HTTP status on `.status`. Without this, a 429 escapes untyped (no rate-limit branch) and — worse — a
// deterministic 400 (malformed request, invalid param, oversized image) is rethrown as a generic error
// that the dispatcher treats as retryable, so BullMQ re-runs the whole step 3× and re-bills every paid
// call in it for an error that can never succeed.
function classifyLlmError(provider: LlmProvider, err: unknown): Error {
  const status =
    err && typeof err === 'object' && 'status' in err ? Number((err as { status?: unknown }).status) : 0
  const message = err instanceof Error ? err.message : String(err)
  if (status === 429) return new ProviderRateLimitError(provider) // transient → BullMQ backoff retry
  // 4xx (except 429) is a deterministic client error — carry the status so the dispatcher fails fast
  // instead of retrying. 5xx / network / unknown stay as-is (transient → retried with backoff).
  if (status >= 400 && status < 500) return new ProviderError(provider, `${status}: ${message}`, status)
  return err instanceof Error ? err : new ProviderError(provider, message)
}

async function transport(provider: LlmProvider, model: string, system: string, messages: LlmMessage[], maxTokens: number, temperature?: number, webSearch?: boolean): Promise<TransportResult> {
  // Per-provider concurrency cap (the real throttle — see shared/limiter.ts).
  try {
    return await withProviderLimit(provider === 'anthropic' ? 'anthropic' : 'openai', () =>
      provider === 'anthropic'
        ? callAnthropic(model, system, messages, maxTokens, temperature)
        : callOpenAI(model, system, messages, maxTokens, temperature, webSearch),
    )
  } catch (err) {
    throw classifyLlmError(provider, err)
  }
}

export async function llmCall<T>(opts: LlmCallOptions<T>): Promise<LlmResult<T>> {
  const provider = opts.provider ?? 'openai'
  const webSearch = provider === 'openai' && opts.webSearch === true
  const model = opts.model ?? (webSearch ? 'gpt-4o-mini-search-preview' : DEFAULT_MODEL[provider])
  const searchFee = webSearch ? OPENAI_WEB_SEARCH_FEE_CENTS : 0
  const maxTokens = opts.maxTokens ?? 4096
  const inputHash = buildInputHash(opts.templateVersion, {
    system: opts.system,
    messages: opts.messages,
    provider,
    model,
  })

  // ── First attempt ─────────────────────────────────────────────────────────
  const res1 = await transport(provider, model, opts.system, opts.messages, maxTokens, opts.temperature, webSearch)
  const cost1 = calcCostCents(model, res1.inputTokens, res1.outputTokens) + searchFee
  const parsed1 = tryParse(res1.text, opts.schema)

  if (parsed1.ok) {
    return { data: parsed1.data, costCents: cost1, inputHash }
  }

  // ── One repair attempt ────────────────────────────────────────────────────
  // Tell the model WHAT was wrong. Re-asking for "the corrected JSON" without naming the offending field
  // is a coin flip; naming it makes the repair a targeted edit. When the first answer was cut off at the
  // token ceiling there is nothing to correct — say so, and ask for a shorter answer instead.
  const repairMessages: LlmMessage[] = [
    ...opts.messages,
    { role: 'assistant', content: res1.text },
    {
      role: 'user',
      content: res1.truncated
        ? 'Your response was cut off before it finished, so it is not valid JSON. Return the COMPLETE JSON object ' +
          'and nothing else — keep every required field but write more briefly so the whole object fits.'
        : `Your response did not match the required schema — ${parsed1.reason}. ` +
          'Return only the corrected JSON object, nothing else.',
    },
  ]

  // The first attempt is already PAID for. Every exit from here on has to carry that cost out with it —
  // a throw has no return value, so it rides on the error (see attachSpend) and the worker harness records
  // it. Otherwise a schema failure silently burns two completions the reel never gets billed for.
  let res2: TransportResult
  try {
    res2 = await transport(provider, model, opts.system, repairMessages, maxTokens, opts.temperature, webSearch)
  } catch (err) {
    throw attachSpend(err, cost1)
  }
  const totalCost = cost1 + calcCostCents(model, res2.inputTokens, res2.outputTokens) + searchFee

  const parsed2 = tryParse(res2.text, opts.schema)
  if (parsed2.ok) {
    return { data: parsed2.data, costCents: totalCost, inputHash }
  }

  // Lead with the cause, not the payload. The raw tail matters more than its head — JSON fails at the end
  // when it's truncated — so keep both ends and drop the middle.
  const cut = (s: string) => (s.length <= 700 ? s : `${s.slice(0, 400)} …[${s.length - 700} chars]… ${s.slice(-300)}`)
  throw attachSpend(
    new ProviderError(
      provider,
      `Schema validation failed after repair (${opts.templateVersion}). ` +
        `First attempt: ${parsed1.reason}${res1.truncated ? ' [output hit the token ceiling]' : ''}. ` +
        `Repair attempt: ${parsed2.reason}${res2.truncated ? ` [output hit the ${maxTokens}-token ceiling]` : ''}. ` +
        `Raw: ${cut(res2.text)}`,
    ),
    totalCost,
  )
}
