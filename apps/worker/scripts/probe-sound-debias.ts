// Sound-design DE-BIAS probe — the FREE leading-indicator gate from the Sound Director's Evidence-Before-
// Taste plan (no audio rendering; just the sound-design LLM call, ~pennies each). Tests whether the horror
// overfit in sound-designer.v1 can be de-biased WITHOUT weakening horror.
//
// The diagnosis: the horror-flavored few-shot JSON example is copied near-verbatim onto calm stories
// (dread moods, heartbeat loop, sub-bass boom, province_night ambience), and the prompt's "universal" rules
// frame restraint/silence/stillness as failure. Root cause is the PROMPT + EXAMPLE, not the stories.
//
// ARMS (same narration + same scenes in both — the delta is purely the prompt):
//   A = production buildSoundDesignerPrompt (control).
//   B = A with three surgical changes: (1) the JSON example neutralized (no dread/heartbeat/boom/
//       province_night/placeholder literals), (2) a REGISTER-FIRST + restraint-licensing override appended
//       (silence/stillness/spare layers are valid for calm registers; the intense-from-frame-one / climax-
//       non-negotiable rules describe a TENSE register only), (3) the story's mode passed as context.
//   B is SUBTRACTIVE + judgment-shaped (removes conclusions, adds reasoning) — NOT another wall of mandates
//   (mandates are what produced the overfit). Per the Anti-Prescription Guard.
//
// Usage: pnpm --filter worker exec tsx scripts/probe-sound-debias.ts   (cwd apps/worker). Cost ~$0.10–0.30.
import '../src/env.js'
import { z } from 'zod'
import type { DesignerScene } from '../src/prompts-bridge.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildSoundDesignerPrompt, SOUND_DESIGNER_V1_VERSION, SoundDesignSchema } = await import('../src/prompts-bridge.js')

  // ── Test corpus: 2 CALM registers (should shed horror artifacts under B) + 1 HORROR (regression guard:
  // B must NOT weaken it). Scenes are hand-authored with register-APPROPRIATE moods and held identical
  // across A/B, so a horror design on a calm-mooded story can only come from the prompt/example. ──────────
  interface Story { id: string; register: 'calm' | 'horror'; genre: string | undefined; mode: string; narration: string; scenes: DesignerScene[] }
  const S = (idx: number, mood: string[], location: string, narrationText: string, isHero = false): DesignerScene => ({ idx, isHero, mood, location, narrationText })

  const STORIES: Story[] = [
    {
      id: 'tacoma-doc', register: 'calm', genre: undefined /* EBN routes to 'general' → default context, the real case */, mode: 'evidence-based documentary',
      narration: `On November 7, 1940, the Tacoma Narrows Bridge in Washington State came apart in a wind of only about forty miles an hour. For months it had rippled and rolled — locals called it Galloping Gertie. That morning the deck began to twist, one edge rising as the other fell, and the twisting would not settle. It fed on itself. For years the collapse was explained as simple resonance — the wind pushing the bridge at its natural rhythm. Engineers now know that account is wrong. The real cause was aeroelastic flutter: the deck's own motion drew energy from a steady wind and pumped it back into an ever-growing twist. Remarkably, when the debris settled, no one had died. The bridge that failed taught engineers to listen to the wind.`,
      scenes: [
        S(1, ['measured', 'reflective'], 'the narrows, daytime', 'On November 7, 1940, the Tacoma Narrows Bridge'),
        S(2, ['calm', 'observational'], 'the bridge deck', 'For months it had rippled and rolled'),
        S(3, ['clarifying'], 'the twisting deck', 'That morning the deck began to twist'),
        S(4, ['explanatory'], 'diagram of forces', 'For years the collapse was explained as simple resonance', true),
        S(5, ['resolved', 'calm'], 'the calm water after', 'Remarkably, when the debris settled'),
      ],
    },
    {
      id: 'tide-explainer', register: 'calm', genre: 'informational', mode: 'explainer',
      narration: `Twice a day the sea climbs the shore and falls back again. The moon is the reason. Its gravity tugs the ocean toward it, raising a bulge of water on the side of the Earth that faces it — and, strangely, a second bulge on the far side. As the Earth turns beneath these bulges, every coast passes through two highs and two lows. The sun pulls too, more gently; when sun and moon line up, the tides run to their widest. It is the quietest, most reliable machine on the planet.`,
      scenes: [
        S(1, ['gentle', 'curious'], 'a calm shore', 'Twice a day the sea climbs the shore'),
        S(2, ['wonder'], 'the moon over the sea', 'The moon is the reason'),
        S(3, ['clarifying'], 'diagram of the bulges', 'raising a bulge of water', true),
        S(4, ['calm', 'satisfied'], 'the tide at its widest', 'when sun and moon line up'),
      ],
    },
    {
      id: 'horror-mirror', register: 'horror', genre: 'horror', mode: 'horror',
      narration: `Every night the mirror in the hall showed my reflection a half-second late. I told myself it was tiredness. Then one night I raised my hand — and it waited, watching me, before it raised its own. I backed away. It did not. It stayed at the glass, smiling with my face, and slowly lifted one finger to its lips.`,
      scenes: [
        S(1, ['uneasy', 'tense'], 'a dark hall', 'Every night the mirror in the hall'),
        S(2, ['dread'], 'the mirror at night', 'Then one night I raised my hand', true),
        S(3, ['terror'], 'the reflection smiling', 'It stayed at the glass, smiling with my face', true),
      ],
    },
  ]

  // ── B transform: surgical de-bias of the production prompt ──────────────────────────────────────────
  const NEUTRAL_EXAMPLE = `{
  "ambient": { "packTags": ["<the real ambience of THIS place, or [] if the register wants quiet>"], "evolution": null },
  "music": null,  // null is valid (a calm piece may take no music). If the register DOES want music, use the object shape and ALWAYS include "type": { "type": "low_drone" | "drone_swell" | "riser_sting", "startAnchor": "<opening line>", "peakAnchor": "<the turn line>", "moodTags": ["<moods true to THIS story>"] } — a still/low bed for a calm register, a moving build for a tense one
  "sfx": [
    { "anchor": "<a concrete action or place in the narration>", "offsetMs": 0, "prompt": "<the plain, non-vocal sound that action/place actually makes>", "volumeDb": -8, "targetDurationSec": 2, "impactAtEnd": false }
  ],
  "voices": [],
  "silenceDrop": null
}`
  const REGISTER_OVERRIDE = `

REGISTER FIRST — READ BEFORE DESIGNING (this supersedes any rule above that conflicts with it):
Begin by naming, in one sentence, THIS story's register (e.g. measured/documentary, warm, playful, tense/horror) and what sonic treatment would be WRONG for it. Then design to that register.
The rules above about tension "from the very first second", a landing climax being "non-negotiable", and silence being a "failure" describe a TENSE register (horror and the like). For a MEASURED, CALM, or FACTUAL register they are WRONG. In a calm register the following are CORRECT, not failures: a quiet or near-silent opening; a still bed, a sparse bed, or NO music at all; few cues; an unhurried peak that lands on a FACT or a realization rather than a boom or a scare; and empty layers. Never impose intensity, dread, a heartbeat/boom/whoosh, or a jumpscare climax on a story whose register does not call for it. The example is illustrative ONLY — never copy its literal values (moods, prompts, packTags); derive everything from THIS story's world and register.
STORY MODE: {{MODE}}. Let the mode set the register: a documentary/evidence-based/explainer piece is measured and credible; its power is clarity and the weight of what is true, not startle.`

  const buildB = (story: Story): { system: string; userMessage: string } => {
    const a = buildSoundDesignerPrompt(story.narration, story.scenes, story.genre)
    const system = a.system + REGISTER_OVERRIDE.replace('{{MODE}}', story.mode)
    // Swap the example: keep everything up to "OUTPUT JSON only:", then a neutral example + a restraint-
    // licensing closing line (fields optional; a spare/empty design is legitimate for a calm register).
    const head = a.userMessage.split('OUTPUT JSON only:')[0]
    const userMessage = `${head}OUTPUT JSON only (the example is a SHAPE guide — never copy its literal values):\n${NEUTRAL_EXAMPLE}\nUse exactly these keys. EVERY field is optional: use null for music/silenceDrop and [] for sfx/voices whenever the story's register doesn't call for them. A calm piece may legitimately have a spare or near-empty design — that is a valid answer, not an under-filled one.`
    return { system, userMessage }
  }

  // ── Register-alien artifact scorer (for CALM stories: these should be ~0 under B; on HORROR they're
  // EXPECTED and we instead check intensity is retained). ──────────────────────────────────────────────
  // Tuned to the ACTUAL copied-artifact + true-horror signatures — NOT broad words like "rumble"/"impact"/
  // "ringing" that catch register-appropriate cues (escalating metallic groans on a collapsing bridge are
  // fine documentary sound, not a horror artifact). Targets: the heartbeat device, the copied sub-bass boom,
  // and genuine horror hits.
  const HORROR_SFX = /(heartbeat|jumpscare|screech|stinger|\bslam\b|sub-?bass|deep heavy boom|rumbling whoosh)/i
  const HORROR_MOOD = /(dread|terror|fear|ominous|menac|sinister|eerie|unsettl|foreboding|panic)/i
  interface Score { moodHits: string[]; sfxHits: string[]; provinceNight: boolean; boomClimax: boolean; copiedPlaceholder: boolean; cueCount: number; hasMusic: boolean; total: number }
  const score = (d: z.infer<typeof SoundDesignSchema>): Score => {
    const moodHits = (d.music?.moodTags ?? []).filter((m) => HORROR_MOOD.test(m))
    const sfxHits = (d.sfx ?? []).map((s) => s.prompt).filter((p) => HORROR_SFX.test(p))
    const provinceNight = (d.ambient?.packTags ?? []).some((t) => /province_night/i.test(t))
    const boomClimax = (d.sfx ?? []).some((s) => s.impactAtEnd && HORROR_SFX.test(s.prompt))
    const copiedPlaceholder = (d.sfx ?? []).some((s) => /the later line where it releases|a realism moment|where the stretch tightens|the exact turn\/reveal line/i.test(s.anchor))
    const total = moodHits.length + sfxHits.length + (provinceNight ? 1 : 0) + (copiedPlaceholder ? 1 : 0)
    return { moodHits, sfxHits, provinceNight, boomClimax, copiedPlaceholder, cueCount: (d.sfx ?? []).length, hasMusic: !!d.music, total }
  }

  // Resilient: the OpenAI sound-design call occasionally emits schema-invalid JSON (extra fields on the
  // music cue) that survives neither parse nor the one in-client repair — a transient flake, not a de-bias
  // issue. Retry once, then tolerate a failed arm (return null) so one flake can't discard the whole run.
  const design = async (label: string, system: string, userMessage: string): Promise<{ data: z.infer<typeof SoundDesignSchema>; cost: number } | null> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await llmCall({ templateVersion: `sound-debias.${label}-probe`, schema: SoundDesignSchema, system, messages: [{ role: 'user', content: userMessage }], maxTokens: 8192 })
        return { data: r.data, cost: r.costCents }
      } catch (err) {
        if (attempt === 3) { console.log(`  ! ${label} design failed after 3 tries: ${String(err).slice(0, 320)}`); return null }
      }
    }
    return null
  }

  let totalCost = 0
  console.log(`⚗ sound de-bias probe · ${STORIES.length} stories × A/B · free JSON gate (no audio render)\n`)
  const summary: { id: string; register: string; aTotal: number; bTotal: number }[] = []

  for (const story of STORIES) {
    const a = buildSoundDesignerPrompt(story.narration, story.scenes, story.genre)
    const b = buildB(story)
    const [ra, rb] = await Promise.all([design('A', a.system, a.userMessage), design('B', b.system, b.userMessage)])
    totalCost += (ra?.cost ?? 0) + (rb?.cost ?? 0)
    console.log(`${'─'.repeat(78)}\n[${story.id}] register=${story.register} genre=${story.genre ?? '(general→default)'} mode=${story.mode}`)
    if (!ra || !rb) { console.log(`  (skipped scoring — an arm failed: A=${ra ? 'ok' : 'FAIL'} B=${rb ? 'ok' : 'FAIL'})`); continue }
    const sa = score(ra.data)
    const sb = score(rb.data)
    summary.push({ id: story.id, register: story.register, aTotal: sa.total, bTotal: sb.total })

    const show = (arm: string, d: z.infer<typeof SoundDesignSchema>, s: Score) => {
      console.log(`  [${arm}] music=${d.music ? `${d.music.type} moods=[${d.music.moodTags.join(',')}]` : 'null'} · ambient=[${(d.ambient?.packTags ?? []).join(',')}] · ${s.cueCount} sfx · silenceDrop=${d.silenceDrop ? 'yes' : 'no'}`)
      for (const cue of d.sfx ?? []) console.log(`       sfx: "${cue.prompt}"${cue.impactAtEnd ? ' [impactAtEnd]' : ''}`)
      const flags = [s.moodHits.length ? `horror-moods=[${s.moodHits.join(',')}]` : '', s.sfxHits.length ? `horror-sfx=${s.sfxHits.length}` : '', s.provinceNight ? 'province_night' : '', s.copiedPlaceholder ? 'COPIED-PLACEHOLDER' : ''].filter(Boolean)
      console.log(`       → register-alien artifacts: ${s.total}${flags.length ? ` (${flags.join(', ')})` : ''}`)
    }
    console.log(`  ── BEFORE (A · production prompt) ──`); show('A', ra.data, sa)
    console.log(`  ── AFTER (B · de-biased) ──`); show('B', rb.data, sb)
  }

  // ── Pre-registered leading-indicator read ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}\nLEADING-INDICATOR RESULT (free JSON gate — artifacts only; the ear-A/B is the real bar):`)
  const calm = summary.filter((s) => s.register === 'calm')
  const horror = summary.filter((s) => s.register === 'horror')
  const calmImproved = calm.every((s) => s.bTotal < s.aTotal || (s.aTotal === 0 && s.bTotal === 0))
  const calmClean = calm.every((s) => s.bTotal === 0)
  for (const s of summary) console.log(`  ${s.id} [${s.register}]: A artifacts=${s.aTotal} → B artifacts=${s.bTotal}`)
  console.log(`\n  CALM: B reduces artifacts vs A on all: ${calmImproved ? 'YES' : 'NO'}; B fully clean (0): ${calmClean ? 'YES' : 'NO'}`)
  console.log(`  HORROR (regression guard): inspect above that B keeps a bed + a landing climax (artifacts are EXPECTED + correct here).`)
  console.log(`\n  Gate verdict: ${calmImproved ? (calmClean ? 'PASS — proceed to the paid blind ear-A/B' : 'PARTIAL — iterate the prompt to zero calm artifacts, then re-run this free gate') : 'FAIL — de-bias not moving the artifacts; rethink the treatment'}`)
  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
