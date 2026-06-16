import { config } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
const rootEnv = resolve(process.cwd(), '../../.env.local')
if (existsSync(rootEnv)) config({ path: rootEnv })

import { getDb } from './client.js'
import { channels } from './schema.js'

// Aswang Files seed — from docs/04 §7 (world bible) + docs/07 §4 (music pack).
// Run: pnpm db:seed

const ASWANG_FILES_CHANNEL = {
  name: 'Aswang Files',
  nicheDescription:
    'Filipino horror narration channel. First-person confessional encounters with supernatural entities (aswang, multo, kapre, manananggal) set in rural Philippine provinces. Tagalog-first with natural Taglish code-switching. Slow-burn dread, sensory detail, twist endings.',
  languages: ['tagalog', 'taglish'],
  toneConfig: {
    suspense: 8,
    dread: 9,
    pacing: 6,
    gore: 2,
    humor: 0,
  },
  // 100-word style DNA — appended server-side to every image prompt; LLM never sees this
  stylePreset:
    'grainy 35mm film still, dim sodium-vapor and kerosene lighting, 1990s Philippine province, muted teal-and-amber palette, shallow depth of field, humid atmospheric haze, unsettling stillness, vertical cinematic 9:16 framing, deep shadows, film grain texture, slightly underexposed, analog photography aesthetic',
  worldBible: {
    region: 'inland Quezon province (fictionalized barangays)',
    era: '1996–2003, pre-smartphone',
    canonLocations: [
      "Brgy. San Isidro chapel",
      "the dike road",
      "Aling Nena's kubo",
      "the talahib field past the dike",
    ],
    canonObjects: [
      'gasera lamp',
      'tricycle with one headlight',
      'radyo na de-baterya',
      'banga ng tubig sa may pintuan',
    ],
    vocabulary: {
      house: "kubo or bahay na bato (never 'mansion')",
      spirit: "'yung hindi nakikita",
      road: 'dike road or daang-bukid',
      night: 'gabi (never just say "dark")',
    },
  },
  lutConfig: {
    lutPath: null,     // to be added: a teal-amber LUT file
    grain: 0.18,
    vignette: 0.3,
  },
  voicePool: [
    {
      id: 'mara',
      providerId: '',    // fill in ElevenLabs voice ID after Phase 0 bake-off
      name: 'Mara',
      gender: 'f',
      style: 'soft, hesitant, fearful recall',
      languages: ['tagalog', 'taglish'],
    },
    {
      id: 'lito',
      providerId: '',
      name: 'Lito',
      gender: 'm',
      style: 'older, provincial storyteller, measured pace',
      languages: ['tagalog'],
    },
    {
      id: 'bea',
      providerId: '',
      name: 'Bea',
      gender: 'f',
      style: 'young, urban Taglish, contemporary',
      languages: ['taglish', 'english'],
    },
  ],
  // Audio packs (docs/07 §4): ambient beds + music pack with peakFrac tags
  audioPacks: {
    ambientPacks: {
      province_night: ['crickets_loop_a', 'dog_distant', 'rain_tin_roof'],
      province_day:   ['birds_morning', 'kalabaw_distant', 'wind_talahib'],
      indoor_night:   ['clock_ticking', 'house_settling', 'rain_on_roof'],
    },
    musicPack: [
      {
        id: 'drone_low_a',
        path: 'audio/music/drone_low_a.m4a',
        type: 'low_drone',
        peakFrac: 0,          // flat drone — no inherent build; gain envelope handles it
        moodTags: ['dread', 'slow', 'ambient'],
      },
      {
        id: 'riser_b',
        path: 'audio/music/riser_b.m4a',
        type: 'riser_sting',
        peakFrac: 0.85,       // natural peak at 85% of track duration
        moodTags: ['climax', 'chase', 'reveal'],
      },
      {
        id: 'swell_c',
        path: 'audio/music/swell_c.m4a',
        type: 'drone_swell',
        peakFrac: 0.7,
        moodTags: ['reveal', 'grief', 'melancholy'],
      },
    ],
  },
  postingRules: {
    platforms: ['fb', 'yt'],
    scheduleUtcHour: 13,  // 9 PM PHT
    qualityThreshold: 0,   // no auto-filter in Phase 1
  },
}

async function main() {
  const db = getDb()

  console.log('Seeding Aswang Files channel...')

  const [channel] = await db
    .insert(channels)
    .values({
      name: ASWANG_FILES_CHANNEL.name,
      nicheDescription: ASWANG_FILES_CHANNEL.nicheDescription,
      languages: ASWANG_FILES_CHANNEL.languages,
      toneConfig: ASWANG_FILES_CHANNEL.toneConfig,
      stylePreset: ASWANG_FILES_CHANNEL.stylePreset,
      worldBible: ASWANG_FILES_CHANNEL.worldBible,
      lutConfig: ASWANG_FILES_CHANNEL.lutConfig,
      voicePool: ASWANG_FILES_CHANNEL.voicePool,
      audioPacks: ASWANG_FILES_CHANNEL.audioPacks,
      postingRules: ASWANG_FILES_CHANNEL.postingRules,
    })
    .onConflictDoNothing()
    .returning()

  if (channel) {
    console.log(`✓ Channel created: ${channel.name} (${channel.id})`)
  } else {
    console.log('Channel already exists, skipping.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
