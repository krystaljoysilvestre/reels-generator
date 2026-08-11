// YouTube Data API v3 — resumable video upload with an operator-supplied OAuth refresh token.
//
// Env-gated: YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET + YOUTUBE_REFRESH_TOKEN. When any is missing,
// isYouTubeConfigured() is false and callers keep the manual (zip download) flow.
//
// One refresh token = one YouTube channel (mint the token while acting as the brand account you want
// to upload to). Multi-channel operators need one token per channel — a per-channel token store is a
// deliberate later step; Phase 1 assumes the operator's primary channel.
//
// Cost: the YouTube Data API is free (quota-metered, not billed) — an upload costs ~1600 quota units
// of the default 10,000/day, i.e. ~6 uploads/day before a quota raise is needed. costCents: 0 is the
// true marginal cost, not an unaccounted estimate. Attaching a caption track adds ~400 units to an
// upload (~2000 total), which lowers the ceiling to ~5 uploads/day on the default quota.

// thumbnails.set caps the body at 2MB (developers.google.com/youtube/v3/docs/thumbnails/set). Exported so
// the cover compositor can target it at render time instead of discovering it at publish time, when the
// video is already up and the only remaining option is to drop the thumbnail.
export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024

export interface YouTubeUploadParams {
  video: Buffer
  title: string // ≤100 chars, no '<' or '>'
  description: string // ≤5000 bytes
  tags?: string[]
  privacyStatus?: 'public' | 'unlisted' | 'private'
  // Schedule instead of publishing now. YouTube itself flips the video public at this instant, so a
  // posting schedule survives our worker being down. The API only accepts publishAt on a PRIVATE
  // video, so passing this forces privacyStatus to 'private' (ignoring any value above).
  publishAt?: Date
  // Optional custom thumbnail (JPEG). Best-effort: custom thumbnails need a phone-verified YouTube
  // account — when the API refuses, the upload still succeeds with YouTube's auto-picked frame.
  thumbnailJpeg?: Buffer
  // Optional SubRip caption track — the platform-native alternative to burning captions into the
  // picture (see subtitlesToSrt). Best-effort for the same reason as the thumbnail, plus one of its
  // own: captions.insert needs the youtube.force-ssl scope, which a token minted for youtube.upload
  // alone does not carry. A 403 there must not fail an otherwise-successful upload.
  captionsSrt?: string
  // BCP-47 tag for the caption track (e.g. 'en', 'fil'). Defaults to 'en'.
  captionsLanguage?: string
  // Per-channel OAuth credentials. Omit only for the legacy operator-wide env-token path.
  auth?: { clientId: string; clientSecret: string; refreshToken: string }
}

export interface YouTubeUploadResult {
  videoId: string
  url: string
  costCents: 0
}

export function isYouTubeConfigured(): boolean {
  return Boolean(
    process.env['YOUTUBE_CLIENT_ID'] && process.env['YOUTUBE_CLIENT_SECRET'] && process.env['YOUTUBE_REFRESH_TOKEN'],
  )
}

async function getAccessToken(auth?: YouTubeUploadParams['auth']): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: auth?.clientId ?? process.env['YOUTUBE_CLIENT_ID']!,
      client_secret: auth?.clientSecret ?? process.env['YOUTUBE_CLIENT_SECRET']!,
      refresh_token: auth?.refreshToken ?? process.env['YOUTUBE_REFRESH_TOKEN']!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`YouTube token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('YouTube token refresh returned no access_token')
  return json.access_token
}

export async function uploadToYouTube(params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
  if (!params.auth && !isYouTubeConfigured()) throw new Error('YouTube is not connected')
  const accessToken = await getAccessToken(params.auth)

  // YouTube rejects titles containing angle brackets; clamp lengths to the API's documented limits.
  const metadata = {
    snippet: {
      title: params.title.replace(/[<>]/g, '').slice(0, 100),
      description: params.description.slice(0, 4900),
      ...(params.tags?.length ? { tags: params.tags.slice(0, 30) } : {}),
    },
    status: {
      privacyStatus: params.publishAt ? 'private' : (params.privacyStatus ?? 'public'),
      ...(params.publishAt ? { publishAt: params.publishAt.toISOString() } : {}),
      selfDeclaredMadeForKids: false,
      // Platform policy: AI-generated content must be disclosed (mirrors the zip's AI-DISCLOSURE note).
      containsSyntheticMedia: true,
    },
  }

  // Resumable protocol: POST the metadata to open an upload session, then PUT the bytes.
  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(params.video.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    },
  )
  if (!start.ok) throw new Error(`YouTube upload session failed (${start.status}): ${(await start.text()).slice(0, 300)}`)
  const uploadUrl = start.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube upload session returned no location header')

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(params.video.length) },
    body: new Uint8Array(params.video),
  })
  if (!put.ok) throw new Error(`YouTube upload failed (${put.status}): ${(await put.text()).slice(0, 300)}`)
  const json = (await put.json()) as { id?: string }
  if (!json.id) throw new Error('YouTube upload returned no video id')

  if (params.thumbnailJpeg) {
    // Size is checked BEFORE the request, because an oversized body comes back as an opaque 400 that reads
    // exactly like every other rejection — and the cap was previously unenforced anywhere. It never bit
    // while covers were 1280×720 (~90-130KB); a full-resolution 1080×1920 cover is where it starts to.
    if (params.thumbnailJpeg.length > YOUTUBE_THUMBNAIL_MAX_BYTES) {
      console.warn(
        `[youtube] thumbnail skipped: ${(params.thumbnailJpeg.length / 1_048_576).toFixed(2)}MB exceeds the ` +
        `${YOUTUBE_THUMBNAIL_MAX_BYTES / 1_048_576}MB thumbnails.set limit — auto frame kept`,
      )
    } else {
      try {
        const thumbRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${json.id}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' },
            body: new Uint8Array(params.thumbnailJpeg),
          },
        )
        // A rejection here is EXPECTED, not anomalous, on two known configurations, so it says which:
        // custom thumbnails need a phone-verified account, and for SHORTS they additionally need the
        // YouTube Partner Program (rolled out 2026-07-24, still expanding). A non-YPP Shorts channel gets
        // frame selection only. Left as a warning rather than a throw — the video is already published and
        // failing the whole upload over packaging would be worse — but it names the likely cause so this
        // stops looking like a mystery.
        if (!thumbRes.ok) {
          console.warn(
            `[youtube] custom thumbnail rejected (${thumbRes.status}) — auto frame kept. ` +
            `Custom thumbnails require a phone-verified account, and on Shorts also the YouTube Partner Program.`,
          )
        }
      } catch (err) {
        console.warn(`[youtube] thumbnail set failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  if (params.captionsSrt?.trim()) {
    await insertCaptionTrack(accessToken, json.id, params.captionsSrt, params.captionsLanguage ?? 'en')
  }

  return { videoId: json.id, url: `https://youtu.be/${json.id}`, costCents: 0 }
}

// captions.insert — a multipart/related upload (metadata part + the .srt bytes). ~400 quota units.
// Best-effort by contract: every failure path warns and returns, because a missing caption track is a
// degraded video, not a failed publish. The most likely failure is a 403 from a refresh token that
// only carries the youtube.upload scope; force-ssl is required to write captions.
async function insertCaptionTrack(accessToken: string, videoId: string, srt: string, language: string): Promise<void> {
  const boundary = `kendrix-captions-${videoId}`
  const metadata = JSON.stringify({
    snippet: { videoId, language, name: '', isDraft: false },
  })
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${srt}\r\n` +
    `--${boundary}--\r\n`

  try {
    const res = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      const hint = res.status === 403 ? ' — the refresh token likely lacks the youtube.force-ssl scope' : ''
      console.warn(`[youtube] caption track rejected (${res.status})${hint}: ${detail}`)
    }
  } catch (err) {
    console.warn(`[youtube] caption upload failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Video statistics (metrics polling) ────────────────────────────────────────
// Data API videos.list — public stats (views/likes/comments), 1 quota unit per call, up to 50 ids.
// Reuses the upload token (public stats need no extra scope). Watch-time/retention lives in the
// separate YouTube ANALYTICS API and needs the yt-analytics.readonly scope — a later, deliberate step.

export interface YouTubeVideoStats {
  videoId: string
  views: number
  likes: number | null // hidden likes → null
  comments: number | null
}

export async function fetchYouTubeStats(videoIds: string[]): Promise<YouTubeVideoStats[]> {
  if (!isYouTubeConfigured()) throw new Error('YouTube is not connected (YOUTUBE_* env vars missing)')
  if (videoIds.length === 0) return []
  const accessToken = await getAccessToken()

  const out: YouTubeVideoStats[] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) throw new Error(`YouTube stats fetch failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as {
      items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>
    }
    for (const item of json.items ?? []) {
      const s = item.statistics ?? {}
      out.push({
        videoId: item.id,
        views: parseInt(s.viewCount ?? '0', 10) || 0,
        likes: s.likeCount != null ? parseInt(s.likeCount, 10) || 0 : null,
        comments: s.commentCount != null ? parseInt(s.commentCount, 10) || 0 : null,
      })
    }
  }
  return out
}
