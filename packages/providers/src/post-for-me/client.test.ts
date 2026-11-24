import { describe, expect, it, vi } from 'vitest'
import {
  attributePostForMeResults,
  PostForMeClient,
  PostForMeError,
  type PostForMeCreatePost,
  type PostForMeResult,
} from './client.js'

const rawAccount = {
  id: 'sa_tiktok', platform: 'tiktok', username: 'our_creator', user_id: 'platform_creator_1',
  status: 'connected', external_id: 'channel_1',
  access_token: 'secret-social-token', refresh_token: 'secret-refresh-token',
  metadata: { secret: 'private-metadata' },
}
const rawPost = {
  id: 'sp_one', external_id: 'pilot_1', status: 'scheduled',
  scheduled_at: '2026-09-30T08:00:00Z', social_accounts: [rawAccount],
  media: [{ url: 'https://media.example/video.mp4?secret=abc' }],
}
const meta = { total: 1, offset: 0, limit: 50, next: null }
const postInput: PostForMeCreatePost = {
  caption: 'A small story.', accountIds: ['sa_tiktok', 'sa_instagram', 'sa_facebook', 'sa_youtube'],
  mediaUrl: 'https://media.example/reel.mp4', externalId: 'pilot_1',
  scheduledAt: '2026-09-30T08:00:00+08:00',
  platformConfigurations: {
    tiktok: { privacy_status: 'public', is_ai_generated: true, is_draft: false },
    instagram: { placement: 'reels' }, facebook: { placement: 'reels' },
    youtube: { title: 'A small story', privacy_status: 'public', made_for_kids: false, contains_synthetic_media: true },
  },
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const item of responses) fetchMock.mockResolvedValueOnce(item)
  return { client: new PostForMeClient({ apiKey: 'project-secret', fetch: fetchMock }), fetchMock }
}

function result(accountId: string, changes: Partial<PostForMeResult> = {}): PostForMeResult {
  return { id: `result_${accountId}`, postId: 'sp_one', accountId, success: true, platformPostId: 'video_1', postUrl: null, ...changes }
}

describe('Post for Me pilot client', () => {
  it('only returns safe account fields, including embedded accounts in a post', async () => {
    const { client } = setup(response(rawAccount), response(rawPost))
    expect(await client.getAccount('sa_tiktok')).toEqual({
      id: 'sa_tiktok', platform: 'tiktok', username: 'our_creator', userId: 'platform_creator_1', status: 'connected', externalId: 'channel_1',
    })
    const post = await client.getPost('sp_one')
    expect(post.status).toBe('scheduled')
    expect(JSON.stringify(post)).not.toMatch(/secret|token|metadata|media/)
  })

  it('paginates using numeric offsets and never follows an untrusted next URL', async () => {
    const { client, fetchMock } = setup(response({ data: [rawAccount], meta: { total: 2, offset: 0, limit: 1, next: 'https://evil.example/steal' } }))
    const page = await client.listAccounts({ externalId: 'channel_1', limit: 1 })
    expect(page.meta.nextOffset).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.postforme.dev/v1/social-accounts?offset=0&limit=1&external_id=channel_1')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer project-secret' } })
    expect(JSON.stringify(page)).not.toContain('evil.example')
  })

  it('uses the Quickstart dashboard redirect and requests only posting permissions', async () => {
    const { client, fetchMock } = setup(response({ platform: 'instagram', url: 'https://api.postforme.dev/auth/instagram' }))
    await client.createAuthUrl({ platform: 'instagram', externalId: 'channel_1' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      platform: 'instagram', external_id: 'channel_1', permissions: ['posts'],
    })
  })

  it('posts one video to the selected accounts with exact scheduling/disclosure fields', async () => {
    const { client, fetchMock } = setup(response(rawPost))
    const created = await client.createPost(postInput)
    expect(created).toMatchObject({ id: 'sp_one', status: 'scheduled', costCents: 0, costPending: true, estimatedCostCents: 4 })
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body).toEqual({
      caption: postInput.caption,
      social_accounts: postInput.accountIds,
      media: [{ url: postInput.mediaUrl }],
      external_id: 'pilot_1',
      scheduled_at: postInput.scheduledAt,
      platform_configurations: {
        ...postInput.platformConfigurations,
        youtube: { ...postInput.platformConfigurations.youtube, localizations: null },
      },
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.postforme.dev/v1/social-posts')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('omits scheduled_at for immediate submission and rejects unsupported disclosure fields', async () => {
    const { client, fetchMock } = setup(response(rawPost))
    const immediate = { ...postInput }
    delete immediate.scheduledAt
    await client.createPost(immediate)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('scheduled_at')
    await expect(client.createPost({ ...immediate, platformConfigurations: { facebook: { placement: 'reels', is_ai_generated: true } } } as unknown as PostForMeCreatePost)).rejects.toMatchObject({ code: 'invalid_input' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uploads bytes with no project Authorization header sent to storage', async () => {
    const { client, fetchMock } = setup(
      response({ upload_url: 'https://storage.example/signed?secret=upload', media_url: 'https://media.example/reel.mp4' }),
      new Response(null, { status: 204 }),
    )
    expect(await client.uploadVideo(new Uint8Array([1, 2, 3]))).toEqual({ mediaUrl: 'https://media.example/reel.mp4', costCents: 0 })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.postforme.dev/v1/media/create-upload-url')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, redirect: 'error' })
    expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(new Uint8Array(fetchMock.mock.calls[1]?.[1]?.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('sanitizes result errors/logs and rejects a non-HTTPS platform URL', async () => {
    const { client, fetchMock } = setup(response({ data: [{
      id: 'spr_one', social_account_id: 'sa_tiktok', post_id: 'sp_one', success: false,
      error: { access_token: 'secret-token' }, details: { url: 'secret-signed-url' },
      platform_data: { id: 'video_1', url: 'javascript:alert(1)' },
    }], meta }))
    const page = await client.getResults('sp_one')
    expect(page.data).toEqual([{ id: 'spr_one', accountId: 'sa_tiktok', postId: 'sp_one', success: false, platformPostId: 'video_1', postUrl: null }])
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.postforme.dev/v1/social-post-results?post_id=sp_one&offset=0&limit=50')
  })

  it('recovers by external ID without creating another post', async () => {
    const { client, fetchMock } = setup(response({ data: [rawPost, { ...rawPost, id: 'sp_duplicate' }], meta: { ...meta, total: 2 } }))
    const page = await client.listPosts({ externalId: 'pilot_1' })
    expect(page.data).toHaveLength(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.postforme.dev/v1/social-posts?external_id=pilot_1&offset=0&limit=50')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('deletes a provider job without interpreting it as a platform-post deletion', async () => {
    const { client, fetchMock } = setup(response({ success: true }))
    expect(await client.cancelPost('sp_one')).toEqual({ success: true })
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it.each([400, 429, 500, 503])('never retries a failed post submission (%i)', async (status) => {
    const { client, fetchMock } = setup(response({ error: 'secret token in raw provider error' }, status))
    const error = await client.createPost(postInput).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PostForMeError)
    expect(error).toMatchObject({ code: 'request_failed', status })
    expect(String(error)).not.toContain('secret')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never exposes a raw network error or retries an ambiguous write', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret signed URL with credentials'))
    const client = new PostForMeClient({ apiKey: 'project-secret', fetch: fetchMock })
    await expect(client.createPost(postInput)).rejects.toThrow('Post for Me request failed.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts on timeout without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('private request URL')), { once: true })
    }))
    const client = new PostForMeClient({ apiKey: 'project-secret', fetch: fetchMock, timeoutMs: 5 })
    await expect(client.createPost(postInput)).rejects.toMatchObject({ code: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed successful responses without leaking their content', async () => {
    const { client } = setup(response({ id: 'secret-api-key', status: 'unknown' }))
    await expect(client.getPost('sp_one')).rejects.toThrow('Post for Me invalid response.')
  })

  it('rejects responses for an account, post, or auth platform other than requested', async () => {
    const { client } = setup(response(rawAccount), response(rawPost), response({ platform: 'youtube', url: 'https://api.postforme.dev/auth/youtube' }))
    await expect(client.getAccount('sa_other')).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(client.getPost('sp_other')).rejects.toMatchObject({ code: 'invalid_response' })
    await expect(client.createAuthUrl({ platform: 'tiktok' })).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('never leaks a signed URL or retries when a media upload fails', async () => {
    const { client, fetchMock } = setup(response({ upload_url: 'https://storage.example/signed?secret=upload', media_url: 'https://media.example/reel.mp4' }))
    fetchMock.mockRejectedValueOnce(new Error('https://storage.example/signed?secret=upload'))
    await expect(client.uploadVideo(new Uint8Array([1]))).rejects.toThrow('Post for Me request failed.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid paths, duplicate accounts, unsafe URLs and empty uploads before a request', async () => {
    const { client, fetchMock } = setup()
    await expect(client.getPost('../other')).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(client.createPost({ ...postInput, accountIds: ['sa_one', 'sa_one'] })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(client.createPost({ ...postInput, mediaUrl: 'http://media.example/reel.mp4' })).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(client.uploadVideo(new Uint8Array())).rejects.toMatchObject({ code: 'invalid_input' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Post for Me destination cost attribution', () => {
  it('charges each matching successful destination once, ignores failed and foreign results', () => {
    expect(attributePostForMeResults({
      postId: 'sp_one', accountIds: ['sa_b', 'sa_a', 'sa_failed'],
      results: [result('sa_b'), result('sa_a'), result('sa_a', { id: 'duplicate_result' }), result('sa_failed', { success: false }), result('sa_foreign'), result('sa_a', { postId: 'other_post' })],
    })).toEqual({ costCents: 2, successfulAccountIds: ['sa_a', 'sa_b'] })
  })

  it('charges only new successes when polling again and none on repeated polls', () => {
    const results = [result('sa_a'), result('sa_b')]
    expect(attributePostForMeResults({ postId: 'sp_one', accountIds: ['sa_a', 'sa_b'], results, attributedAccountIds: ['sa_a'] })).toEqual({ costCents: 1, successfulAccountIds: ['sa_b'] })
    expect(attributePostForMeResults({ postId: 'sp_one', accountIds: ['sa_a', 'sa_b'], results, attributedAccountIds: ['sa_a', 'sa_b'] })).toEqual({ costCents: 0, successfulAccountIds: [] })
  })
})
