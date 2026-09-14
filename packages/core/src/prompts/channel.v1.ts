// channel.v1 — channel-bible derivation template.
// Given a name + niche description + languages, the model designs the channel's
// creative profile (tone, visual style DNA, world bible). Voices are NOT derived.
// Versioned source code. Never edit after a channel ships on this version — bump to v2.

import { z } from 'zod'
import { ToneConfigSchema, WorldBibleSchema, resolvePlatformPreset, MAX_TARGET_SECONDS, type TargetPlatform } from '../types/channel.js'
import { SourcePolicySchema } from '../types/source-policy.js'
import { STYLE_VALUES, STORY_STYLES } from './story-styles.v1.js'
import { GenreCategorySchema } from '../types/genre.js'
import { VOICE_VALUES } from './story-voices.v1.js'

export const CHANNEL_V1_VERSION = 'channel.v1.9'

// The full derived profile returned by the LLM. Narrator voices are NOT derived
// — the operator picks real ElevenLabs voices in the UI. We derive an audioMood
// (the brief for the channel's signature background bed); the actual track is
// generated/selected in the Sound step. LUT files still reference assets we lack.
export const ChannelDerivationSchema = z.object({
  tagline: z.string(), // one-line positioning
  toneConfig: ToneConfigSchema,
  targetSeconds: z.number().int().min(15).max(MAX_TARGET_SECONDS), // natural video length for this niche (clamped to the platform cap at create)
  stylePreset: z.string(), // ~80–100 word visual style DNA for image prompts
  captionPreset: z.enum(['sable', 'pulse', 'marquee', 'lyric', 'signal', 'halo', 'slate', 'kick', 'seance', 'notebook', 'still', 'chrome', 'volt', 'static', 'plate', 'field', 'voyage', 'paws', 'candid', 'dance']), // animated caption style
  captionHighlight: z.string(), // accent hex (box fill / karaoke fill / glow / active word)
  captionTextColor: z.string(), // base word color (near-white unless the niche calls for a tint)
  captionPosition: z.enum(['bottom', 'center', 'top']), // on-screen placement
  captionFontScale: z.number().min(0.85).max(1.25), // size multiplier on the preset's base
  worldBible: WorldBibleSchema,
  // EDITORIAL PRINCIPLES — the channel's own bar, COMPILED from rules the creator actually wrote
  // ("no cheap jump scares", "always cite sources", "never explain the ending"). Appended to the gate's
  // rubric, never replacing it: these are the channel's rules ON TOP of the genre craft bar. '' is
  // common and correct — most descriptions state no rule, and inventing one would silently police
  // every future script against a standard the creator never set. See buildChannelDerivationPrompt.
  editorialPrinciples: z.string().default(''),
  // SOURCE POLICY — what this channel's stories may treat as REAL. Only ever set from what the creator's
  // description actually implies; when it is silent the wizard ASKS (see clarifyingQuestions.fills),
  // because guessing is unsafe in BOTH directions: invent where the channel is about real documented
  // things, or name real people where the creator wanted pure fiction. Narrative permission only —
  // depiction stays governed by the non-overridable depictive-ethics floor at every setting.
  sourcePolicy: SourcePolicySchema.optional(),
  // EDITORIAL PROGRAM — the channel's recurring SERIES (specs/channel-series.md), compiled from the
  // content pillars creators already write into their idea. Each carries the named subjects the creator
  // listed, which become the scheduler's seed queue instead of the Planner inventing every topic.
  // `[]` is common and correct: an anthology ("a different scary story each night") genuinely has no
  // recurring categories, and inventing some would fabricate an editorial structure the creator never
  // chose. genreCategory is OMITTED unless the series genuinely differs from the channel's — see below.
  series: z
    .array(
      z.object({
        name: z.string(),
        genreCategory: GenreCategorySchema.optional(),
        sourcePolicy: SourcePolicySchema.optional(),
        exampleTopics: z.array(z.string()).default([]),
      }),
    )
    .max(8)
    .default([]),
  genreCategory: GenreCategorySchema, // creator's actual genre; known modules are optional defaults
  // PRESENTATION identity — how the audience receives the narration (a bias the analyzer reasons from,
  // not a command). '' = no lean (let each story decide); 'voiceover' = a narrator who never appears on
  // screen (news/documentary/explainer); 'hosted' = an on-screen teller. See voiceover-perspective.md.
  presentation: z.enum(['', 'voiceover', 'hosted']).default(''),
  // PROSE dimensions (story-styles / story-voices) — a SUGGESTED default the operator can override.
  // Optional: `general` has no styles, and the create route re-validates the style against the genre.
  // '' is accepted as well as omission. The prompt says to OMIT these when nothing fits (which happens
  // for every 'general'-genre channel — it has no styles at all), but models routinely answer the
  // documented "'' = pure genre" wording literally and send an empty string. A bare `.optional()`
  // rejected that, and because the repair attempt reproduced it the whole derivation 502'd the wizard.
  // Mirrors how the channel PATCH route has always modelled these two fields.
  narrativeStyle: z.union([z.literal(''), z.enum(STYLE_VALUES)]).optional(), // storytelling tradition within the genre ('' = pure genre)
  narrativeVoice: z.union([z.literal(''), z.enum(VOICE_VALUES)]).optional(), // the narrator's written sound (NOT the TTS voice)
  voiceSearchKeyword: z.string(), // 1–2 word genre/topic tag for matching narrator voices
  audioMood: z.object({
    prompt: z.string(), // text-to-music brief for the channel's signature background bed
    type: z.enum(['low_drone', 'drone_swell', 'riser_sting']), // shape the mixer aligns to the reel's peak
    moodTags: z.array(z.string()), // 2–4 short mood tags (preset matching + track selection)
  }),
  // Follow-up questions for dimensions the description leaves genuinely OPEN (lane/subject, audience,
  // region/era, format) — the wizard asks the CREATOR after deriving; their answers are appended to the
  // niche text (via `prefix`) and a re-derive absorbs them. Empty is common and correct: a detailed
  // description gets no questions. Never ask about dimensions the text already answers.
  clarifyingQuestions: z
    .array(
      z.object({
        question: z.string(), // plain and friendly, ONE missing dimension each
        examples: z.string(), // 2–4 short example answers, comma-separated ("family, office, weddings")
        prefix: z.string(), // declarative lead-in the answer is appended under ("Stories live in:")
        // WHICH SLOT the answer fills. Absent/'niche' = the historical behaviour: append the answer to
        // the pitch as prose and re-derive. A named slot means the answer is written into that STRUCTURED
        // field directly — round-tripping a structured answer back through prose and hoping the next
        // derivation re-extracts it is exactly the lossiness this whole dimension set exists to remove.
        fills: z.enum(['niche', 'sourcePolicy']).default('niche'),
        // For a slot-filling question: the choices, each carrying the value it writes. Empty for 'niche'.
        options: z
          .array(z.object({ label: z.string(), sourcePolicy: SourcePolicySchema.optional() }))
          .max(4)
          .default([]),
      }),
    )
    .max(3)
    .default([]),
})
export type ChannelDerivation = z.infer<typeof ChannelDerivationSchema>

export interface ChannelDerivationVars {
  name: string
  nicheDescription: string
  languages: string[]
  // Every platform the channel publishes to. Collapsed to the one spec that satisfies all of them
  // (resolvePlatformPreset), so the bible is tailored to the real ceiling rather than to one feed.
  targetPlatforms: TargetPlatform[]
}

export function buildChannelDerivationPrompt(v: ChannelDerivationVars): {
  system: string
  userMessage: string
} {
  const system = `You are a show-runner who designs the creative bible for video channels — from short vertical reels to long-form uploads.
Given a channel name, a niche description, and target languages, you produce a coherent, production-ready bible that a writing + image-generation pipeline can use to make consistent videos.

Principles:
- Be specific and opinionated. Vague bibles produce generic videos. Invent concrete, evocative detail that fits the niche.
- Stay internally consistent: tone, visual style, and world should feel like one channel.
- Fictionalize specifics so nothing maps to a real person or exact real place; a real region/era is fine.`

  const p = resolvePlatformPreset(v.targetPlatforms)
  // Valid styles per genre + the voice menu, generated from the catalogs so this never drifts.
  const styleMenu = Object.entries(STORY_STYLES)
    .map(([genre, byId]) => {
      const ids = Object.keys(byId)
      return `     - ${genre}: ${ids.length ? ids.join(', ') : '(none — use general/no style)'}`
    })
    .join('\n')
  const voiceMenu = VOICE_VALUES.join(', ')
  const userMessage = `Design the creative bible for this channel.

CHANNEL NAME: ${v.name}
NICHE: ${v.nicheDescription}
LANGUAGES: ${v.languages.join(', ')}
TARGET PLATFORMS: ${p.label} — length: ${p.lengthHint} (HARD MAX ${p.maxSeconds}s); captions: ${p.captionHint}. Tailor targetSeconds and the caption choice to this platform as well as the niche.

Produce JSON with exactly these fields:

{
  "tagline": "one vivid sentence positioning the channel",
  "toneConfig": {
    "intensity": 0-10, "warmth": 0-10, "energy": 0-10, "pacing": 0-10, "humor": 0-10
  },  // genre-neutral; score honestly for THIS niche: intensity=light→heavy/serious, warmth=clinical→inviting, energy=calm→hyped, pacing=slow-burn→rapid, humor=straight→comedic
  "targetSeconds": 15-${MAX_TARGET_SECONDS},  // the natural length of ONE video — but MUST be within the TARGET PLATFORMS' cap above. Quick informational/listicle niches run short (~20-40s); atmospheric or story-driven niches run longer; a long-form platform wants minutes, not seconds. Pick what the format wants, then clamp to the platform's sweet spot/max — do not exceed the HARD MAX.
  "stylePreset": "60–90 words of comma-separated VISUAL style descriptors for an image model — LOOK ONLY: film stock/medium, color palette, texture/grain, mood, composition tendencies (e.g. negative space, framing), depth-of-field, and lighting QUALITY (contrast/softness), plus a region/era aesthetic. This string is prepended to EVERY scene, so it must describe HOW shots look, never WHAT is in them. Two hard rules: (1) Do NOT bake in a time of day or light level (no 'night', 'daylight', 'low-light', 'moonlight', 'candlelight') — each scene sets its own lighting from the narration. (2) Do NOT name any specific OBJECT, PROP, set-piece, or light source ('cracked walls', 'a wooden door', 'a candle', 'capiz window', 'a lamp') and do NOT focus on a specific subject ('shallow focus on the door') — those are per-SCENE content, decided from the narration + world bible. If baked into the style they force themselves into every frame and flatten variety. Style DNA only — no objects, no characters, no story content, no time of day.",
  "captionPreset": "the animated on-screen caption style — pick the ONE that fits the niche and audience. Choose intentionally; do not default to the loudest option:
     - sable: calm editorial serif — storytelling, video essays, documentary
     - pulse: bold word pop — general, lifestyle, vlog
     - marquee: warm highlight pill — business, money, motivation
     - lyric: progressive word fill — music, lyrics, poetry
     - signal: mono typewriter chyron — tech, AI, crypto
     - halo: airy wide-tracked fade — beauty, fashion, luxury, ASMR
     - slate: modern lower-third — news, sports, updates
     - kick: playful bounce — comedy, memes, reactions
     - seance: cold dramatic serif — horror, mystery, true-crime
     - notebook: highlighter swipe — study tips, how-to, productivity
     - still: calm italic serif — wellness, faith, quotes, relationships
     - chrome: cool-to-warm gradient — retro, synthwave, nostalgia
     - volt: electric glowing pop — gaming, nightlife, hype
     - static: restrained RGB split — cyber, AI, edits
     - plate: friendly step treatment — food, recipes, cooking
     - field: forward-leaning energetic caps — sports, fitness, outdoors
     - voyage: clean travel headline — travel, places, adventure
     - paws: warm playful display — pets, kids, family
     - candid: clear calm workhorse — storytime, podcast, commentary
     - dance: bold beat-driven caps — dance, choreography, trends",
  "captionHighlight": "accent hex used for the box fill / karaoke fill / glow / active word — fit the channel's palette + mood and pop on dark video. Match the emotional tone: horror / true-crime / thriller / paranormal → deep blood red or crimson (e.g. #c01616, #e10600) — NOT cheerful yellow or green; money / hustle → gold (#FFD700); gaming / tech → electric cyan or lime; calm / luxury → soft gold or muted pastel. Avoid neon-yellow as a default — only use it when the niche is genuinely upbeat/playful.",
  "captionTextColor": "base (not-yet-spoken) word hex — almost always near-white (#ffffff / #f4f4f5) for legibility on any footage; only tint (warm cream, icy blue, bone) when the niche's mood genuinely calls for it",
  "captionPosition": "where captions sit: 'bottom' (safe default, most niches), 'center' (bold, cinematic, hook-driven, face-cam), or 'top' (when the key action/subject usually sits low in frame)",
  "captionFontScale": "size multiplier 0.85–1.25 on the preset's base size — go >1 for loud/high-energy/kids/hype niches, <1 for calm/elegant/text-dense niches; stay near 1.0 unless there's a clear reason",
  "worldBible": {
    // Write canonLocations, canonObjects, and vocabulary in the channel's PRIMARY narration language (the
    // first language listed above) — the everyday name a local would actually SAY, because the narrator
    // reuses these names verbatim in the script. For a Tagalog/Taglish channel that means natural Filipino
    // names ("lumang bahay na kahoy", "gasera", "kalsada sa barangay"), NOT English labels ("wooden
    // ancestral house", "gas lamp"). Keep each name short, concrete, and depictable. (region + era may stay
    // in plain English — they're metadata, not spoken in the narration.)
    "region": "a real-but-fictionalized region/setting",
    "era": "time period the channel lives in",
    // canonLocations/canonObjects are for things that RECUR across MANY episodes and must look identical every
    // time — e.g. a channel built around ONE haunted house, ONE shop, ONE recurring cursed object. They are
    // spliced into future reels, so a place/object that appears in only one story does NOT belong here.
    // CRITICAL: most channels — especially ANTHOLOGIES where each episode is a standalone story with its own
    // setting and cast (e.g. "first-person horror memories", "a different scary story each night") — have NO
    // genuine channel-wide recurring places or objects. For those, return EMPTY arrays ([]). Do NOT pad to a
    // quota: never invent one-off places/props just to fill these lists — that only pollutes every future reel
    // with settings it never uses. Only list something here if you can name the multiple episodes it recurs in.
    "persistentEntities": [  // RECURRING entities — anything with a stable identity that appears across MANY episodes and must look identical every time: a creature, a mascot, a recurring host, a fictional organization, a deity, a place, an object. This is the ONLY field that can carry a recurring CHARACTER; a creature named here is minted once and reused for the life of the channel, which is what stops it looking different in every episode. Same anti-quota rule as below: most channels — especially ANTHOLOGIES — genuinely have NONE, and inventing one pollutes every future reel. Return [] unless you can name the episodes it recurs in. Each: { "name": short spoken name, "kind": "character" | "location" | "object", "description": a CANONICAL DEPICTABLE noun phrase — the physical facts an illustrator would need, written once and reused verbatim in every image prompt (a bare name is useless here) }
      { "name": "", "kind": "character", "description": "" }
    ],
    "canonLocations": ["LEGACY name-only list — prefer persistentEntities above. Only places that recur across many episodes; else []"],
    "canonObjects": ["LEGACY name-only list — prefer persistentEntities above. Only signature objects that recur across many episodes; else []"],
    "vocabulary": { "term": "how this channel refers to it, in the narration language (2–5 entries). NAMING only — this map is read by the NARRATION and has no visual effect, so a recurring creature/character belongs in persistentEntities above, never here." }
  },
  "editorialPrinciples": "the channel's OWN rules — ONLY the ones the creator actually stated. This text is appended to the editorial gate that judges every finished script, so it must be CHECKABLE against a script's words. Use a short ALL-CAPS heading, then '- ' lines. FORMAT EXAMPLE ONLY — it is from an unrelated product-review channel, so never reuse its wording or its subject matter; produce the rules THIS description states, however many that is:\\n\\nALWAYS\\n- Name the price and where it was bought.\\n- Say what the product is worse at than its rival.\\n\\nNEVER\\n- Recommend anything the narrator has not used.\\n- Close on a call to subscribe.\\n\nHard rules:\n     - ABSTAIN BY DEFAULT. Return an EMPTY STRING when the description states no rule of its own. Most do not, and empty is the correct, common answer — the gate then uses its built-in bar for the genre.\n     - NEVER INVENT a rule the creator did not write, and never restate a generic virtue of the genre. A rule you inferred from the subject matter is an invented rule. If you cannot point at the words that carry it, leave it out.\n     - Use ONLY the headings ALWAYS and NEVER — one, both, or neither. Never invent a topic heading ('NO JUMP SCARES', 'RESPECT CULTURE'): a heading is a bucket, not a rule, and every rule must live on its own '- ' line beneath one.\n     - THE CHECKABLE TEST, applied to every line before you keep it: could a reader point at the words in a finished script that BREAK this rule? 'No cheap jump scares', 'always cite sources', 'never explain the ending', 'end on hope' pass. 'Respect the culture', 'be thought-provoking', 'high quality', 'engaging', 'cinematic' fail — nobody can point at the words. If a rule you want to keep fails the test, either rewrite it as the concrete thing the creator said to do or not do, or drop it.\n     - Prohibitions the creator wrote ('avoid X', 'no Y', 'never Z') are the most valuable lines here. Keep their specificity; do not soften them into preferences.\n     - Keep it under ~10 lines. This is the channel's own bar, NOT a full craft rubric — the gate already has one.",
  "series": [  // 0–8 RECURRING CATEGORIES the description itself lays out — content pillars, segments, "types of videos I make". Return [] when the description names none, which is the common and correct answer for an ANTHOLOGY (a different standalone story every time). Never invent categories to fill this out: a fabricated editorial structure would silently drive what every future video is about.
    {
      "name": "the creator's own name for the category, kept close to their words ('Urban Legends', 'Case Studies')",
      "genreCategory": "OMIT unless this category genuinely differs from the channel's own genreCategory above. Omitting means 'no opinion — follow the channel', which keeps following it even if the channel's genre is later corrected. Only set it where the difference is real; preserve a specific or mixed genre when the creator names one.",
      "sourcePolicy": "OMIT unless the creator explicitly gives this series different factual permissions from the channel. Never infer permissions from its genre. When supplied, use the same sourcePolicy shape as the channel.",
      "exampleTopics": ["the specific subjects the creator LISTED under this category, copied close to their words ('The Yamashita Treasure', 'White Lady of Balete Drive'). These become real production topics, so copy only what they named — [] if they listed none."]
    }
  ],
  "sourcePolicy": {  // what this channel's stories may treat as REAL. OMIT THE WHOLE OBJECT unless the description makes it genuinely clear — a wrong guess is costly in both directions, and an omitted policy makes the wizard ASK instead (see clarifyingQuestions).
    "realPlaces": "true only if the channel is about REAL, NAMED places the viewer could visit or look up (haunted locations, historical sites, real cities). false for invented settings.",
    "realEvents": "true only if episodes cover real documented events (history, disasters, real cases). false for invented plots.",
    "realPeople": "'none' (default — everyone is fictionalized) | 'historical' (long-dead public figures may be named) | 'public_figures' (living public figures may be named and discussed, e.g. tech news, sports, business). Choose 'none' unless the subject matter plainly requires real people.",
    "evidenceRequired": "true if claims must be checkable against real sources (news, documentary, science, finance). false for fiction.",
    "invention": "'free' (fiction — invent everything) | 'constrained' (the SUBJECT is real, the telling is the writer's — folklore, history, real places) | 'none' (nothing may be invented; every specific comes from supplied sources)"
  },
  "genreCategory": "the genre or blend the creator actually asked for, in at most 120 characters. Preserve their named form and language; do not squeeze an unfamiliar form into a catalog. Use a familiar id only when it accurately describes the brief: horror, informational, lifestyle, drama, commentary, reddit_story, comedy, childrens, fairytale, general. These are suggestions, not the boundaries of storytelling. More specific or mixed labels are valid, e.g. cozy mystery, romantic science fiction, or nature poetry. Use general only when the creator's brief is genuinely broad. This label describes the creative intent; it does not decide factual permissions or dictate lighting.",
  "presentation": "how this channel's narration reaches the audience. 'voiceover' = a narrator who NEVER appears on screen — the voice explains/reports/argues over b-roll, concept, and data visuals (news, documentary, explainers, education, most commentary). 'hosted' = an on-screen teller/presenter is part of the format. '' = no lean — first-person lived storytelling (horror/drama/reddit confessions) or anything where each story should decide for itself. Pick 'voiceover' only when the FORMAT clearly has no on-screen narrator; when unsure, use ''.",
  "narrativeStyle": "the storytelling TRADITION this channel works in — pick ONE valid for a known genreCategory only when it fits (a suggested default the creator can change); OMIT for a custom genre or if none fits. Valid styles per genre:\n${styleMenu}",
  "narrativeVoice": "how the NARRATOR sounds in the prose (NOT the audio/TTS voice) — pick the ONE that fits this channel best from: ${voiceMenu}",
  "voiceSearchKeyword": "1–2 word genre/topic tag for finding fitting narrator voices, e.g. 'horror', 'true crime', 'motivation', 'meditation'",
  "audioMood": {
    "prompt": "a text-to-music brief for the channel's SIGNATURE BACKGROUND BED that plays under narration — describe instruments/texture, tempo, and feel; it must be INSTRUMENTAL, loopable, sparse, and non-distracting (no vocals, no strong melody hooks, no heavy percussion that fights speech). Tie it to THIS niche + tone, e.g. horror → 'slow, dread-soaked low drone, distant, sub-bass, sparse, no melody'; finance → 'minimal confident lo-fi beat, soft keys, steady, understated'; wellness → 'warm ambient pads, gentle, airy, calming'",
    "type": "low_drone | drone_swell | riser_sting — the arc of the bed: 'low_drone' = flat sustained ambience (calm, atmospheric, most niches); 'drone_swell' = builds toward a mid/late swell (story-driven, escalating); 'riser_sting' = rises to a hit at the climax (dramatic reveals, hype). Pick from the niche's energy + structure.",
    "moodTags": ["2–4 short mood tags, e.g. 'dread','slow','sparse' or 'uplifting','warm','steady'"]
  },
  "clarifyingQuestions": [  // 0–3 questions. IF AND ONLY IF you omitted "sourcePolicy" above because the description doesn't make it clear, the FIRST question here must be a typed one that settles it — set "fills":"sourcePolicy" and give 2-4 "options", each with a plain "label" and the full sourcePolicy object it would write (e.g. label "Real places and real history" → {realPlaces:true, realEvents:true, realPeople:"none", evidenceRequired:false, invention:"constrained"}; label "Completely invented stories" → {realPlaces:false, realEvents:false, realPeople:"none", evidenceRequired:false, invention:"free"}). For such a question "prefix" is unused — send "". This one matters more than any other gap: it decides whether the engine may name real places and real people, and guessing it wrong is unsafe in both directions. All OTHER questions keep "fills":"niche" with a prefix and no options, and cover only dimensions the description leaves genuinely open — the lane/subject ("facts about WHAT?"), the audience, the region/era, the format. A detailed description gets [] (common and correct). Each: a plain, friendly question; 2–4 comma-separated example answers; and a short declarative prefix the answer will be appended under so it reads as clean channel DNA (question "Which corner of life do your stories live in?" → prefix "Stories live in:"). Never ask what the text already answers; never ask more than genuinely helps.
    { "question": "", "examples": "", "prefix": "", "fills": "niche", "options": [] }
  ]
}

Output JSON only. No prose, no code fences.`

  return { system, userMessage }
}
