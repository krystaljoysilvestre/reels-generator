import '../env.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { PilotProvider, PilotManifest } from './post-for-me-pilot.js'

const usage = `Post for Me — own-account pilot (no customer publishing integration)

Run from the repository root:
  pnpm --filter worker pilot:publishing accounts
  pnpm --filter worker pilot:publishing prepare <config.json> <manifest.json>
  pnpm --filter worker pilot:publishing submit <manifest.json> <reviewed-sha256>
  pnpm --filter worker pilot:publishing status <reel-id>
  pnpm --filter worker pilot:publishing find <external-id>
  pnpm --filter worker pilot:publishing recover <reel-id> <existing-post-id>

Use absolute paths for JSON files. Preparation is read-only. Only submit uploads/posts.
Set POST_FOR_ME_API_KEY and POST_FOR_ME_PILOT_OWNER_ID in ignored .env.local.
Connect accounts and cancel queued posts in the Post for Me dashboard.
See specs/post-for-me-pilot.md for the reviewed pilot boundary.`

async function main() {
  const [command, arg1, arg2] = process.argv.slice(2)
  if (!command || command === '--help') { console.log(usage); return }
  const apiKey = process.env['POST_FOR_ME_API_KEY']
  if (!apiKey) throw new Error('Set POST_FOR_ME_API_KEY in .env.local after creating a Quickstart project.')
  if (!process.env['POST_FOR_ME_PILOT_OWNER_ID']) throw new Error('Set the explicitly selected pilot owner in .env.local.')
  const { PostForMeClient, POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST } = await import('@reels/providers/post-for-me')
  const { preparePilot, submitPilot, inspectPilot, manifestHash } = await import('./post-for-me-pilot.js')
  const client = new PostForMeClient({ apiKey })
  const provider: PilotProvider = {
    async account(id) {
      const a = await client.getAccount(id)
      // preparePilot validates supported platform and connected status before trusting this identity.
      return { id: a.id, platform: a.platform, username: a.username, user_id: a.userId, status: a.status } as Awaited<ReturnType<PilotProvider['account']>>
    },
    async upload(video) { return (await client.uploadVideo(video)).mediaUrl },
    async create(m, mediaUrl, externalId) {
      return client.createPost({
        caption: m.caption, accountIds: m.accounts, mediaUrl, externalId, scheduledAt: m.scheduledAt,
        platformConfigurations: {
          tiktok: {
            privacy_status: 'public', is_ai_generated: true, is_draft: false,
            allow_comment: m.tiktok.allowComment, allow_duet: m.tiktok.allowDuet, allow_stitch: m.tiktok.allowStitch,
            disclose_your_brand: false, disclose_branded_content: false,
          },
          instagram: { placement: 'reels' }, facebook: { placement: 'reels' },
          youtube: { title: m.title, privacy_status: 'public', made_for_kids: m.madeForKids, contains_synthetic_media: true },
        },
      })
    },
    async post(id) {
      const post = await client.getPost(id)
      return { id: post.id, external_id: post.externalId, status: post.status, accountIds: post.accounts.map((a) => a.id) }
    },
    async results(id) {
      const results = []
      let offset: number | null = 0
      for (let page = 0; offset !== null && page < 10; page++) {
        const response = await client.getResults(id, { offset })
        results.push(...response.data.map((r) => ({
          id: r.id, social_account_id: r.accountId, post_id: r.postId, success: r.success,
          platform_data: { ...(r.platformPostId ? { id: r.platformPostId } : {}), ...(r.postUrl ? { url: r.postUrl } : {}) },
        })))
        offset = response.meta.nextOffset
      }
      if (offset !== null) throw new Error('Unexpected result volume; inspect the provider job before continuing.')
      return results
    },
    costCents: (units) => units * POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST,
  }
  if (command === 'accounts') {
    console.log(JSON.stringify(await client.listAccounts(), null, 2))
  } else if (command === 'find' && arg1) {
    console.log(JSON.stringify(await client.listPosts({ externalId: arg1 }), null, 2))
  } else if (command === 'prepare' && arg1 && arg2) {
    const manifest = await preparePilot(JSON.parse(await readFile(resolve(arg1), 'utf8')), provider)
    const outputPath = resolve(arg2)
    await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 })
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({
      manifestPath: outputPath, reviewedHash: manifestHash(manifest), title: manifest.title,
      accounts: manifest.accountIdentities, scheduledAtUtc: new Date(manifest.scheduledAt).toISOString(),
      scheduledAtLocal: new Date(manifest.scheduledAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', timeZoneName: 'short' }),
      caption: manifest.caption, disclosure: manifest.disclosure, visibility: manifest.visibility,
      estimatedCostCents: manifest.accounts.length * POST_FOR_ME_COST_CENTS_PER_SUCCESSFUL_POST,
    }, null, 2))
  } else if (command === 'submit' && arg1 && arg2) {
    console.log(JSON.stringify(await submitPilot(JSON.parse(await readFile(resolve(arg1), 'utf8')) as PilotManifest, arg2, provider), null, 2))
  } else if ((command === 'status' || command === 'recover') && arg1 && (command !== 'recover' || arg2)) {
    console.log(JSON.stringify(await inspectPilot(arg1, provider, arg2), null, 2))
  } else {
    throw new Error(usage)
  }
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Pilot command failed.')
  process.exit(1)
})
