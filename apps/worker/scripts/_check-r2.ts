import '../src/env.js'
void (async () => {
  const { downloadBuffer } = await import('@reels/providers')
  const R = '38f08fcf-51e5-468a-9a58-5364872abfc5'
  for (const k of [
    `reels/${R}/scenes/1/video_v0.mp4`, `reels/${R}/scenes/2/video_v0.mp4`, `reels/${R}/scenes/3/video_v0.mp4`,
    `reels/${R}/sfx/foley-s1-500-1947ef1ee8.mp3`,
  ]) {
    try { const b = await downloadBuffer(k); console.log(`OK   ${(b.length/1024/1024).toFixed(2)}MB  ${k}`) }
    catch (e) { console.log(`GONE ${k}  ${e instanceof Error ? e.message.slice(0,60) : ''}`) }
  }
  process.exit(0)
})()
