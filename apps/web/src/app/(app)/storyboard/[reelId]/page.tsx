import { getDb, reels, scenes, assets, channels, pipelineSteps } from '@reels/db'
import { and, desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import type { ChannelVoice } from '@reels/core'
import { StoryboardEditor } from './StoryboardEditor'

export const dynamic = 'force-dynamic'

export default async function StoryboardPage({ params }: { params: Promise<{ reelId: string }> }) {
  await requireAuth()
  const { reelId } = await params
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
    },
  })

  const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })

  // Map scene idx → image URL (R2 public URL or storage key)
  const sceneImages: Record<number, string> = {}
  const sceneVideoVariations: Record<number, string[]> = {}
  for (const scene of reel.scenes) {
    const imgAsset = reelAssets.find((a) => a.id === scene.imageAssetId)
    if (imgAsset) sceneImages[scene.idx] = `/api/asset?key=${encodeURIComponent(imgAsset.storageKey)}`
    const videos = reelAssets.filter(
      (a) => a.kind === 'video' && (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx,
    )
    if (videos.length) sceneVideoVariations[scene.idx] = videos.map((v) => v.storageKey)
  }

  const renderAsset = reelAssets.find((a) => a.kind === 'render')
  const renderUrl = renderAsset ? `/api/asset?key=${encodeURIComponent(renderAsset.storageKey)}` : null

  // If the reel hard-failed, surface which step + why (the chain stops at the first failed step).
  let failure: { step: string; error: string } | null = null
  if (reel.status === 'failed') {
    const failed = await db.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.status, 'failed')),
      orderBy: [desc(pipelineSteps.startedAt)],
    })
    if (failed) failure = { step: failed.stepName, error: (failed.error ?? 'Unknown error').slice(0, 300) }
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
      sceneVideoVariations={sceneVideoVariations}
      renderUrl={renderUrl}
      channelName={channel?.name ?? ''}
      failure={failure}
    />
  )
}
