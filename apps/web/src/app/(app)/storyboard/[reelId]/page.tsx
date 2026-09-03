import { getDb, reels, assets, channels, pipelineSteps, publications, platformConnections } from '@reels/db'
import { and, desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { assertReelAccess } from '@/lib/access'
import { type ChannelVoice, type VoiceSettings, moodToVoiceSettings, ToneConfigSchema, AudioPacksSchema, OperatorSfxSchema, PostMetaSchema, ReelCoverSchema, CaptionStyleSchema, TimingsSchema, channelPlatformPreset, PRESET_BEDS } from '@reels/core'
import { channelMood, MOOD_TINT } from '@/lib/pipeline-phases'
import { StoryboardEditor } from './StoryboardEditor'
import { reelMetadata } from '@/lib/page-metadata'
import { MISSING_FAILURE_DETAIL, recoveryStep } from '@/lib/retry-failure'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ reelId: string }> }) {
  return reelMetadata((await params).reelId, 'Storyboard')
}

export default async function StoryboardPage({ params }: { params: Promise<{ reelId: string }> }) {
  const { reelId } = await params
  await assertReelAccess(reelId)
  const db = getDb()

  const reel = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    with: { story: true, scenes: true },
  })
  if (!reel) notFound()

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, reel.channelId),
    // voicePool serves single-voice channels; the niche/tone/keyword fields let the editor
    // recommend a narrator on the fly for per_story channels (empty pool) so render isn't blocked.
    columns: {
      id: true, name: true, voicePool: true,
      nicheDescription: true, toneConfig: true, voiceSearchKeyword: true,
      audioPacks: true, genreCategory: true,
      // The burned-in caption look, so the stage can show a scene's line the way a viewer meets it.
      captionStyle: true,
      // Resolves the channel's aspect for the cover picker, via channelPlatformPreset.
      targetPlatforms: true,
    },
  })

  const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const connections = channel ? await db.query.platformConnections.findMany({
    where: eq(platformConnections.channelId, channel.id),
    columns: { platform: true, providerAccountName: true, status: true },
  }) : []

  // Map scene idx → image URL (R2 public URL or storage key)
  const sceneImages: Record<number, string> = {}
  const sceneImageQa: Record<number, { craftIssues: string[]; truthIssues: string[]; truthBlocked: boolean }> = {}
  const sceneVideoVariations: Record<number, string[]> = {}
  // Per-scene image history for Undo/Redo: every image ever generated for the scene, oldest→newest. Each regen
  // writes a UNIQUE storage key (see regen-image route) so old images survive and can be re-pointed to for free.
  // A scene's images are identified by the `/scenes/<idx>/` segment in the storage key.
  const sceneImageHistory: Record<number, { assetId: string; url: string }[]> = {}
  for (const scene of reel.scenes) {
    const imgAsset = reelAssets.find((a) => a.id === scene.imageAssetId)
    // ?v=<assetId> busts the browser cache: a regenerated scene gets a NEW asset id → a new URL, so the
    // browser can never show the previous (e.g. pre-fix) image for the same storage key.
    if (imgAsset) {
      sceneImages[scene.idx] = `/api/asset?key=${encodeURIComponent(imgAsset.storageKey)}&v=${imgAsset.id}`
      const meta = (imgAsset.meta ?? {}) as Record<string, unknown>
      const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      sceneImageQa[scene.idx] = {
        craftIssues: strings(meta['qaIssues']),
        truthIssues: strings(meta['truthQaIssues']),
        truthBlocked: meta['truthQaRequired'] === true && meta['truthQaPass'] !== true,
      }
    }
    const videos = reelAssets.filter(
      (a) => a.kind === 'video' && (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx,
    )
    if (videos.length) sceneVideoVariations[scene.idx] = videos.map((v) => v.storageKey)

    const sceneImgAssets = reelAssets
      .filter((a) => a.kind === 'image' && a.storageKey.includes(`/scenes/${scene.idx}/`))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    // Collapse assets that share a storage key: older regens OVERWROTE one key (image.webp) so only the
    // newest row for each key still has live bytes — the rest resolve to the same image. Keep one entry per
    // distinct key (newest wins in asc order) so Undo/Redo only steps between images that truly differ.
    const byKey = new Map<string, (typeof sceneImgAssets)[number]>()
    for (const a of sceneImgAssets) byKey.set(a.storageKey, a)
    sceneImageHistory[scene.idx] = [...byKey.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((a) => ({ assetId: a.id, url: `/api/asset?key=${encodeURIComponent(a.storageKey)}&v=${a.id}` }))
  }

  // Story Bible → "Cast & Places" editor data. Each entity carries its reference-plate thumbnail (the look
  // every scene featuring it is anchored to). Plates overwrite the same R2 key on re-mint, so bust the
  // browser cache with the reel's updatedAt (an edit bumps it) — there's no per-plate asset id to use.
  // Re-renders overwrite the SAME render.mp4 key and upsert the SAME asset row (id is stable), so the id
  // alone never busts the cache — a new cut would show the old bytes. Bust on the asset's createdAt (bumped
  // every render) so each render produces a fresh URL.
  const renderAsset = reelAssets.find((a) => a.kind === 'render')
  const renderUrl = renderAsset
    ? `/api/asset?key=${encodeURIComponent(renderAsset.storageKey)}&v=${new Date(renderAsset.createdAt).getTime()}`
    : null
  const parsedTimings = TimingsSchema.safeParse(reel.timings)
  const renderDurationSecs = parsedTimings.success ? parsedTimings.data.durationMs / 1000 : null

  // The PACKAGING a viewer meets before pressing play — the platform title and the cover.
  // Passed to the spot-check gate because that is where "would you publish this?" gets answered, and until
  // now neither was on that screen: every surface showed `stories.title` (the deliberately casual WORKING
  // title, e.g. "the rungs he left behind") while the real platform title sat unread in postMeta, and the
  // cover was never rendered anywhere in the app at all.
  // Matched by role, not by hardcoded key — the same way the export route finds it.
  const coverAsset = reelAssets.find((a) => (a.meta as Record<string, unknown> | null)?.['role'] === 'thumbnail')

  // Frames the cover can be built from: one per scene that has an image, in scene order. `?v=<assetId>`
  // busts the browser cache the same way the scene grid does — a regenerated frame is a new asset id.
  const coverFrames = reel.scenes
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .flatMap((s) => {
      const asset = s.imageAssetId ? reelAssets.find((a) => a.id === s.imageAssetId) : null
      return asset
        ? [{ assetId: asset.id, sceneIdx: s.idx, url: `/api/asset?key=${encodeURIComponent(asset.storageKey)}&v=${asset.id}` }]
        : []
    })
  // The platform preset is the authority on the channel's aspect — the same seam composeCover uses, so the
  // picker's tiles are the shape the cover will actually be.
  const coverPreset = channel ? channelPlatformPreset(channel) : null
  const coverAspectVertical = coverPreset ? coverPreset.height > coverPreset.width : true
  const parsedCover = ReelCoverSchema.safeParse(reel.cover)
  const coverSelection = parsedCover.success
    ? {
        frameAssetId: parsedCover.data.frameAssetId,
        source: parsedCover.data.source,
        // Drop any shortlist entry whose frame no longer exists (a regenerated scene replaces its asset),
        // so the picker never renders a broken tile.
        shortlist: parsedCover.data.shortlist.flatMap((c) => {
          const frame = coverFrames.find((f) => f.assetId === c.assetId)
          return frame ? [{ ...c, url: frame.url }] : []
        }),
        sampled: parsedCover.data.sampled,
        total: parsedCover.data.total,
      }
    : null

  const parsedMeta = PostMetaSchema.safeParse(reel.postMeta)
  const packaging = parsedMeta.success
    ? {
        title: parsedMeta.data.title,
        thumbnailText: parsedMeta.data.thumbnailText,
        // The cover upserts in place on the SAME key, so the asset id never changes and can't bust the
        // cache. createdAt is bumped on every rebuild, which is what makes an edited cover actually appear.
        coverUrl: coverAsset
          ? `/api/asset?key=${encodeURIComponent(coverAsset.storageKey)}&v=${new Date(coverAsset.createdAt).getTime()}`
          : null,
        // Which frame the cover is built from, who chose it, and the ranked shortlist behind the
        // recommendation — so the picker can show WHY a frame is recommended rather than an opaque order.
        cover: coverSelection,
        // Every frame the reel owns, for "show all frames". These are already generated and already paid
        // for, so switching between them is free.
        frames: coverFrames,
        vertical: coverAspectVertical,
      }
    : null
  // Background music reflects the channel's chosen mode (Sound step): AI → a per-reel mood dropdown (steers
  // the bed generated at render); preset/upload → the actual chosen track(s), shown read-only with a preview;
  // none → silent. For preset/upload we resolve a friendly label + a playable URL for each pool track.
  const channelAudioPacks = AudioPacksSchema.parse(channel?.audioPacks ?? {})
  const musicMode = channelAudioPacks.musicMode
  const aiMusic = musicMode === 'ai'
  const channelMusicMood = channelAudioPacks.musicMood ?? null
  const channelMusicTracks = channelAudioPacks.musicPack.map((t) => {
    const preset = PRESET_BEDS.find((b) => b.id === t.id)
    const label = preset ? `${preset.niche} · ${preset.mood}` : musicMode === 'upload' ? 'Uploaded track' : t.id
    return { label, url: `/api/asset?key=${encodeURIComponent(t.path)}` }
  })
  // Per-reel operator-uploaded bed (overrides the channel's music at render); null if none.
  const musicUploadUrl = reel.musicUploadKey ? `/api/asset?key=${encodeURIComponent(reel.musicUploadKey)}` : null

  // Delivery the picker's voice previews play at: the reel's saved override if it has one, else the
  // channel's baseline delivery (genre envelope + tone). Auto-derived; no manual editing in the UI.
  const tone = ToneConfigSchema.parse(channel?.toneConfig ?? {})
  const initialVoiceSettings: VoiceSettings =
    (reel.voiceSettings as VoiceSettings | null) ??
    moodToVoiceSettings([], tone, channel?.genreCategory)
  // Channel-mood accent (dark=red / warm=amber / neutral=midnight) for the storyboard's ambient touches.
  const moodTint = MOOD_TINT[channelMood(tone)]

  // A scheduled reel is already uploaded and waiting on its slot — the footer shows when it goes live.
  let scheduledAt: string | null = null
  if (reel.status === 'scheduled') {
    const pub = await db.query.publications.findFirst({
      where: and(eq(publications.reelId, reelId), eq(publications.status, 'scheduled')),
    })
    scheduledAt = pub?.scheduledAt?.toISOString() ?? null
  }

  // Did the automated render checks pass? The finished-reel screen says so out loud, so it reads the real
  // render_qa row rather than asserting it. null = the step hasn't run for this reel (older reels, or a
  // reel that hasn't rendered yet), and the screen then claims nothing.
  let renderQa: 'passed' | 'failed' | null = null
  if (['spot_check', 'approved', 'scheduled', 'published'].includes(reel.status)) {
    const qaStep = await db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'render_qa')),
      orderBy: [desc(pipelineSteps.startedAt)],
    })
    renderQa = qaStep?.status === 'done' ? 'passed' : qaStep?.status === 'failed' ? 'failed' : null
  }

  // If the reel hard-failed, surface which step + why (the chain stops at the first failed step).
  let failure: { step: string; error: string } | null = null
  if (reel.status === 'failed') {
    const failed = await db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.status, 'failed')),
      orderBy: [desc(pipelineSteps.finishedAt)],
    })
    const latestDurable = failed ? null : await db.query.pipelineSteps.findFirst({
      where: eq(pipelineSteps.reelId, reelId),
      orderBy: [desc(pipelineSteps.finishedAt)],
    })
    const recoverable = recoveryStep(failed, latestDurable)
    if (recoverable) {
      failure = {
        step: recoverable.stepName,
        error: (recoverable.error ?? MISSING_FAILURE_DETAIL).slice(0, 300),
      }
    }
  }

  return (
    <StoryboardEditor
      reel={{
        id: reel.id,
        status: reel.status,
        voiceId: reel.voiceId,
        costCents: reel.costCents,
        operatorMinutes: reel.operatorMinutes,
        language: reel.language,
        metricsViews: (reel.metrics as { views?: number } | null)?.views ?? null,
        channelId: reel.channelId,
        publishDestinations: (channel?.targetPlatforms ?? []).map((target) => {
          const platform = target === 'youtube_shorts' || target === 'youtube_long' ? 'yt' : target === 'facebook_reels' ? 'fb' : 'tiktok'
          const connection = connections.find((c) => c.platform === platform && c.status === 'active')
          return { target, connected: Boolean(connection), accountName: connection?.providerAccountName ?? null }
        }),
        scheduledAt,
      }}
      story={reel.story ?? null}
      scenes={reel.scenes.sort((a, b) => a.idx - b.idx)}
      voicePool={(channel?.voicePool ?? []) as ChannelVoice[]}
      voiceRecommend={{
        nicheDescription: channel?.nicheDescription ?? '',
        language: reel.language,
        toneConfig: channel?.toneConfig ?? null,
        searchKeyword: channel?.voiceSearchKeyword ?? '',
      }}
      sceneImages={sceneImages}
      sceneImageQa={sceneImageQa}
      sceneImageHistory={sceneImageHistory}
      sceneVideoVariations={sceneVideoVariations}
      renderUrl={renderUrl}
      renderDurationSecs={renderDurationSecs}
      packaging={packaging}
      // The whole post package, for the finished-reel screen's inline title + caption fields.
      postMeta={parsedMeta.success ? parsedMeta.data : null}
      renderQa={renderQa}
      // The reel's real output size, named on the render ledger's "Rendering the final cut" row.
      renderSize={coverPreset ? `${coverPreset.width}×${coverPreset.height}` : '1080×1920'}
      captionStyle={CaptionStyleSchema.parse(channel?.captionStyle ?? {})}
      musicMood={reel.musicMood}
      channelMusicMood={channelMusicMood}
      aiMusic={aiMusic}
      musicMode={musicMode}
      channelMusicTracks={channelMusicTracks}
      musicUploadUrl={musicUploadUrl}
      initialVideoEffects={Array.isArray(reel.videoEffects) ? (reel.videoEffects as string[]) : null}
      initialOperatorSfx={OperatorSfxSchema.parse(reel.operatorSfx ?? [])}
      initialVoiceSettings={initialVoiceSettings}
      channelName={channel?.name ?? ''}
      genreCategory={channel?.genreCategory ?? 'general'}
      moodTint={moodTint}
      failure={failure}
    />
  )
}
