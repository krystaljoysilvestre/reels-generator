import { formatPublishingCaption, type PostMeta, type PublicationPlatform } from '@reels/core'

export type SavedPublication = {
  platform: PublicationPlatform
  status: string
  postUrl: string | null
  platformPostId: string | null
  publishedAt: string | null
  scheduledAt?: string | null
}

export type PublishDestination = {
  target: string
  platform: PublicationPlatform
  connected: boolean
  accountName: string | null
  publication: SavedPublication | null
}

export const PLATFORM_HANDOFF: Record<PublicationPlatform, { name: string; url: string; instructions: string }> = {
  tiktok: { name: 'TikTok', url: 'https://www.tiktok.com/tiktokstudio/upload', instructions: 'Upload the video, paste your caption, and choose a cover. Check the audience and required content labels before posting.' },
  ig: { name: 'Instagram', url: 'https://www.instagram.com/', instructions: 'Choose Create, then select your video. Add the caption and cover, check the audience and content labels, then share your reel.' },
  fb: { name: 'Facebook', url: 'https://www.facebook.com/', instructions: 'Open the profile or Page you want to post from. Create a reel, add your video and caption, then check the audience and content labels.' },
  yt: { name: 'YouTube', url: 'https://studio.youtube.com/', instructions: 'Choose Create, then Upload videos. Add the video, title and description. Review audience, altered-content and visibility settings before publishing.' },
}

export function publicationStatusLabel(publication: SavedPublication | null): string {
  if (publication?.status === 'published') {
    return publication.platform === 'yt' && publication.platformPostId ? 'Uploaded to YouTube' : 'Marked as posted'
  }
  if (publication?.status === 'scheduled') return 'Upload scheduled'
  if (publication?.status === 'failed') return 'Needs attention'
  return 'Not marked as posted'
}

/** Existing legacy IDs are shown as text; only stored, safe URLs become links. */
export function savedPublicationUrl(publication: SavedPublication | null): string | null {
  if (!publication?.postUrl) return null
  try {
    const url = new URL(publication.postUrl)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function attachmentUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

export async function confirmDestination(
  reelId: string,
  platform: PublicationPlatform,
  postUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<SavedPublication> {
  const response = await fetcher('/api/pipeline/mark-published', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reelId, platform, ...(postUrl.trim() ? { postUrl: postUrl.trim() } : {}) }),
  })
  const body = await response.json().catch(() => null) as { publication?: SavedPublication; error?: string } | null
  if (!response.ok || !body?.publication) throw new Error(body?.error ?? 'Could not save this destination. Try again.')
  return body.publication
}

export const MAX_SHARE_BYTES = 64 * 1024 * 1024
export const SHARE_DOWNLOAD_FALLBACK = 'Use Download video to save this file, then open it in your platform app.'

/** Stream with an upper bound: Content-Length alone cannot enforce a browser memory limit. */
export async function prepareShareFile(url: string, reelId: string, fetcher: typeof fetch = fetch): Promise<File> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Could not prepare the video. Try again or download it.')
    if (Number(response.headers.get('content-length')) > MAX_SHARE_BYTES) {
      await response.body?.cancel()
      throw new Error(`This video is too large to share here. ${SHARE_DOWNLOAD_FALLBACK}`)
    }
    if (!response.body) throw new Error(SHARE_DOWNLOAD_FALLBACK)
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > MAX_SHARE_BYTES) {
          await reader.cancel()
          throw new Error(`This video is too large to share here. ${SHARE_DOWNLOAD_FALLBACK}`)
        }
        chunks.push(new Uint8Array(chunk.value))
      }
    } finally { reader.releaseLock() }
    if (size === 0) throw new Error('This video is empty. Try downloading it again.')
    return new File(chunks, `kendrix-${reelId}.mp4`, { type: 'video/mp4' })
  } finally { clearTimeout(timer) }
}

export function isShareCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function captionHashtags(value: string): string[] {
  return value.split(/\s+/).map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`).slice(0, 8)
}

export function draftCaptionText(meta: PostMeta | null, hashtags: string, credits: string, fallback: string): string {
  return meta ? formatPublishingCaption({ ...meta, hashtags: captionHashtags(hashtags) }, {}, credits) : fallback
}
