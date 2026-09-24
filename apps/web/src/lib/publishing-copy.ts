import { formatImageCredits, formatPublishingCaption, PostMetaSchema, StoryBibleSchema, EMPTY_STORY_BIBLE } from '@reels/core'
import { sceneImageOrigins } from '@reels/db'

export async function publishingCopy(reel: {
  id: string
  postMeta: unknown
  storyBible: unknown
  story?: { title: string; logline: string | null } | null
}) {
  const parsedMeta = PostMetaSchema.safeParse(reel.postMeta)
  const postMeta = parsedMeta.success ? parsedMeta.data : null
  const parsedBible = StoryBibleSchema.safeParse(reel.storyBible)
  const bible = parsedBible.success ? parsedBible.data : EMPTY_STORY_BIBLE
  const imageCredits = formatImageCredits(bible, await sceneImageOrigins(reel.id))
  return { postMeta, imageCredits, captionText: formatPublishingCaption(postMeta, reel.story ?? {}, imageCredits) }
}
