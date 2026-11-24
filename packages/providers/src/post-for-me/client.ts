import { z } from 'zod'

const API_BASE = 'https://api.postforme.dev/v1'

// Post for Me Starter: $10/month includes 1,000 successful destination posts.
// A four-account cross-post consumes four units. This is quota-value attribution,
// not a promise that the subscription's cash cost changes per post.
// Source: https://www.postforme.dev/pricing (verified 2026-09-24).
export const POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST = 1

export const postForMePlatformSchema = z.enum(['tiktok', 'instagram', 'facebook', 'youtube'])
export type PostForMePlatform = z.infer<typeof postForMePlatformSchema>

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/)
const httpsUrl = z.string().url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password
})

// Keep the supported pilot surface small. These fields match the provider's
// OpenAPI schema; Facebook/Instagram do not expose an AI-disclosure flag there.
const platformConfigurationsSchema = z.object({
  tiktok: z.object({
    title: z.string().optional(),
    privacy_status: z.enum(['public', 'private']),
    is_ai_generated: z.boolean(),
    is_draft: z.literal(false).optional(),
    allow_comment: z.boolean().optional(),
    allow_duet: z.boolean().optional(),
    allow_stitch: z.boolean().optional(),
    disclose_your_brand: z.boolean().optional(),
    disclose_branded_content: z.boolean().optional(),
  }).strict().optional(),
  instagram: z.object({
    placement: z.literal('reels'),
    share_to_feed: z.boolean().optional(),
  }).strict().optional(),
  facebook: z.object({ placement: z.literal('reels') }).strict().optional(),
  youtube: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    privacy_status: z.enum(['public', 'private', 'unlisted']),
    made_for_kids: z.boolean(),
    contains_synthetic_media: z.boolean(),
    // The live OpenAPI marks this nullable field required.
    localizations: z.record(z.object({ title: z.string().optional(), description: z.string().optional() })).nullable().optional(),
  }).strict().optional(),
}).strict()

export type PostForMePlatformConfigurations = z.infer<typeof platformConfigurationsSchema>

const createPostSchema = z.object({
  caption: z.string(),
  accountIds: z.array(identifier).min(1).max(4).refine((ids) => new Set(ids).size === ids.length),
  mediaUrl: httpsUrl,
  externalId: identifier,
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  platformConfigurations: platformConfigurationsSchema,
}).strict()
export type PostForMeCreatePost = z.infer<typeof createPostSchema>

const accountSchema = z.object({
  id: identifier,
  platform: z.string().min(1),
  username: z.string().nullable(),
  user_id: z.string().min(1),
  status: z.enum(['connected', 'disconnected']),
  external_id: z.string().nullable(),
}).transform((account) => ({
  id: account.id,
  platform: account.platform,
  username: account.username,
  userId: account.user_id,
  status: account.status,
  externalId: account.external_id,
}))
export type PostForMeAccount = z.infer<typeof accountSchema>

const postSchema = z.object({
  id: identifier,
  external_id: z.string().nullable(),
  status: z.enum(['draft', 'scheduled', 'processing', 'processed']),
  scheduled_at: z.string().nullable(),
  social_accounts: z.array(accountSchema),
}).transform((post) => ({
  id: post.id,
  externalId: post.external_id,
  status: post.status,
  scheduledAt: post.scheduled_at,
  accounts: post.social_accounts,
}))
export type PostForMePost = z.infer<typeof postSchema>

const resultSchema = z.object({
  id: identifier,
  social_account_id: identifier,
  post_id: identifier,
  success: z.boolean(),
  // Errors/details may contain credentials or signed URLs; never return them.
  platform_data: z.object({
    id: z.string().optional(),
    url: z.string().optional(),
  }).nullish(),
}).transform((result) => ({
  id: result.id,
  accountId: result.social_account_id,
  postId: result.post_id,
  success: result.success,
  platformPostId: result.platform_data?.id ?? null,
  postUrl: httpsUrl.safeParse(result.platform_data?.url).success ? result.platform_data!.url! : null,
}))
export type PostForMeResult = z.infer<typeof resultSchema>

const metaSchema = z.object({
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  next: z.string().nullable(),
}).transform((meta) => ({
  total: meta.total,
  offset: meta.offset,
  limit: meta.limit,
  // Never follow a URL returned by the service with our Authorization header.
  nextOffset: meta.next === null ? null : meta.offset + meta.limit,
}))

export type PostForMePage<T> = { data: T[]; meta: z.infer<typeof metaSchema> }

export class PostForMeError extends Error {
  constructor(
    public readonly code: 'invalid_input' | 'request_failed' | 'timeout' | 'invalid_response',
    public readonly status?: number,
  ) {
    super(`Post for Me ${code.replaceAll('_', ' ')}${status ? ` (HTTP ${status})` : ''}.`)
    this.name = 'PostForMeError'
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown, input = false): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) throw new PostForMeError(input ? 'invalid_input' : 'invalid_response')
  return result.data as z.infer<T>
}

const paginationSchema = z.object({
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
})

/** No retries: a timeout or HTTP failure after a write can mean it was accepted.
 * Callers must keep that outcome unresolved instead of submitting another post.
 * This client never owns tenant authorization, spend gates, or DB attribution.
 */
export class PostForMeClient {
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: { apiKey: string; fetch?: typeof fetch; timeoutMs?: number }) {
    this.apiKey = parse(z.string().trim().min(1).refine((key) => !/[\r\n]/.test(key)), options.apiKey, true)
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = parse(z.number().int().min(1).max(300_000), options.timeoutMs ?? 60_000, true)
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' })
      if (!response.ok) throw new PostForMeError('request_failed', response.status)
      try {
        return await response.json()
      } catch {
        throw new PostForMeError(controller.signal.aborted ? 'timeout' : 'invalid_response')
      }
    } catch (error) {
      if (error instanceof PostForMeError) throw error
      // Do not attach raw fetch errors: they can contain the token or signed URL.
      throw new PostForMeError(controller.signal.aborted ? 'timeout' : 'request_failed')
    } finally {
      clearTimeout(timeout)
    }
  }

  private api(path: string, body?: unknown, method?: 'POST'): Promise<unknown> {
    return this.request(`${API_BASE}${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  async listAccounts(options: { offset?: number; limit?: number; externalId?: string } = {}): Promise<PostForMePage<PostForMeAccount>> {
    const pagination = parse(paginationSchema, options, true)
    const query = new URLSearchParams({ offset: String(pagination.offset), limit: String(pagination.limit) })
    if (options.externalId !== undefined) query.set('external_id', parse(identifier, options.externalId, true))
    return parse(z.object({ data: z.array(accountSchema), meta: metaSchema }), await this.api(`/social-accounts?${query}`))
  }

  async getAccount(id: string): Promise<PostForMeAccount> {
    const account = parse(accountSchema, await this.api(`/social-accounts/${parse(identifier, id, true)}`))
    if (account.id !== id) throw new PostForMeError('invalid_response')
    return account
  }

  async createAuthUrl(input: { platform: PostForMePlatform; externalId?: string }): Promise<{ url: string; platform: PostForMePlatform }> {
    const checked = parse(z.object({ platform: postForMePlatformSchema, externalId: identifier.optional() }).strict(), input, true)
    const response = parse(z.object({ url: httpsUrl, platform: postForMePlatformSchema }), await this.api('/social-accounts/auth-url', {
      platform: checked.platform,
      ...(checked.externalId ? { external_id: checked.externalId } : {}),
      permissions: ['posts'],
      // Quickstart projects configure their redirect URL in the provider dashboard.
    }))
    if (response.platform !== checked.platform) throw new PostForMeError('invalid_response')
    return response
  }

  async uploadVideo(bytes: Uint8Array): Promise<{ mediaUrl: string; costCents: 0 }> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new PostForMeError('invalid_input')
    const urls = parse(z.object({ upload_url: httpsUrl, media_url: httpsUrl }), await this.api('/media/create-upload-url', undefined, 'POST'))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(urls.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: new Uint8Array(bytes).buffer,
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) throw new PostForMeError('request_failed', response.status)
    } catch (error) {
      if (error instanceof PostForMeError) throw error
      throw new PostForMeError(controller.signal.aborted ? 'timeout' : 'request_failed')
    } finally {
      clearTimeout(timeout)
    }
    // Upload/storage are included; the billable unit is a successful destination post.
    return { mediaUrl: urls.media_url, costCents: 0 }
  }

  async createPost(input: PostForMeCreatePost): Promise<PostForMePost & { costCents: 0; costPending: true; estimatedCostCents: number }> {
    const checked = parse(createPostSchema, input, true)
    const configurations = checked.platformConfigurations
    const post = parse(postSchema, await this.api('/social-posts', {
      caption: checked.caption,
      social_accounts: checked.accountIds,
      media: [{ url: checked.mediaUrl }],
      external_id: checked.externalId,
      ...(checked.scheduledAt ? { scheduled_at: checked.scheduledAt } : {}),
      platform_configurations: {
        ...configurations,
        ...(configurations.youtube ? { youtube: { ...configurations.youtube, localizations: configurations.youtube.localizations ?? null } } : {}),
      },
    }))
    // Creating a job is asynchronous; charge only successes from getResults.
    return { ...post, costCents: 0, costPending: true, estimatedCostCents: checked.accountIds.length * POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST }
  }

  async getPost(id: string): Promise<PostForMePost> {
    const post = parse(postSchema, await this.api(`/social-posts/${parse(identifier, id, true)}`))
    if (post.id !== id) throw new PostForMeError('invalid_response')
    return post
  }

  /** Recovery lookup only. external_id is metadata, not an idempotency key. */
  async listPosts(options: { externalId: string; offset?: number; limit?: number }): Promise<PostForMePage<PostForMePost>> {
    const pagination = parse(paginationSchema, options, true)
    const query = new URLSearchParams({ external_id: parse(identifier, options.externalId, true), offset: String(pagination.offset), limit: String(pagination.limit) })
    return parse(z.object({ data: z.array(postSchema), meta: metaSchema }), await this.api(`/social-posts?${query}`))
  }

  /** Caller must establish that this is still a draft/scheduled job. Deleting
   * the provider job does not delete an already published social-platform post.
   */
  async cancelPost(id: string): Promise<{ success: boolean }> {
    return parse(z.object({ success: z.boolean() }), await this.request(`${API_BASE}/social-posts/${parse(identifier, id, true)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }))
  }

  async getResults(postId: string, options: { offset?: number; limit?: number } = {}): Promise<PostForMePage<PostForMeResult>> {
    const pagination = parse(paginationSchema, options, true)
    const query = new URLSearchParams({ post_id: parse(identifier, postId, true), offset: String(pagination.offset), limit: String(pagination.limit) })
    return parse(z.object({ data: z.array(resultSchema), meta: metaSchema }), await this.api(`/social-post-results?${query}`))
  }
}

/** Returns only newly successful destinations in a deterministic order. Persist
 * successfulAccountIds and increment reel cost in the same locked transaction.
 * Repeating a poll with that persisted set costs zero. Failed attempts cost zero.
 */
export function attributePostForMeResults(input: {
  postId: string
  accountIds: readonly string[]
  results: readonly PostForMeResult[]
  attributedAccountIds?: readonly string[]
}): { costCents: number; successfulAccountIds: string[] } {
  const allowed = new Set(input.accountIds)
  const attributed = new Set(input.attributedAccountIds ?? [])
  const successfulAccountIds = [...new Set(input.results
    .filter((result) => result.postId === input.postId && result.success && allowed.has(result.accountId) && !attributed.has(result.accountId))
    .map((result) => result.accountId))].sort()
  return { costCents: successfulAccountIds.length * POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST, successfulAccountIds }
}
