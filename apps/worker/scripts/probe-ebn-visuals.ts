// EBN visual-guardrail probe (2026-07-21, specs/evidence-based-narrative.md). Tests the biggest open
// EBN question: can the image pipeline produce documentary-ABSTRACT visuals that COMPLY with the
// guardrail ("never generate imagery that could be mistaken for authentic historical documentation /
// imply evidentiary authenticity"), and does the NAIVE documentary preset VIOLATE it?
//
// Two arms on the same true-crime case (fictional People v. Reyes):
//   NAIVE — the existing 'documentary' style preset on crime scene content (expected: photoreal images
//           that look like real crime-scene/evidence photos or real people = VIOLATION).
//   EBN   — illustrative modes from the guardrail's prefer-list (infographic, timeline, court-sketch,
//           editorial-symbolic, location illustration) (expected: clearly synthetic graphics = COMPLY).
// Generates each via gpt-image-1, saves locally so we can eyeball guardrail compliance.
//
// Usage: pnpm --filter worker exec tsx scripts/probe-ebn-visuals.ts <outDir>   (needs OPENAI + R2 creds)
import '../src/env.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
void (async () => {
  const { generateImage, downloadBuffer, assembleImagePrompt, assembleNegativePrompt, SCENE_IMAGE_QUALITY } = await import('@reels/providers')
  const { findStylePreset } = await import('@reels/core')

  const outDir = process.argv[2] || join(process.cwd(), 'scripts', 'ebn-visuals-out')
  mkdirSync(outDir, { recursive: true })

  const DOC = findStylePreset('documentary')!.stylePreset // "gritty documentary still, candid reportage…"
  // EBN illustrative style strings (candidate rendering-profile modes — NOT yet in the codebase; this
  // probe is designing them). Each leads hard with "illustration / graphic, not a photograph".
  const INFOGRAPHIC = 'flat editorial infographic illustration, clean vector graphic style, simple geometric shapes and labelled icons, muted professional palette, obviously a designed graphic and clearly NOT a photograph, no photorealism'
  const COURTSKETCH = 'loose courtroom sketch illustration, ink line work with soft watercolor wash, visible sketchy pencil strokes, muted tones, in the tradition of hand-drawn court reporting art, clearly an illustration and NOT a photograph'
  const EDITORIAL = 'clean editorial conceptual illustration, flat muted color palette, simple shapes, magazine-style vector artwork, obviously illustrated and clearly NOT a photograph'

  const shots: { id: string; arm: 'NAIVE' | 'EBN'; expect: string; style: string; content: string }[] = [
    // NAIVE — the documentary preset on true-crime scene content
    { id: 'naive-1-office', arm: 'NAIVE', expect: 'looks like a real crime-scene/office photo', style: DOC,
      content: 'The interior of a small community-cooperative finance office at night: a wooden desk, an old desktop computer, stacks of paper ledgers and loose documents, a single desk lamp casting hard light.' },
    { id: 'naive-2-person', arm: 'NAIVE', expect: 'photoreal real person in a fabricated scene', style: DOC,
      content: 'A middle-aged man in a buttoned office shirt sits alone at a desk late at night, counting a thick stack of peso banknotes, his face lit by a desk lamp.' },
    { id: 'naive-3-docs', arm: 'NAIVE', expect: 'looks like a real evidence photo', style: DOC,
      content: 'A bank statement, a checkbook, and printed financial audit documents spread across a desk, shot from directly overhead.' },
    // EBN — illustrative modes from the guardrail prefer-list
    { id: 'ebn-1-moneyflow', arm: 'EBN', expect: 'clearly a diagram, not evidence', style: INFOGRAPHIC,
      content: 'A diagram of embezzlement: money flowing from a central cooperative account outward through many small arrows into one hidden personal account marked with a warning icon; simple boxes and coin icons, no readable text.' },
    { id: 'ebn-2-timeline', arm: 'EBN', expect: 'clearly a timeline graphic', style: INFOGRAPHIC,
      content: 'A horizontal timeline graphic with four marked points along a line: a start flag, a long stretch, a magnifying-glass discovery marker, and a gavel at the end; flat vector style, muted palette, no readable text.' },
    { id: 'ebn-3-court', arm: 'EBN', expect: 'clearly a court illustration', style: COURTSKETCH,
      content: 'A courtroom: a judge seated high at the bench, a defendant standing below facing the judge, a sparse gallery behind; three-quarter view.' },
    { id: 'ebn-4-symbol', arm: 'EBN', expect: 'clearly a conceptual illustration', style: EDITORIAL,
      content: 'A symbolic still: a large open ledger book with a single page torn out, a small closed cash box beside it, on a plain neutral background.' },
    { id: 'ebn-5-building', arm: 'EBN', expect: 'clearly an architectural illustration, not a photo', style: EDITORIAL,
      content: 'The plain exterior of a modest two-storey community cooperative building on a quiet provincial street, daytime, simple flat architectural illustration.' },
  ]

  const neg = assembleNegativePrompt({})
  let totalCost = 0
  const results: { id: string; arm: string; expect: string; file: string; prompt: string }[] = []
  for (const [i, s] of shots.entries()) {
    const prompt = assembleImagePrompt(s.content, s.style)
    const key = `probe/ebn-visuals/${s.id}.webp`
    try {
      const r = await generateImage({ prompt, negativePrompt: neg, reelId: 'ebn-visuals', sceneIdx: i, storageKey: key, aspect: '9:16', quality: SCENE_IMAGE_QUALITY })
      totalCost += r.costCents ?? 0
      const file = join(outDir, `${s.id}.webp`)
      writeFileSync(file, await downloadBuffer(key))
      results.push({ id: s.id, arm: s.arm, expect: s.expect, file, prompt })
      console.log(`✓ ${s.id} [${s.arm}] → ${file}`)
    } catch (err) {
      console.log(`✗ ${s.id} FAILED: ${String(err).slice(0, 200)}`)
    }
  }
  console.log(`\n${'═'.repeat(70)}`)
  for (const r of results) console.log(`${r.arm.padEnd(5)} ${r.id}\n   expect: ${r.expect}\n   prompt: ${r.prompt}\n   file: ${r.file}\n`)
  console.log(`generated ${results.length}/${shots.length} · total cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
