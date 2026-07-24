// Phase B cross-register JSON gate (FREE — no audio render; ~6 sound-design LLM calls, pennies each).
// Verifies the register-first-by-DEFAULT designer (sound-designer.v1.19) across the register space, BEFORE
// any paid ear A/B. Pre-registered success criteria (the founder's "leans calm" + range steer):
//   • CALM / WARM / ENERGETIC registers stay PRESENT (music non-null — the headline fix: calm ≠ silent)
//     and shed dark/dread moods + forced boom-climaxes.
//   • HORROR stays tense (dark moods + a landing climax) — regression guard.
//   • Across registers the moods are NOT all-dark (de-monoculture).
// Usage: pnpm --filter worker exec tsx scripts/probe-register-range.ts   (cwd apps/worker). ~$0.10–0.20.
import '../src/env.js'
import { z } from 'zod'
import type { DesignerScene } from '../src/prompts-bridge.js'
void (async () => {
  const { llmCall } = await import('@reels/providers')
  const { buildSoundDesignerPrompt, SoundDesignSchema } = await import('../src/prompts-bridge.js')

  type Family = 'calm' | 'warm' | 'energetic' | 'horror'
  interface Story { id: string; family: Family; genre: string | undefined; narration: string; scenes: DesignerScene[] }
  const S = (idx: number, mood: string[], location: string, narrationText: string, isHero = false): DesignerScene => ({ idx, isHero, mood, location, narrationText })

  const STORIES: Story[] = [
    {
      id: 'documentary', family: 'calm', genre: 'informational',
      narration: `On November 7, 1940, the Tacoma Narrows Bridge came apart in a wind of only about forty miles an hour. For months it had rippled and rolled — locals called it Galloping Gertie. That morning the deck began to twist, one edge rising as the other fell. For years it was explained as simple resonance; engineers now know the real cause was aeroelastic flutter, the deck's own motion feeding on a steady wind. When the debris settled, no one had died. The bridge that failed taught engineers to listen to the wind.`,
      scenes: [
        S(1, ['measured', 'reflective'], 'the narrows, daytime', 'On November 7, 1940, the Tacoma Narrows Bridge'),
        S(2, ['clarifying'], 'diagram of forces', 'For years it was explained as simple resonance', true),
        S(3, ['resolved', 'calm'], 'the calm water after', 'When the debris settled'),
      ],
    },
    {
      id: 'drama-warm', family: 'warm', genre: 'lifestyle',
      narration: `My grandmother kept every letter my grandfather ever sent her, tied in a ribbon gone soft with handling. After he passed, she read one each night at the kitchen table. She never cried. She would just smile, fold it back along its old creases, and say, "He always did know how to make me wait for the good part."`,
      scenes: [
        S(1, ['tender', 'intimate'], 'a quiet kitchen', 'My grandmother kept every letter'),
        S(2, ['warm', 'bittersweet'], 'the ribbon of letters', 'After he passed, she read one each night', true),
        S(3, ['gentle', 'loving'], 'her smile', 'He always did know how to make me wait'),
      ],
    },
    {
      id: 'childrens', family: 'warm', genre: 'general',
      narration: `Pip the firefly was afraid of the dark — which is a tricky thing to be, when you are the one who makes the light. Every evening the other fireflies rose into the warm night, blinking like tiny stars, and every evening Pip stayed low in the grass. Then one night a lost little rabbit began to cry, and Pip forgot to be afraid. He lifted into the dark, glowing brighter than he ever had, and led the rabbit all the way home.`,
      scenes: [
        S(1, ['gentle', 'wondrous'], 'a meadow at dusk', 'Pip the firefly was afraid of the dark'),
        S(2, ['warm', 'hopeful'], 'fireflies rising', 'Every evening the other fireflies rose'),
        S(3, ['uplifting', 'joyful'], 'Pip glowing bright', 'He lifted into the dark, glowing brighter', true),
      ],
    },
    {
      id: 'comedy', family: 'warm', genre: 'general',
      narration: `I decided to assemble the furniture myself, because how hard could it be. Three hours later I was sitting inside what the instructions swore was a bookshelf, holding a single mysterious screw and a diagram of a smiling cartoon man who had clearly never met this bookshelf. The screw, I am now certain, was a test. I did not pass. But the cat loves the box.`,
      scenes: [
        S(1, ['light', 'playful'], 'a living room, boxes everywhere', 'I decided to assemble the furniture myself'),
        S(2, ['comic', 'exasperated'], 'a half-built shelf', 'holding a single mysterious screw', true),
        S(3, ['warm', 'wry'], 'the cat in the box', 'But the cat loves the box'),
      ],
    },
    {
      id: 'energetic-howto', family: 'energetic', genre: 'general',
      narration: `You want to run your first 5K in eight weeks? Here's the whole plan. Week one: run one minute, walk two, repeat eight times — three days this week, no more. Every week you flip the ratio: more running, less walking. Don't chase speed, chase consistency — the fast comes free once the habit is built. By week eight you are running the whole thing without stopping. Lace up. The clock starts now.`,
      scenes: [
        S(1, ['energetic', 'motivating'], 'a runner at the start', 'You want to run your first 5K'),
        S(2, ['driving', 'building'], 'training montage', 'Every week you flip the ratio', true),
        S(3, ['triumphant'], 'crossing the finish', 'By week eight you are running the whole thing'),
      ],
    },
    {
      id: 'horror', family: 'horror', genre: 'horror',
      narration: `Every night the mirror in the hall showed my reflection a half-second late. I told myself it was tiredness. Then one night I raised my hand — and it waited, watching me, before it raised its own. I backed away. It did not. It stayed at the glass, smiling with my face, and slowly lifted one finger to its lips.`,
      scenes: [
        S(1, ['uneasy', 'tense'], 'a dark hall', 'Every night the mirror in the hall'),
        S(2, ['dread'], 'the mirror at night', 'Then one night I raised my hand', true),
        S(3, ['terror'], 'the reflection smiling', 'It stayed at the glass, smiling with my face', true),
      ],
    },
  ]

  const DARK_MOOD = /(dread|terror|fear|ominous|menac|sinister|eerie|unsettl|foreboding|panic|horror|scare)/i
  const DARK_SFX = /(heartbeat|jumpscare|screech|stinger|\bslam\b|sub-?bass|deep heavy boom|rumbling whoosh)/i
  const BRIGHT_MOOD = /(warm|tender|gentle|hopeful|uplifting|playful|whimsical|wondrous|awe|joy|light|calm|measured|reflective|driv|energetic|momentum|upbeat|propuls|bright|lively|triumph|motivat)/i

  // Retry-resilient (OpenAI occasionally emits schema-invalid JSON — a transient flake, not a design issue).
  const design = async (id: string, system: string, userMessage: string): Promise<{ data: z.infer<typeof SoundDesignSchema>; cost: number } | null> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await llmCall({ templateVersion: `register-range.${id}`, schema: SoundDesignSchema, system, messages: [{ role: 'user', content: userMessage }], maxTokens: 8192 })
        return { data: r.data, cost: r.costCents }
      } catch (err) {
        if (attempt === 3) { console.log(`  ! ${id} design failed after 3 tries: ${String(err).slice(0, 200)}`); return null }
      }
    }
    return null
  }

  let totalCost = 0
  const rows: { id: string; family: Family; present: boolean; darkMoods: string[]; brightMoods: string[]; boomClimax: boolean; hasClimax: boolean; pass: boolean; notes: string[] }[] = []
  console.log(`⚗ register-range gate · ${STORIES.length} registers · register-first default (v1.19) · free JSON (no audio)\n`)

  for (const story of STORIES) {
    const { system, userMessage } = buildSoundDesignerPrompt(story.narration, story.scenes, story.genre)
    const r = await design(story.id, system, userMessage)
    totalCost += r?.cost ?? 0
    if (!r) { rows.push({ id: story.id, family: story.family, present: false, darkMoods: [], brightMoods: [], boomClimax: false, hasClimax: false, pass: false, notes: ['LLM arm failed'] }); continue }
    const d = r.data
    const moods = d.music?.moodTags ?? []
    const present = !!d.music
    const darkMoods = moods.filter((m) => DARK_MOOD.test(m))
    const brightMoods = moods.filter((m) => BRIGHT_MOOD.test(m))
    const boomClimax = (d.sfx ?? []).some((s) => s.impactAtEnd && DARK_SFX.test(s.prompt))
    const hasClimax = (d.sfx ?? []).some((s) => s.impactAtEnd)

    // Per-family expectations.
    const notes: string[] = []
    let pass = true
    if (story.family === 'horror') {
      if (!present) { pass = false; notes.push('horror lost its bed') }
      if (darkMoods.length === 0) { pass = false; notes.push('horror lost its dark moods') }
      if (!hasClimax) { pass = false; notes.push('horror lost its climax') }
    } else {
      // calm / warm / energetic — the founder's range: PRESENT, not dark, no forced boom.
      if (!present) { pass = false; notes.push('bed absent (calm ≠ silent — the headline fix)') }
      if (darkMoods.length) { pass = false; notes.push(`dark moods leaked: [${darkMoods.join(',')}]`) }
      if (boomClimax) { pass = false; notes.push('forced boom/jumpscare climax on a non-tense register') }
      if (present && brightMoods.length === 0) notes.push('warn: no clearly register-appropriate mood word (inspect)')
    }
    rows.push({ id: story.id, family: story.family, present, darkMoods, brightMoods, boomClimax, hasClimax, pass, notes })

    console.log(`${'─'.repeat(78)}\n[${story.id}] family=${story.family} genre=${story.genre ?? '(general)'}  ${pass ? '✓ PASS' : '✗ FAIL'}`)
    console.log(`  music=${d.music ? `${d.music.type} moods=[${moods.join(',')}]` : 'NULL'} · ambient=[${(d.ambient?.packTags ?? []).join(',')}] · ${(d.sfx ?? []).length} sfx · silenceDrop=${d.silenceDrop ? 'yes' : 'no'}`)
    for (const cue of d.sfx ?? []) console.log(`     sfx: "${cue.prompt}"${cue.impactAtEnd ? ' [impactAtEnd]' : ''}`)
    if (notes.length) console.log(`  → ${notes.join(' · ')}`)
  }

  // Cross-register de-monoculture: the non-horror registers must NOT all be dark.
  const nonHorror = rows.filter((r) => r.family !== 'horror')
  const brightVariety = new Set(nonHorror.flatMap((r) => r.brightMoods.map((m) => m.toLowerCase())))
  const anyDarkLeak = nonHorror.some((r) => r.darkMoods.length > 0)
  const allPresent = nonHorror.every((r) => r.present)

  console.log(`\n${'═'.repeat(78)}\nPRE-REGISTERED VERDICT (free JSON gate — the paid ear-A/B is the real bar):`)
  for (const r of rows) console.log(`  ${r.pass ? '✓' : '✗'} ${r.id} [${r.family}] present=${r.present} dark=[${r.darkMoods.join(',') || '—'}] ${r.notes.length ? `· ${r.notes.join('; ')}` : ''}`)
  const allPass = rows.every((r) => r.pass)
  console.log(`\n  Calm/warm/energetic all PRESENT (calm ≠ silent): ${allPresent ? 'YES' : 'NO'}`)
  console.log(`  No dark-mood leak into non-tense registers: ${!anyDarkLeak ? 'YES' : 'NO'}`)
  console.log(`  Mood de-monoculture (distinct bright moods across registers): ${brightVariety.size} → [${[...brightVariety].join(', ')}]`)
  console.log(`  Horror preserved (bed + dark moods + climax): ${rows.find((r) => r.family === 'horror')?.pass ? 'YES' : 'NO'}`)
  console.log(`\n  GATE: ${allPass && brightVariety.size >= 3 ? 'PASS — proceed to the paid cross-register ear-A/B' : 'ITERATE — see FAIL rows above, then re-run this free gate'}`)
  console.log(`\ntotal cost: ${totalCost}¢ ($${(totalCost / 100).toFixed(2)})`)
  process.exit(0)
})()
