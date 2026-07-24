// Persist the founder-approved Phase B beds as the AUDIO REFERENCE LIBRARY — the regression suite ("what
// 'correct' sounds like" per register). Uploads the winning NEW-* beds from the ear A/B to stable R2 keys.
// System/QA fixtures (platform-owned, not tenant data), so they live under a global references/ namespace,
// not a reel/channel one. Manifest: specs/audio-references.md.
// Usage: pnpm --filter worker exec tsx scripts/upload-audio-references.ts   (cwd apps/worker). Free (no gen).
import '../src/env.js'
void (async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const { uploadBuffer } = await import('@reels/providers')
  const SRC = `${process.env.HOME}/Desktop/phase-b-sound`

  // register → (source clip, Phase B mood used, one-line "what it demonstrates")
  const REFS: { register: string; src: string; mood: string; demonstrates: string }[] = [
    { register: 'documentary', src: 'NEW-documentary', mood: 'measured (low_drone)', demonstrates: 'calm/measured but PRESENT — dignified, unhurried, never tense' },
    { register: 'drama', src: 'NEW-drama-warm', mood: 'warm (drone_swell)', demonstrates: 'tender, intimate, human — gentle breathing swell' },
    { register: 'childrens', src: 'NEW-childrens', mood: 'wondrous (drone_swell)', demonstrates: 'warm wonder, gentle magic — safe, never dark' },
    { register: 'energetic', src: 'NEW-energetic-howto', mood: 'driving (drone_swell)', demonstrates: 'genuine forward momentum/energy — the "leans calm" cure' },
    { register: 'horror', src: 'NEW-horror', mood: 'slow_dread (low_drone)', demonstrates: 'tense/dark preserved — the regression guard' },
  ]

  let ok = 0
  for (const r of REFS) {
    const path = `${SRC}/${r.src}.m4a`
    if (!existsSync(path)) { console.log(`  ! missing ${path} — skip ${r.register}`); continue }
    const key = `references/audio/${r.register}.m4a`
    await uploadBuffer(key, readFileSync(path), 'audio/mp4')
    console.log(`  ✓ ${key}   [${r.mood}]`)
    ok++
  }
  console.log(`\nuploaded ${ok}/${REFS.length} references to R2 under references/audio/. Manifest → specs/audio-references.md`)
  process.exit(0)
})()
