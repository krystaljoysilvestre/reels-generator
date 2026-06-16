import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { ProviderError } from '../shared/types.js'
import { buildInputHash } from './input-hash.js'

// Claude API client. All calls:
//  - request JSON-only output (CLAUDE.md non-negotiable rule 8)
//  - strip code fences before parsing
//  - validate with the caller's zod schema
//  - attempt one repair call on schema failure
//  - return cost_cents alongside the parsed result

export interface LlmCallOptions<T> {
  templateVersion: string  // e.g. 'story.v1'
  schema: z.ZodType<T>
  system: string
  messages: Anthropic.MessageParam[]
  model?: string
  maxTokens?: number
}

export interface LlmResult<T> {
  data: T
  costCents: number
  inputHash: string
}

// Verified June 2026 pricing — re-check at each model bump [M6]
const COST_PER_M_INPUT_CENTS = {
  'claude-opus-4-8': 1500,
  'claude-sonnet-4-6': 300,
  'claude-haiku-4-5-20251001': 80,
} as const

const DEFAULT_MODEL = 'claude-sonnet-4-6'

function calcCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Rough output cost approximation: ~5× input price per token for most Claude models
  const inputRate =
    COST_PER_M_INPUT_CENTS[model as keyof typeof COST_PER_M_INPUT_CENTS] ??
    COST_PER_M_INPUT_CENTS['claude-sonnet-4-6']
  const outputRate = inputRate * 5
  return Math.ceil((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000)
}

function stripFences(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers (CLAUDE.md rule 8 fallback)
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
}

function tryParse<T>(raw: string, schema: z.ZodType<T>): T | null {
  try {
    return schema.parse(JSON.parse(stripFences(raw)))
  } catch {
    return null
  }
}

let _client: Anthropic | undefined
function getClient() {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  // Each request times out at 60s and the SDK auto-retries transient failures
  // (connection errors, 429, 5xx) with backoff — so a blip doesn't strand the
  // caller. Normal calls finish in ~25s; worst case ~2 min before surfacing.
  _client ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 })
  return _client
}

export async function llmCall<T>(opts: LlmCallOptions<T>): Promise<LlmResult<T>> {
  const model = opts.model ?? DEFAULT_MODEL
  const maxTokens = opts.maxTokens ?? 4096
  const inputHash = buildInputHash(opts.templateVersion, {
    system: opts.system,
    messages: opts.messages,
    model,
  })

  const client = getClient()

  // ── First attempt ─────────────────────────────────────────────────────────
  const res1 = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: opts.system + '\n\nRespond with valid JSON only. No markdown, no code fences.',
    messages: opts.messages,
  })

  const text1 = res1.content.find((b) => b.type === 'text')?.text ?? ''
  const cost1 = calcCostCents(model, res1.usage.input_tokens, res1.usage.output_tokens)
  const parsed1 = tryParse(text1, opts.schema)

  if (parsed1 !== null) {
    return { data: parsed1, costCents: cost1, inputHash }
  }

  // ── One repair attempt (CLAUDE.md rule 8) ─────────────────────────────────
  const repairMessages: Anthropic.MessageParam[] = [
    ...opts.messages,
    { role: 'assistant', content: text1 },
    {
      role: 'user',
      content:
        'Your response was not valid JSON matching the required schema. ' +
        'Return only the corrected JSON object, nothing else.',
    },
  ]

  const res2 = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: opts.system + '\n\nRespond with valid JSON only. No markdown, no code fences.',
    messages: repairMessages,
  })

  const text2 = res2.content.find((b) => b.type === 'text')?.text ?? ''
  const cost2 = calcCostCents(model, res2.usage.input_tokens, res2.usage.output_tokens)
  const totalCost = cost1 + cost2

  const parsed2 = tryParse(text2, opts.schema)
  if (parsed2 !== null) {
    return { data: parsed2, costCents: totalCost, inputHash }
  }

  throw new ProviderError(
    'anthropic',
    `Schema validation failed after repair. Raw: ${text2.slice(0, 200)}`,
  )
}
