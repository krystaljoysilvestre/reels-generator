import { getDb, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { ToneConfigSchema, WorldBibleSchema, CaptionStyleSchema, AudioPacksSchema, TargetPlatformSchema } from '@reels/core'
import { ChannelSettings } from './ChannelSettings'

export const dynamic = 'force-dynamic'

export default async function ChannelSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) notFound()

  // Parse through the same schemas as creation so the form always starts from valid values.
  return (
    <ChannelSettings
      id={channel.id}
      initial={{
        name: channel.name,
        description: channel.description ?? '',
        nicheDescription: channel.nicheDescription,
        tagline: channel.tagline ?? '',
        targetPlatform: TargetPlatformSchema.catch('all').parse(channel.targetPlatform ?? 'all'),
        targetSeconds: channel.targetSeconds ?? 75,
        stylePreset: channel.stylePreset ?? '',
        styleImageKey: channel.styleImageKey ?? null,
        genreCategory: channel.genreCategory ?? 'general',
        toneConfig: ToneConfigSchema.parse(channel.toneConfig ?? {}),
        worldBible: WorldBibleSchema.parse(channel.worldBible ?? {}),
        captionStyle: CaptionStyleSchema.parse(channel.captionStyle ?? {}),
        generationMode: (channel.generationMode === 'auto' ? 'auto' : 'review'),
        musicMood: AudioPacksSchema.parse(channel.audioPacks ?? {}).musicMood ?? null,
        musicMode: AudioPacksSchema.parse(channel.audioPacks ?? {}).musicMode,
        tasteRubric: channel.tasteRubric ?? null,
      }}
    />
  )
}
