import { eq } from 'drizzle-orm'
import { getDb, reels, stories, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { PostingRulesSchema, PostMetaSchema, BudgetExceededError, type PostMeta } from '@reels/core'
import { buildPostMetaPrompt, PostMetaLlmSchema, POST_META_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// generate_post_meta — the publish package (title / hook / caption / hashtags) for this reel, written
// once the story is final (post story-approval, before the scene breakdown). Operator-editable via the
// post-meta route; consumed by export-post-package. Regenerates when the story text changes.
//
// Fail-soft: packaging must never block production. If the LLM fails we persist a minimal meta derived
// from the story (title + logline, no hashtags) and mark the step done.

export async function generatePostMeta(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const [story, channel] = await Promise.all([
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!story || !channel) throw new Error('Story or channel not found')

  const postingRules = PostingRulesSchema.parse(channel.postingRules ?? {})

  const { system, userMessage } = buildPostMetaPrompt({
    channelName: channel.name,
    nicheDescription: channel.nicheDescription ?? '',
    language: reel.language,
    platforms: postingRules.platforms,
    genreCategory: channel.genreCategory,
    title: story.title,
    logline: story.logline ?? '',
    narration: story.body,
  })

  // Narration covers story edits/regens; platforms so a Settings change re-packages.
  const inputHash = buildInputHash(POST_META_V1_VERSION, {
    narration: story.body,
    title: story.title,
    platforms: postingRules.platforms.join(','),
    language: reel.language,
  })

  const minimalMeta: PostMeta = {
    v: 1,
    title: story.title.slice(0, 120),
    hook: (story.logline ?? '').slice(0, 200),
    caption: '',
    hashtags: [],
    language: reel.language,
  }

  // A reel at its budget cap must not die over PACKAGING (the harness pre-checks budget and throws
  // before fn runs, so this is caught around runStep, not inside it). Persist the minimal meta and
  // move on — the expensive downstream steps are the ones that should enforce the cap for real.
  let result: { output: PostMeta; skipped: boolean }
  try {
    result = await runStep<PostMeta>({ reelId, stepName: 'generate_post_meta', inputHash }, async () => {
      // Tracked outside the try: the LLM can succeed and the schema parse below still throw, in which
      // case the tokens were already billed. Falling back to a minimal meta is free — the call wasn't.
      let spent = 0
      try {
        const llm = await llmCall({
          templateVersion: POST_META_V1_VERSION,
          schema: PostMetaLlmSchema,
          system,
          messages: [{ role: 'user', content: userMessage }],
          temperature: 0.8,
          maxTokens: 800,
        })
        spent = llm.costCents
        const meta = PostMetaSchema.parse({ ...PostMetaLlmSchema.parse(llm.data), v: 1, language: reel.language })
        return { output: meta, costCents: spent }
      } catch (err) {
        console.warn(`[post-meta] ${reelId.slice(0, 8)} packaging failed, persisting minimal meta: ${err instanceof Error ? err.message : String(err)}`)
        return { output: minimalMeta, costCents: spent }
      }
    })
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err
    console.warn(`[post-meta] ${reelId.slice(0, 8)} reel is at its budget cap — persisting minimal meta, no LLM call`)
    result = { output: minimalMeta, skipped: false }
  }

  // A cache hit means the story hasn't changed — keep whatever's on the reel (the operator may have
  // edited it). A fresh run means the story DID change, so the regenerated package wins.
  if (!result.skipped || !reel.postMeta) {
    await db.update(reels).set({ postMeta: result.output, updatedAt: new Date() }).where(eq(reels.id, reelId))
  }
}
