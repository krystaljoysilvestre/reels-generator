import { writeFileSync } from 'node:fs'
import '../env.js'
async function main() {
  const { downloadBuffer } = await import('@reels/providers')
  const key = process.argv[2]!
  const buf = await downloadBuffer(key)
  writeFileSync('/tmp/scene7.webp', buf)
  console.log('wrote /tmp/scene7.webp', buf.length, 'bytes')
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
