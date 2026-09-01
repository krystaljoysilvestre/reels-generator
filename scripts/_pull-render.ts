import '../src/env.js'
void (async () => {
  const { downloadBuffer } = await import('@reels/providers')
  const fs = await import('node:fs/promises')
  const buf = await downloadBuffer('reels/38f08fcf-51e5-468a-9a58-5364872abfc5/render.mp4')
  await fs.writeFile(`${process.env['OUT']}/render.mp4`, buf)
  console.log(`render.mp4 ${(buf.length / 1048576).toFixed(1)}MB`)
  process.exit(0)
})()
