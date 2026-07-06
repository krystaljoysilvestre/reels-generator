import { getDb, reels, scenes, assets, channels, pipelineSteps } from '@reels/db'
import { and, desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { type ChannelVoice, type VoiceSettings, moodToVoiceSettings, ToneConfigSchema, AudioPacksSchema, OperatorSfxSchema, PRESET_BEDS } from '@reels/core'
import { channelMood, MOOD_TINT } from '@/lib/pipeline-phases'
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
      audioPacks: true, genreCategory: true,
    },
  })

  const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })

  // Map scene idx → image URL (R2 public URL or storage key)
  const sceneImages: Record<number, string> = {}
  const sceneVideoVariations: Record<number, string[]> = {}
  // Per-scene image history for Undo/Redo: every image ever generated for the scene, oldest→newest. Each regen
  // writes a UNIQUE storage key (see regen-image route) so old images survive and can be re-pointed to for free.
  // A scene's images are identified by the `/scenes/<idx>/` segment in the storage key.
  const sceneImageHistory: Record<number, { assetId: string; url: string }[]> = {}
  for (const scene of reel.scenes) {
    const imgAsset = reelAssets.find((a) => a.id === scene.imageAssetId)
    // ?v=<assetId> busts the browser cache: a regenerated scene gets a NEW asset id → a new URL, so the
    // browser can never show the previous (e.g. pre-fix) image for the same storage key.
    if (imgAsset) sceneImages[scene.idx] = `/api/asset?key=${encodeURIComponent(imgAsset.storageKey)}&v=${imgAsset.id}`
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
      sceneImageHistory={sceneImageHistory}
      sceneVideoVariations={sceneVideoVariations}
      renderUrl={renderUrl}
      musicMood={reel.musicMood}
      channelMusicMood={channelMusicMood}
      aiMusic={aiMusic}
      musicMode={musicMode}
      channelMusicTracks={channelMusicTracks}
      musicUploadUrl={musicUploadUrl}
      initialVideoEffects={Array.isArray(reel.videoEffects) ? (reel.videoEffects as string[]) : null}
      initialSoundNotes={reel.soundNotes ?? ''}
      initialOperatorSfx={OperatorSfxSchema.parse(reel.operatorSfx ?? [])}
      initialVoiceSettings={initialVoiceSettings}
      channelName={channel?.name ?? ''}
      genreCategory={channel?.genreCategory ?? 'general'}
      moodTint={moodTint}
      failure={failure}
    />
  )
}
