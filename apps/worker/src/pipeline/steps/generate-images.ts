import { eq, and } from 'drizzle-orm'
import { getDb, reels, scenes, assets, channels, stories } from '@reels/db'
import { generateImage, buildInputHash, ContentFilterError, llmCall, downloadBuffer, SCENE_IMAGE_MODEL, SCENE_IMAGE_QUALITY } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt, PLATFORM_PRESETS, StoryBibleSchema } from '@reels/core'
import { z } from 'zod'
import { buildRephrasePrompt, REPHRASE_V1_VERSION, buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// generate_images — step 4
// One image per scene (text-to-image via OpenAI gpt-image-1). Style preset injected server-side — the
// system owns the look, the LLM only writes scene content. Same-`location` continuity is prompt-driven
// (the director describes the place consistently via the SETTING rule); gpt-image-1 has no seed control.
// Content-filter rejection → rephrase.v1 retry (max 3) → mood-only downgrade.
// HERO (tier:'video') + PEAK scenes additionally get a vision QA pass that re-rolls when the render clearly
// contradicts the brief (open door, third-person instead of POV, a figure shown when it should be implied).
// QA improves rather than gates — a reel is never failed on a verdict.

const MAX_REPHRASE_ATTEMPTS = 3

// Scene-image render recipe (model + quality) is the shared SCENE_IMAGE_* recipe from @reels/providers, so
// scene generation, in-editor regenerate, and the onboarding style previews all render identically — what
// the operator approves at creation is what their scenes look like.
const IMAGE_CONCURRENCY = 4
const IMAGE_QA_MODEL = 'claude-haiku-4-5-20251001' // vision QA runs on Claude (the QA provider) — cheap + sees images
// hero/peak scenes get ONE extra attempt on a QA fail — a cheap hedge against a transient miss (an
// occasional open door, a one-off bad roll). Verified empirically: re-rolling a *systematic* image-model
// limit (POV-with-figure, shadow-under-closed-door) never converges, so more attempts just burn cost. When QA
// still fails, the image is kept and the verdict is flagged on meta.qaIssues for the operator to act on.
const MAX_QA_REROLLS = 1

// Claude vision (QA) needs the real media_type; sniff it from magic bytes rather than trusting the
// stored extension (the generated format isn't guaranteed to match the .webp key).
function sniffMediaType(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  return 'image/jpeg'
}

// Run `worker` over items with a rolling pool of `concurrency` runners (each pulls the next item as it
// frees — no head-of-line blocking). Per-item errors are collected, not fatal: successful scenes still
// persist; if any failed we throw at the end so runStep's retry resumes only the still-pending scenes.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const failures: string[] = []
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const i = next++
      try {
        await worker(items[i]!)
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner))
  if (failures.length > 0) {
    throw new Error(`${failures.length}/${items.length} scene image(s) failed: ${failures.join(' | ')}`)
  }
}

export async function generateImages(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  const [reelScenes, channel, story] = await Promise.all([
    db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
    reel.storyId ? db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : Promise.resolve(undefined),
  ])
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  // Story Bible (from analyze_story). null = not analyzed → assembleImagePrompt falls back to the plain
  // style+content form (pre-bible behavior). When present, each scene's entity refs expand to the bible's
  // frozen canonical descriptions, spliced identically across scenes (see specs/story-bible.md).
  const storyBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null

  // Generate at the channel's platform aspect (reels are 9:16) so scene images fill the frame.
  const aspect = (PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect

  const pending = reelScenes.filter((s) => s.visualPrompt && !s.imageAssetId) // skip already-generated (idempotency)

  // QA targets: the hero (tier:'video') beats that get animated/showcased, plus the peak scene (the climax
  // may be a still). These get the vision QA + re-roll; the rest generate once, keeping QA cost bounded.
  const peak = story?.twistAnchor?.trim() ?? ''
  const isQATarget = (s: (typeof pending)[number]) => s.tier === 'video' || (peak !== '' && s.narrationText.includes(peak))

  const processScene = async (scene: (typeof pending)[number]) => {
    // Server-side assembly — the LLM never sees this. Style suffix + (when analyzed) the scene's bible
    // entities expanded to their frozen canonical descriptions, so recurring elements don't drift.
    const expansion = storyBible
      ? { bible: storyBible, primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities }
      : undefined
    const finalPrompt = assembleImagePrompt(scene.visualPrompt!, channel.stylePreset, expansion)
    const negativePrompt = assembleNegativePrompt({ genreCategory: channel.genreCategory })

    const inputHash = buildInputHash('generate_images.v1', {
      finalPrompt,
      sceneIdx: scene.idx,
      reelId,
      model: SCENE_IMAGE_MODEL,
      quality: SCENE_IMAGE_QUALITY, // in the hash so a recipe change busts the cache + regenerates
    })

    await runStep(
      { reelId, stepName: 'generate_images', inputHash: `${inputHash}:scene${scene.idx}` as never },
      async () => {
        const qa = isQATarget(scene)
        let totalCost = 0
        let chosen: Awaited<ReturnType<typeof generateImageWithRetry>> | undefined
        let extraNeg = '' // targeted negatives added across re-rolls to push the model off the flagged failure
        let lastIssues: string[] = [] // QA verdict of the kept image ([] = passed / not QA'd)

        // Each attempt re-generates (gpt-image-1 is non-deterministic, so a re-roll is a genuinely
        // different render) and overwrites the same storage key, so stopping at the first pass leaves the
        // passing image in place. Non-QA scenes generate exactly once.
        for (let attempt = 0; attempt <= (qa ? MAX_QA_REROLLS : 0); attempt++) {
          const result = await generateImageWithRetry({
            prompt: finalPrompt,
            negativePrompt: extraNeg ? `${negativePrompt}, ${extraNeg}` : negativePrompt,
            reelId,
            sceneIdx: scene.idx,
            aspect,
            mood: scene.mood,
            stylePreset: channel.stylePreset,
            genreCategory: channel.genreCategory,
          })
          totalCost += result.costCents
          chosen = result

          if (!qa) break

          const { verdict, costCents } = await imageQA(result.asset.storageKey, scene.visualPrompt!)
          totalCost += costCents
          lastIssues = verdict.issues
          if (verdict.pass) {
            lastIssues = []
            if (attempt > 0) console.log(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} passed on re-roll ${attempt}`)
            break
          }
          // Targeted re-roll: the dominant failure is the model rendering a full figure / third-person when
          // the brief wants POV. When QA flags that, add anti-third-person negatives so the re-roll has a
          // real shot at the viewpoint (a blind re-roll alone rarely fixes a systematic viewpoint miss).
          if (/third.person|full body|\bfigure\b|perspective|\bpov\b|eye.?line|looking down/i.test(verdict.issues.join(' '))) {
            extraNeg = 'third person, full body shot, visible person, figure in frame, camera looking down at a person'
          }
          const tag = attempt < MAX_QA_REROLLS ? 're-rolling' : 'keeping (no pass)'
          console.warn(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} attempt ${attempt} failed → ${tag}: ${verdict.issues.join('; ')}`)
        }

        // Persist asset + link to scene. QA verdict rides on meta (qaPass / qaIssues) so a later storyboard
        // pass can flag "this hero shot may not match the brief" to the operator instead of it being silent.
        const meta = {
          ...(chosen!.asset.meta as Record<string, unknown>),
          ...(qa ? { qaPass: lastIssues.length === 0 } : {}),
          ...(lastIssues.length ? { qaIssues: lastIssues } : {}),
        }
        const [asset] = await db
          .insert(assets)
          .values({
            reelId,
            channelId: reel.channelId,
            kind: 'image',
            storageKey: chosen!.asset.storageKey,
            provider: 'openai',
            costCents: totalCost,
            meta,
          })
          .returning()

        await db
          .update(scenes)
          .set({ imageAssetId: asset!.id })
          .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))

        return { output: { assetId: asset!.id }, costCents: totalCost }
      },
    )
  }

  // Rolling pool — fast without flooding fal, and one bad scene doesn't abort the others.
  await runPool(pending, IMAGE_CONCURRENCY, processScene)
}

// Vision QA: does the render match the brief's checkable intent? Sniffs the real media type so it works
// regardless of fal's output format. Cheap (Haiku); only called on hero/peak scenes.
async function imageQA(storageKey: string, visualPrompt: string): Promise<{ verdict: z.infer<typeof ImageQASchema>; costCents: number }> {
  const buf = await downloadBuffer(storageKey)
  const { system, userMessage } = buildImageQAPrompt(visualPrompt)
  const r = await llmCall({
    templateVersion: IMAGE_QA_V1_VERSION,
    schema: ImageQASchema,
    provider: 'anthropic', // QA runs on Claude
    model: IMAGE_QA_MODEL,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', mediaType: sniffMediaType(buf), base64: buf.toString('base64') },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  })
  return { verdict: r.data, costCents: r.costCents }
}

interface ImageGenAttemptParams {
  prompt: string
  negativePrompt: string
  reelId: string
  sceneIdx: number
  aspect: string
  mood: string[]
  stylePreset: string
  genreCategory: string
}

async function generateImageWithRetry(params: ImageGenAttemptParams) {
  let currentPrompt = params.prompt
  let totalCost = 0

  for (let attempt = 0; attempt < MAX_REPHRASE_ATTEMPTS; attempt++) {
    try {
      const result = await generateImage({
        prompt: currentPrompt,
        negativePrompt: params.negativePrompt,
        reelId: params.reelId,
        sceneIdx: params.sceneIdx,
        aspect: params.aspect,
        quality: SCENE_IMAGE_QUALITY,
      })
      return { ...result, costCents: result.costCents + totalCost }
    } catch (err) {
      if (!(err instanceof ContentFilterError)) throw err

      // rephrase.v1 retry [docs/04 §4.3]
      const { system, userMessage } = buildRephrasePrompt(currentPrompt, { genreCategory: params.genreCategory })
      const rephrase = await llmCall({
        templateVersion: REPHRASE_V1_VERSION,
        schema: z.string(),
        system,
        messages: [{ role: 'user', content: userMessage }],
      })
      totalCost += rephrase.costCents
      currentPrompt = typeof rephrase.data === 'string' ? rephrase.data : currentPrompt

      if (attempt === MAX_REPHRASE_ATTEMPTS - 1) {
        // Final attempt failed → mood-only downgrade. Drop the (rejected) subject but KEEP the channel
        // style so the fallback still looks like the rest of the reel, not a generic off-brand still.
        currentPrompt = assembleImagePrompt(
          `${params.mood.join(', ')} atmosphere, empty scene, abstract shapes, deep shadow, negative space`,
          params.stylePreset,
        )
      }
    }
  }
  throw new Error(`Image generation failed after ${MAX_REPHRASE_ATTEMPTS} rephrase attempts`)
}
