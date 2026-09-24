'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { PostToYouTubeButton } from './PublishTools'
import {
  PLATFORM_HANDOFF, attachmentUrl, confirmDestination, isShareCancellation, prepareShareFile,
  publicationStatusLabel, savedPublicationUrl, SHARE_DOWNLOAD_FALLBACK,
  type PublishDestination, type SavedPublication,
} from './publishing-handoff'

export function PublishingHandoff({ reelId, channelId, destinations, history }: {
  reelId: string
  channelId: string
  destinations: PublishDestination[]
  history: SavedPublication[]
}) {
  const done = destinations.filter((destination) => destination.publication?.status === 'published').length
  return (
    <section aria-labelledby="posting-heading" className="border-t border-night-seam pt-4">
      <h3 id="posting-heading" className="text-base text-night-ink">Post your reel</h3>
      <p className="mt-1 text-xs leading-relaxed text-night-body">Download your video and copy the caption. Post in each platform, then record it here.</p>
      {destinations.length > 0 && <p className="mt-2 text-xs text-night-muted">{done} of {destinations.length} destinations recorded</p>}
      <div className="mt-3 divide-y divide-night-seam">
        {destinations.map((destination) => <DestinationRow key={destination.platform} reelId={reelId} channelId={channelId} destination={destination} />)}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-night-muted">Posting somewhere else? Use the same video and caption in your platform app.</p>
      <p className="mt-2 text-[11px] leading-relaxed text-night-muted">These records track your progress. Kendrix does not check whether a post is public.</p>
      {history.length > 0 && (
        <div className="mt-4 border-t border-night-seam pt-3">
          <h4 className="text-xs font-700 text-night-body">Earlier destinations</h4>
          <p className="mt-1 text-[11px] text-night-muted">These are no longer selected for this channel.</p>
          {history.map((publication) => (
            <div key={publication.platform} className="mt-3 text-xs text-night-body">
              <span className="font-700">{PLATFORM_HANDOFF[publication.platform].name}</span>
              <PublicationRecord publication={publication} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PublicationRecord({ publication }: { publication: SavedPublication | null }) {
  const href = savedPublicationUrl(publication)
  return (
    <div className="mt-1 text-xs leading-relaxed text-night-muted">
      <p>{publicationStatusLabel(publication)}</p>
      {publication?.publishedAt && <p>Recorded {new Date(publication.publishedAt).toLocaleDateString()}</p>}
      {publication?.status === 'scheduled' && publication.scheduledAt && <p>Scheduled for {new Date(publication.scheduledAt).toLocaleString()}</p>}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-night-lilac underline underline-offset-2">Open saved post</a>
        : publication?.platformPostId ? <p className="break-all">Post reference: {publication.platformPostId}</p> : null}
    </div>
  )
}

export function DestinationRow({ reelId, channelId, destination }: { reelId: string; channelId: string; destination: PublishDestination }) {
  const router = useRouter()
  const { toast } = useToast()
  const [publication, setPublication] = useState(destination.publication)
  const [postUrl, setPostUrl] = useState(destination.publication?.postUrl ?? '')
  const [saving, setSaving] = useState(false)
  const previousSavedUrl = useRef(destination.publication?.postUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setPublication(destination.publication)
    const savedUrl = destination.publication?.postUrl ?? ''
    const previousUrl = previousSavedUrl.current
    setPostUrl((current) => current === previousUrl ? savedUrl : current)
    previousSavedUrl.current = savedUrl
  }, [destination.publication])
  const platform = PLATFORM_HANDOFF[destination.platform]
  const posted = publication?.status === 'published'
  const hasUpload = Boolean(publication?.platformPostId)

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await confirmDestination(reelId, destination.platform, postUrl)
      setPublication(saved)
      setPostUrl(saved.postUrl ?? '')
      toast(posted ? 'Post link saved.' : `${platform.name} marked as posted.`, 'success')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Could not save. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  return (
    <div className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-700 text-night-ink">{platform.name}</h4>
        <a href={platform.url} target="_blank" rel="noopener noreferrer" className="text-xs text-night-lilac underline underline-offset-2">Open {platform.name}</a>
      </div>
      <PublicationRecord publication={publication} />
      {!posted && <p className="mt-2 text-xs leading-relaxed text-night-body">{platform.instructions}</p>}
      <form onSubmit={(event) => void confirm(event)} className="mt-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] text-night-body">{platform.name} post link (optional)</span>
          <input type="url" inputMode="url" value={postUrl} onChange={(event) => setPostUrl(event.target.value)} placeholder="https://…" maxLength={2048} className="input-dark text-xs" />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(!posted || (postUrl.trim() && postUrl.trim() !== (publication?.postUrl ?? ''))) && (
            <button type="submit" disabled={saving} className="btn-dark text-xs">{saving ? 'Saving…' : posted ? 'Save link' : 'I’ve posted this'}</button>
          )}
          {destination.platform === 'yt' && !posted && !hasUpload && (
            destination.connected ? <PostToYouTubeButton reelId={reelId} triggerClass="btn-dark text-xs" />
              : <a href={`/channel/${channelId}/settings`} className="self-center text-[11px] text-night-lilac underline underline-offset-2">Connect for optional upload</a>
          )}
        </div>
        {destination.platform === 'yt' && destination.connected && !posted && !hasUpload && <p className="mt-2 text-[11px] text-night-muted">Optional upload{destination.accountName ? ` to ${destination.accountName}` : ''}. Check visibility in YouTube Studio.</p>}
        {error && <p role="alert" className="mt-2 text-xs text-night-danger">{error}</p>}
      </form>
    </div>
  )
}

export function PublishingDownloads({ reelId, renderUrl, coverUrl, hasSubtitles }: { reelId: string; renderUrl: string | null; coverUrl: string | null; hasSubtitles: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {renderUrl && <a href={attachmentUrl(renderUrl)} className="btn-primary min-w-0 whitespace-normal text-xs" download>Download video</a>}
        {coverUrl && <a href={attachmentUrl(coverUrl)} className="btn-dark min-w-0 whitespace-normal text-xs" download>Download cover</a>}
        {hasSubtitles && <a href={`/api/pipeline/export-subtitles?reelId=${reelId}`} className="btn-dark min-w-0 whitespace-normal text-xs" download>Download subtitles</a>}
        {renderUrl && <a href={`/api/pipeline/export-post-package?reelId=${reelId}`} className="btn-dark min-w-0 whitespace-normal text-xs" download>Post package</a>}
      </div>
      {renderUrl && <ShareVideoButton key={renderUrl} reelId={reelId} renderUrl={renderUrl} />}
    </div>
  )
}

function ShareVideoButton({ reelId, renderUrl }: { reelId: string; renderUrl: string }) {
  const [supported, setSupported] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => { setSupported(typeof navigator.share === 'function' && typeof navigator.canShare === 'function') }, [])
  if (!supported) return null

  async function prepare() {
    setPreparing(true)
    setMessage(null)
    try {
      const prepared = await prepareShareFile(renderUrl, reelId)
      if (!navigator.canShare({ files: [prepared] })) throw new Error(SHARE_DOWNLOAD_FALLBACK)
      setFile(prepared)
      setMessage('Ready. Tap Share video to choose an app.')
    } catch (cause) {
      setMessage(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Preparation took too long. Use Download video instead.')
    } finally { setPreparing(false) }
  }

  // Keep the native call on a fresh click: awaiting the file fetch first loses transient activation.
  async function share() {
    if (!file) return
    try {
      await navigator.share({ files: [file] })
      setMessage('Shared with the app. Finish posting there, then record the destination below.')
    } catch (cause) {
      if (isShareCancellation(cause)) { setMessage(null); return }
      setMessage(`Sharing is unavailable here. ${SHARE_DOWNLOAD_FALLBACK}`)
    }
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={() => file ? void share() : void prepare()} disabled={preparing} className="btn-dark w-full text-xs">{preparing ? 'Preparing video…' : file ? 'Share video' : 'Prepare to share'}</button>
      {message && <p role="status" className="mt-2 text-xs leading-relaxed text-night-body">{message}</p>}
    </div>
  )
}
