import { getDb, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { assertChannelAccess } from '@/lib/access'
import { resolveChannelPolicy, ToneConfigSchema, WorldBibleSchema, CaptionStyleSchema, AudioPacksSchema, TargetPlatformsSchema, PostingRulesSchema, resolvePublishSlots, resolvePublishDays } from '@reels/core'
import { isYouTubeConfigured } from '@reels/providers'
import { ChannelSettings } from './ChannelSettings'
import { channelMetadata } from '@/lib/page-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return channelMetadata((await params).id, 'Settings')
}

export default async function ChannelSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await assertChannelAccess(id)
  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) notFound()

  // Parse through the same schemas as creation so the form always starts from valid values.
  const postingRules = PostingRulesSchema.parse(channel.postingRules ?? {})
  return (
    <ChannelSettings
      id={channel.id}
      initial={{
        name: channel.name,
        avatarKey: channel.avatarKey ?? null,
        description: channel.description ?? '',
        nicheDescription: channel.nicheDescription,
        tagline: channel.tagline ?? '',
        // A row written before the set existed can still hold the legacy 'all' bucket — channelPlatformPreset
        // handles that for the SPEC, but Settings edits the set itself, so widen it here too.
        targetPlatforms: TargetPlatformsSchema.catch(['tiktok', 'youtube_shorts', 'facebook_reels']).parse(channel.targetPlatforms ?? []),
        targetSeconds: channel.targetSeconds ?? 75,
        stylePreset: channel.stylePreset ?? '',
        styleImageKey: channel.styleImageKey ?? null,
        genreCategory: channel.genreCategory ?? 'general',
        presentation: (channel.presentation === 'voiceover' || channel.presentation === 'hosted' ? channel.presentation : ''),
        factCheck: channel.factCheck ?? false,
        narrativeStyle: channel.narrativeStyle ?? '',
        narrativeVoice: channel.narrativeVoice ?? '',
        styleInfluence: channel.styleInfluence ?? 'medium',
        toneConfig: ToneConfigSchema.parse(channel.toneConfig ?? {}),
        worldBible: WorldBibleSchema.parse(channel.worldBible ?? {}),
        captionStyle: CaptionStyleSchema.parse(channel.captionStyle ?? {}),
        generationMode: (channel.generationMode === 'auto' ? 'auto' : 'review'),
        musicMood: AudioPacksSchema.parse(channel.audioPacks ?? {}).musicMood ?? null,
        musicMode: AudioPacksSchema.parse(channel.audioPacks ?? {}).musicMode,
        tasteRubric: channel.tasteRubric ?? null,
        editorialPrinciples: channel.editorialPrinciples ?? '',
        // Resolved rather than raw: a channel that predates this dimension has NULL, and showing the
        // creator a blank when the engine is actually running the legacy inference would be a lie.
        sourcePolicy: resolveChannelPolicy(null, null, channel),
        autoProduce: postingRules.autoProduce,
        // Posting schedule. Slots come back resolved (a channel that never set any still has one —
        // its scheduleUtcHour) so the form shows the times the schedule would actually use.
        publish: {
          mode: postingRules.publish.mode,
          slotsUtc: resolvePublishSlots(postingRules),
          daysUtc: resolvePublishDays(postingRules),
        },
        youtubeConfigured: isYouTubeConfigured(),
      }}
    />
  )
}
