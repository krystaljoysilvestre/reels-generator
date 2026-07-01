import { config } from 'dotenv'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
config({ path: resolve(process.cwd(), '.env.local') })
async function main() {
  const { downloadBuffer } = await import('@reels/providers')
  const key = process.argv[2]!
  const buf = await downloadBuffer(key)
  writeFileSync('/tmp/scene7.webp', buf)
  console.log('wrote /tmp/scene7.webp', buf.length, 'bytes')
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
