import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { z } from 'zod'
import { ProviderError } from '../shared/types.js'
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
  // Anthropic (QA)
  'claude-opus-4-8': { input: 1500, output: 7500 },
  'claude-sonnet-4-6': { input: 300, output: 1500 },
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
}

const JSON_INSTRUCTION = '\n\nRespond with valid JSON only. No markdown, no code fences.'

function calcCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']!
  return Math.ceil((inputTokens * rate.input + outputTokens * rate.output) / 1_000_000)
}

function stripFences(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers in case a model adds them anyway.
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

function tryParse<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    return schema.parse(JSON.parse(stripFences(raw)))
  } catch {
    return null
  }
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

async function callAnthropic(model: string, system: string, messages: LlmMessage[], maxTokens: number): Promise<TransportResult> {
  const res = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system: system + JSON_INSTRUCTION,
    messages: toAnthropicMessages(messages),
  })
  return {
    text: res.content.find((b) => b.type === 'text')?.text ?? '',
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
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

async function callOpenAI(model: string, system: string, messages: LlmMessage[], maxTokens: number): Promise<TransportResult> {
  const res = await getOpenAI().chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: toOpenAIMessages(system, messages),
  })
  return {
    text: res.choices[0]?.message?.content ?? '',
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  }
}

async function transport(provider: LlmProvider, model: string, system: string, messages: LlmMessage[], maxTokens: number): Promise<TransportResult> {
  // Per-provider concurrency cap (the real throttle — see shared/limiter.ts).
  return withProviderLimit(provider === 'anthropic' ? 'anthropic' : 'openai', () =>
    provider === 'anthropic'
      ? callAnthropic(model, system, messages, maxTokens)
      : callOpenAI(model, system, messages, maxTokens),
  )
}

export async function llmCall<T>(opts: LlmCallOptions<T>): Promise<LlmResult<T>> {
  const provider = opts.provider ?? 'openai'
  const model = opts.model ?? DEFAULT_MODEL[provider]
  const maxTokens = opts.maxTokens ?? 4096
  const inputHash = buildInputHash(opts.templateVersion, {
    system: opts.system,
    messages: opts.messages,
    provider,
    model,
  })

  // ── First attempt ─────────────────────────────────────────────────────────
  const res1 = await transport(provider, model, opts.system, opts.messages, maxTokens)
  const cost1 = calcCostCents(model, res1.inputTokens, res1.outputTokens)
  const parsed1 = tryParse(res1.text, opts.schema)

  if (parsed1 !== null) {
    return { data: parsed1, costCents: cost1, inputHash }
  }

  // ── One repair attempt ────────────────────────────────────────────────────
  const repairMessages: LlmMessage[] = [
    ...opts.messages,
    { role: 'assistant', content: res1.text },
    {
      role: 'user',
      content:
        'Your response was not valid JSON matching the required schema. ' +
        'Return only the corrected JSON object, nothing else.',
    },
  ]

  const res2 = await transport(provider, model, opts.system, repairMessages, maxTokens)
  const totalCost = cost1 + calcCostCents(model, res2.inputTokens, res2.outputTokens)

  const parsed2 = tryParse(res2.text, opts.schema)
  if (parsed2 !== null) {
    return { data: parsed2, costCents: totalCost, inputHash }
  }

  throw new ProviderError(
    provider,
    `Schema validation failed after repair. Raw: ${res2.text.slice(0, 200)}`,
  )
}
