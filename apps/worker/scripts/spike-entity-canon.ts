// Recurring-entity canon spike (2026-08-07) — W2's gate in the compile-creator-intent plan.
//
// THE ONE UNPROVEN BET, and everything in W2 sits on it: today a recurring entity (a creature, a mascot,
// a recurring host, a fictional org) is re-described by the analyzer and RE-PLATED on every reel, so it
// looks different every episode. W2 proposes minting the plate ONCE per channel and reusing it forever.
// That is only worth building if a single plate actually carries the entity's identity across episodes
// whose scenes the plate never showed.
//
// This is the SAME bar hypotheses/real-places.md set for places, and it retires the workstream if missed:
//   (a) BLIND IDENTIFICATION — someone who has seen the plate identifies the entity in each scene as the
//       same one, unprompted.
//   (b) MULTI-SHOT PERSISTENCE — identity holds across ≥3 shots that demand framings, distances and
//       lighting the plate does not show. This is the graduation condition.
//
// The founder's eye is the verdict. The vision check below is a cheap pre-screen, NOT the bar — a model
// that is told two images might match is a generous judge, so it can only ever fail the spike early, not
// pass it. Every image is written to disk for a real look.
//
// DELIBERATELY REPLICATES PRODUCTION rather than approximating it: assembleReferencePrompt for the plate,
// FLUX_IMAGE_ENGINE because horror routes its `role: 'threat'` entity there (generate-images.ts:234),
// assembleImagePrompt for the scenes, and generateImageFal with referenceImageKeys so the scenes go
// through the real multi-reference EDIT endpoint. If the spike passed on a shortcut it would prove nothing.
//
// Usage (cwd apps/worker):  pnpm exec tsx scripts/spike-entity-canon.ts
//   SPIKE_ENTITY=mascot     → run the non-horror control instead (a recurring host, Gemini engine)
// Cost: ~$0.25 per entity (1 plate + 4 scenes on Flux at ~4¢, or Gemini). No DB writes.
import '../src/env.js'
import { z } from 'zod'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

void (async () => {
  const { generateImageFal, FLUX_IMAGE_ENGINE, GEMINI_IMAGE_ENGINE, downloadBuffer, llmCall } = await import('@reels/providers')
  const { assembleReferencePrompt, assembleImagePrompt, assembleNegativePrompt } = await import('@reels/core')

  // Namespaced per case: the two cases wrote the same filenames and the second run clobbered the
  // first's images on disk, which is exactly the evidence the founder needs to look at.
  const OUT = join(process.cwd(), 'spike-entity-canon', process.env['SPIKE_ENTITY'] ?? 'creature')
  mkdirSync(OUT, { recursive: true })
  // Not a real reel — a namespaced scratch prefix so the spike's R2 objects are obvious and sweepable.
  const spikeId = 'spike-entity-canon-0001'
  let cost = 0

  // Two cases on purpose. The creature is the motivating one; the mascot is the GENERALITY control —
  // if canon only holds for a photoreal monster on Flux, the abstraction is folklore-shaped and the plan's
  // whole "recurring entities, not canon creatures" framing is wrong.
  const CASES = {
    creature: {
      engine: FLUX_IMAGE_ENGINE,
      style:
        'cinematic film grain, muted tropical palette, deep shadow, documentary composition, shallow depth of field, high contrast lighting, Philippine rural aesthetic',
      entity: {
        id: 'aswang',
        kind: 'character' as const,
        role: 'threat' as const,
        description:
          'a gaunt winged figure with elongated limbs, matted black hair over a hollow face, greyed skin stretched tight over bone, long clawed fingers, eyes reflecting light like an animal',
      },
      cast: 'Filipino',
      // Four scenes the plate cannot show: different distance, framing, occlusion and light source.
      scenes: [
        'perched on a corrugated tin roof at night, seen from the yard below, silhouetted against a bruised sky',
        'extreme close-up of its face pressed against a rain-streaked window from outside, lit only by a lamp inside',
        'a distant figure crossing a flooded rice paddy at dusk, small in frame, reflected in the water',
        'crouched in a doorway of an abandoned wooden house, half in shadow, lit by a single bare bulb',
      ],
    },
    mascot: {
      engine: GEMINI_IMAGE_ENGINE,
      style:
        'clean editorial illustration, warm flat colour, soft even lighting, generous negative space, modern explainer aesthetic',
      entity: {
        id: 'ledger-fox',
        kind: 'character' as const,
        role: undefined,
        description:
          'a tidy anthropomorphic fox in a charcoal blazer over a white shirt, round tortoiseshell glasses, rust-orange fur with a cream chest, always holding a small notebook',
      },
      cast: '',
      scenes: [
        'standing at a whiteboard covered in hand-drawn charts, gesturing at a rising line',
        'close-up at a desk, reading the notebook under a desk lamp at night',
        'walking through a busy office lobby seen from behind and to the side',
        'seated small in a wide frame of an empty meeting room, morning light from tall windows',
      ],
    },
  }

  const pick = (process.env['SPIKE_ENTITY'] ?? 'creature') as keyof typeof CASES
  const C = CASES[pick]
  console.log(`\nSPIKE: ${pick} — "${C.entity.id}" on ${C.engine.family}\n${'═'.repeat(78)}`)

  // The engines disagree on container: Flux returns png, Gemini returns webp. Hardcoding one made the
  // vision pre-screen 400 on the other, which killed the mascot run after every image was already paid for.
  const sniff = (b: Buffer): 'image/png' | 'image/webp' | 'image/jpeg' =>
    b.subarray(0, 4).toString('hex') === '89504e47' ? 'image/png'
    : b.subarray(8, 12).toString('ascii') === 'WEBP' ? 'image/webp'
    : 'image/jpeg'

  const save = async (key: string, file: string) => {
    const buf = await downloadBuffer(key)
    const ext = sniff(buf).split('/')[1]
    const path = join(OUT, `${file}.${ext}`)
    writeFileSync(path, buf)
    return path
  }

  // ── 1. Mint the plate ONCE — exactly as production mints a reference plate ────────────────────────
  const platePrompt = assembleReferencePrompt(C.entity as never, C.style, undefined, C.cast || undefined)
  console.log(`PLATE PROMPT: ${platePrompt}\n`)
  const plateKey = `reels/${spikeId}/refs/${C.entity.id}.webp`
  const plate = await generateImageFal({
    prompt: platePrompt,
    negativePrompt: assembleNegativePrompt({ genreCategory: pick === 'creature' ? 'horror' : 'general' }),
    reelId: spikeId,
    storageKey: plateKey,
    aspect: '9:16',
    engine: C.engine,
  })
  cost += plate.costCents
  const plateFile = await save(plate.asset.storageKey, '00-plate')
  console.log(`plate → ${plateFile}  (${plate.costCents}¢)`)

  // ── 2. Render scenes CONDITIONED on that one plate — the real edit endpoint ──────────────────────
  const shots: { idx: number; prompt: string; file: string; key: string }[] = []
  for (const [i, sceneText] of C.scenes.entries()) {
    // Production's scene form: (contentPrompt, stylePreset). No bible expansion here — the entity's
    // identity is meant to arrive through the PLATE, which is exactly what the spike is testing.
    const prompt = assembleImagePrompt(`${C.entity.description}, ${sceneText}`, C.style)
    const res = await generateImageFal({
      prompt,
      negativePrompt: assembleNegativePrompt({ genreCategory: pick === 'creature' ? 'horror' : 'general' }),
      reelId: spikeId,
      sceneIdx: i,
      aspect: '9:16',
      engine: C.engine,
      referenceImageKeys: [plate.asset.storageKey], // ← the whole point: ONE plate, many episodes
    })
    cost += res.costCents
    const f = await save(res.asset.storageKey, `0${i + 1}-scene`)
    shots.push({ idx: i + 1, prompt: sceneText, file: f, key: res.asset.storageKey })
    console.log(`scene ${i + 1} → ${f}  (${res.costCents}¢)  ${sceneText.slice(0, 64)}…`)
  }

  // ── 3. Cheap pre-screen (NOT the bar) ────────────────────────────────────────────────────────────
  // Deliberately framed to make a MISMATCH easy to report: the judge is told these may be different
  // entities and is asked to look for identity-breaking differences, so a lenient model still fails loud.
  const VerdictSchema = z.object({
    sameEntity: z.boolean(),
    confidence: z.number().min(0).max(1),
    differences: z.array(z.string()),
  })
  const plateBuf = await downloadBuffer(plate.asset.storageKey)
  console.log(`\n${'─'.repeat(78)}\nPRE-SCREEN (advisory — the founder's eye is the verdict)`)
  let same = 0
  for (const s of shots) {
    const sceneBuf = await downloadBuffer(s.key)
    const r = await llmCall({
      templateVersion: 'entity-canon-spike.v0',
      schema: VerdictSchema,
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      system: `You compare two images and decide whether they depict THE SAME specific individual — not merely the same kind of thing. Two different foxes in blazers are NOT the same character; two different winged figures are NOT the same creature. Look for identity-breaking differences: face structure, markings, colouring, clothing, proportions, distinguishing features. Assume they may well be different and say so when they are.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: sniff(plateBuf), base64: plateBuf.toString('base64') },
            { type: 'image', mediaType: sniff(sceneBuf), base64: sceneBuf.toString('base64') },
            { type: 'text', text: `Image 1 is a reference portrait. Image 2 is a later scene. Same specific individual?\n\nOUTPUT (JSON only): { "sameEntity": bool, "confidence": 0-1, "differences": ["identity-breaking differences, [] if none"] }` },
          ],
        },
      ],
      maxTokens: 400,
    })
    cost += r.costCents
    if (r.data.sameEntity) same++
    console.log(`  scene ${s.idx}: ${r.data.sameEntity ? 'SAME' : 'DIFFERENT'} (${r.data.confidence.toFixed(2)})${r.data.differences.length ? ` — ${r.data.differences.join('; ')}` : ''}`)
  }

  console.log(`\n${'═'.repeat(78)}`)
  console.log(`PRE-SCREEN: ${same}/${shots.length} read as the same individual.`)
  console.log(`GRADUATION BAR (founder, on the files in ${OUT}):`)
  console.log(`  (a) blind identification — is it recognisably the SAME one in every shot?`)
  console.log(`  (b) multi-shot persistence — does identity hold at the distances/framings the plate never showed?`)
  console.log(`  Miss ⇒ W2 retires; cross-reel consistency is a different problem.`)
  console.log(`TOTAL COST: ${cost.toFixed(2)}¢`)
  process.exit(0)
})()
