// R2 bucket sweep. `tsx scripts/r2-sweep.ts` lists objects grouped by top-level prefix;
// `tsx scripts/r2-sweep.ts --delete <prefix...>` deletes everything under the given prefixes.
import '../src/env.js'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// @aws-sdk/client-s3 is a dependency of @reels/providers (not the worker) — resolve it from there.
const requireFromProviders = createRequire(
  fileURLToPath(new URL('../../../packages/providers/src/index.ts', import.meta.url)),
)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = requireFromProviders('@aws-sdk/client-s3')

void (async () => {
  const args = process.argv.slice(2)
  const doDelete = args[0] === '--delete'
  const prefixes = doDelete ? args.slice(1) : []

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
    },
  })
  const Bucket = process.env['R2_BUCKET_NAME'] ?? 'reels-assets'

  // Full listing (paginated)
  const keys: { key: string; size: number }[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }))
    for (const o of res.Contents ?? []) keys.push({ key: o.Key!, size: o.Size ?? 0 })
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  if (!doDelete) {
    const groups = new Map<string, { n: number; bytes: number }>()
    for (const { key, size } of keys) {
      const top = key.split('/').slice(0, 2).join('/') // two levels for useful granularity
      const g = groups.get(top) ?? { n: 0, bytes: 0 }
      g.n++; g.bytes += size
      groups.set(top, g)
    }
    console.log(`${keys.length} objects total\n`)
    for (const [prefix, g] of [...groups.entries()].sort()) {
      console.log(`${prefix.padEnd(45)} ${String(g.n).padStart(5)} objects  ${(g.bytes / 1024 / 1024).toFixed(1).padStart(8)} MB`)
    }
    return
  }

  const toDelete = keys.filter(({ key }) => prefixes.some((p) => key.startsWith(p)))
  console.log(`deleting ${toDelete.length} of ${keys.length} objects under: ${prefixes.join(', ')}`)
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000)
    await client.send(new DeleteObjectsCommand({
      Bucket,
      Delete: { Objects: batch.map(({ key }) => ({ Key: key })), Quiet: true },
    }))
    console.log(`  deleted ${Math.min(i + 1000, toDelete.length)}/${toDelete.length}`)
  }
  console.log('done')
})()
