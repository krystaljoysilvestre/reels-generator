// YouTube Data API v3 — resumable video upload against one Kendrix channel's OAuth grant.
//
// Auth is always PASSED IN, never read from the environment. One refresh token = one YouTube account,
// so a token resolved from process.env would upload to whichever account minted it regardless of which
// Kendrix channel asked. Callers get the per-channel grant from resolveYouTubeAuth() in @reels/db and
// keep the manual (zip download) flow when it returns null. The operator-wide YOUTUBE_REFRESH_TOKEN
// path this module used to accept was removed on 2026-08-21: the per-channel store replaced it, but
// three callers were still reading it, and the metrics poller had been dead at its first line since.
//
// Cost: the YouTube Data API is free (quota-metered, not billed) — an upload costs ~1600 quota units
// of the default 10,000/day, i.e. ~6 uploads/day before a quota raise is needed. costCents: 0 is the
// true marginal cost, not an unaccounted estimate. Attaching a caption track adds ~400 units to an
// upload (~2000 total), which lowers the ceiling to ~5 uploads/day on the default quota.

// thumbnails.set caps the body at 2MB (developers.google.com/youtube/v3/docs/thumbnails/set). Exported so
// the cover compositor can target it at render time instead of discovering it at publish time, when the
// video is already up and the only remaining option is to drop the thumbnail.
export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024

export interface YouTubeAuth {
  clientId: string
  clientSecret: string
  refreshToken: string
}

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
  // The channel's own OAuth credentials, from resolveYouTubeAuth(). Required — there is no fallback.
  auth: YouTubeAuth
}

export interface YouTubeUploadResult {
  videoId: string
  url: string
  costCents: 0
}

async function getAccessToken(auth: YouTubeAuth): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`YouTube token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('YouTube token refresh returned no access_token')
  return json.access_token
}

export async function uploadToYouTube(params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
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
//
// Accepts EITHER an API key or a channel's OAuth grant, and the key is the better instrument: view
// counts on a public video are public data, so measuring performance does not need permission to
// publish. Reading them through the publishing grant couples the performance loop to a token that
// expires — a Testing-mode refresh token lasts seven days — which is how the loop went ten days
// without recording a single number. With a key, one call covers every channel and no grant can
// expire out from under it; the OAuth path stays for installations that have no key.
//
// Watch-time and retention live in the separate YouTube ANALYTICS API, need the yt-analytics.readonly
// scope, and are per-channel by nature — that one genuinely does require the grant. A later step.

export interface YouTubeVideoStats {
  videoId: string
  views: number
  likes: number | null // hidden likes → null
  comments: number | null
}

export type YouTubeStatsAuth = YouTubeAuth | { apiKey: string }

export async function fetchYouTubeStats(
  videoIds: string[],
  auth: YouTubeStatsAuth,
): Promise<YouTubeVideoStats[]> {
  if (videoIds.length === 0) return []
  const apiKey = 'apiKey' in auth ? auth.apiKey : null
  const accessToken = apiKey ? null : await getAccessToken(auth as YouTubeAuth)

  const out: YouTubeVideoStats[] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.join(',')}`
    const res = await fetch(
      apiKey ? `${url}&key=${encodeURIComponent(apiKey)}` : url,
      apiKey ? {} : { headers: { Authorization: `Bearer ${accessToken!}` } },
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
