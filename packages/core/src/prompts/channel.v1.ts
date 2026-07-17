// channel.v1 — channel-bible derivation template.
// Given a name + niche description + languages, the model designs the channel's
// creative profile (tone, visual style DNA, world bible). Voices are NOT derived.
// Versioned source code. Never edit after a channel ships on this version — bump to v2.

import { z } from 'zod'
import { ToneConfigSchema, WorldBibleSchema, PLATFORM_PRESETS, type TargetPlatform } from '../types/channel.js'
import { STYLE_VALUES, STORY_STYLES } from './story-styles.v1.js'
import { VOICE_VALUES } from './story-voices.v1.js'

export const CHANNEL_V1_VERSION = 'channel.v1.4'

// The full derived profile returned by the LLM. Narrator voices are NOT derived
// — the operator picks real ElevenLabs voices in the UI. We derive an audioMood
// (the brief for the channel's signature background bed); the actual track is
// generated/selected in the Sound step. LUT files still reference assets we lack.
export const ChannelDerivationSchema = z.object({
  tagline: z.string(), // one-line positioning
  toneConfig: ToneConfigSchema,
  targetSeconds: z.number().int().min(15).max(600), // natural video length for this niche (clamped to the platform cap at create)
  stylePreset: z.string(), // ~80–100 word visual style DNA for image prompts
  captionPreset: z.enum(['clean', 'pop', 'hype', 'karaoke', 'neon', 'whisper', 'impact', 'elegant', 'comic', 'terminal', 'cinematic', 'breaking', 'marker', 'script', 'retro', 'glitch']), // animated caption style
  captionHighlight: z.string(), // accent hex (box fill / karaoke fill / glow / active word)
  captionTextColor: z.string(), // base word color (near-white unless the niche calls for a tint)
  captionPosition: z.enum(['bottom', 'center', 'top']), // on-screen placement
  captionFontScale: z.number().min(0.85).max(1.25), // size multiplier on the preset's base
  worldBible: WorldBibleSchema,
  genreCategory: z.enum(['horror', 'informational', 'lifestyle', 'drama', 'commentary', 'reddit_story', 'comedy', 'general']), // genre bucket → picks the writer identity + scene-prompt genre module
  // PROSE dimensions (story-styles / story-voices) — a SUGGESTED default the operator can override.
  // Optional: `general` has no styles, and the create route re-validates the style against the genre.
  narrativeStyle: z.enum(STYLE_VALUES).optional(), // storytelling tradition within the genre ('' = pure genre)
  narrativeVoice: z.enum(VOICE_VALUES).optional(), // the narrator's written sound (NOT the TTS voice)
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
  targetPlatform: TargetPlatform
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

  const p = PLATFORM_PRESETS[v.targetPlatform] ?? PLATFORM_PRESETS.all
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
TARGET PLATFORM: ${p.label} — length: ${p.lengthHint} (HARD MAX ${p.maxSeconds}s); captions: ${p.captionHint}. Tailor targetSeconds and the caption choice to this platform as well as the niche.

Produce JSON with exactly these fields:

{
  "tagline": "one vivid sentence positioning the channel",
  "toneConfig": {
    "intensity": 0-10, "warmth": 0-10, "energy": 0-10, "pacing": 0-10, "humor": 0-10
  },  // genre-neutral; score honestly for THIS niche: intensity=light→heavy/serious, warmth=clinical→inviting, energy=calm→hyped, pacing=slow-burn→rapid, humor=straight→comedic
  "targetSeconds": 15-600,  // the natural length of ONE video — but MUST be within the TARGET PLATFORM's cap above. Quick informational/listicle niches run short (~20-40s); atmospheric or story-driven niches run longer; a long-form platform wants minutes, not seconds. Pick what the format wants, then clamp to the platform's sweet spot/max — do not exceed the platform HARD MAX.
  "stylePreset": "60–90 words of comma-separated VISUAL style descriptors for an image model — LOOK ONLY: film stock/medium, color palette, texture/grain, mood, composition tendencies (e.g. negative space, framing), depth-of-field, and lighting QUALITY (contrast/softness), plus a region/era aesthetic. This string is prepended to EVERY scene, so it must describe HOW shots look, never WHAT is in them. Two hard rules: (1) Do NOT bake in a time of day or light level (no 'night', 'daylight', 'low-light', 'moonlight', 'candlelight') — each scene sets its own lighting from the narration. (2) Do NOT name any specific OBJECT, PROP, set-piece, or light source ('cracked walls', 'a wooden door', 'a candle', 'capiz window', 'a lamp') and do NOT focus on a specific subject ('shallow focus on the door') — those are per-SCENE content, decided from the narration + world bible. If baked into the style they force themselves into every frame and flatten variety. Style DNA only — no objects, no characters, no story content, no time of day.",
  "captionPreset": "the animated on-screen caption style — pick the ONE that best matches this niche's energy + audience (these are competitive TikTok/Reels/Shorts styles, not plain subtitles). Choose intentionally; don't default to pop:
     - clean: refined white, gentle fade — calm, educational, explainer
     - pop: punchy word-by-word scale pop, bold uppercase — general, lifestyle, vlog, food, travel
     - hype: Hormozi/MrBeast highlight-box on each word, heavy uppercase — business, money, motivation, self-improvement, hustle
     - karaoke: words fill with accent color as spoken — music, lyrics, poetry, spoken-word
     - neon: glowing word pop — gaming, tech, anime, nightlife, hype edits
     - whisper: eerie typewriter reveal, serif — horror, mystery, true-crime, creepypasta, paranormal
     - impact: huge punch-in headline with a shake — sports, drama, debate, reaction, hot-takes
     - elegant: small wide-tracked italic fade — luxury, fashion, beauty, skincare, ASMR, aesthetic
     - comic: playful tilted word-pop — comedy, memes, reactions, funny pets, kids, skits
     - terminal: green monospace typewriter on a dark panel — tech, coding, programming, crypto, hacking, cybersecurity
     - cinematic: Netflix-style subtitle on a translucent bar — film analysis, video essays, storytelling, documentary, history
     - breaking: bold solid lower-third news bar — news, current events, sports updates, celebrity/gossip, finance headlines
     - marker: highlighter swipe under spoken words — study tips, how-to, productivity, language-learning, 'save this' listicles
     - script: flowing handwritten cursive — faith, inspirational quotes, wellness, relationships, journaling, soft aesthetic
     - retro: chrome/synthwave gradient with glow — retro gaming, 80s/90s, synthwave, vaporwave, music, nostalgia
     - glitch: RGB-split datamosh on the spoken word — gaming montages, cyber, AI/tech-edits, hype transitions",
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
    "canonLocations": ["ONLY places that recur across many episodes and must stay visually identical; else []"],
    "canonObjects": ["ONLY signature objects that recur across many episodes and must stay identical; else []"],
    "vocabulary": { "term": "how this channel refers to it, in the narration language (2–5 entries)" }
  },
  "genreCategory": "the channel's GENRE bucket — drives both which WRITER identity tells its stories and how scenes are composed and lit. Pick the ONE that fits what this channel's videos ARE:
     - horror: horror, thriller, paranormal, true-crime, creepypasta, mystery, scary/eerie storytelling — built for dread, shadow, near-black night
     - informational: news, explainers, education, tutorials, history, science, finance, tech, documentary, reviews — clear, sharp, neutrally-lit subjects
     - lifestyle: food/cooking, travel, vlogs, fashion, beauty, fitness, product, DIY — bright, inviting, aspirational
     - drama: emotional/relationship narrative, hugot, heartbreak, family stories, romance — stories built to move the viewer
     - commentary: opinion, hot takes, rants, reactions, motivation/self-improvement/stoicism — argument- or conviction-driven monologue, a clear stance with basis
     - reddit_story: reddit-style first-person confession/AITA/TIFU storytime — must read as a REAL post by a real person
     - comedy: punchline-driven, skits, absurd/funny storytelling — setup, expectation, subversion
     - general: anything that doesn't clearly fit the above (faith, general storytelling) — neutral composition, no genre-specific rules",
  "narrativeStyle": "the storytelling TRADITION this channel works in — pick ONE valid for the genreCategory you chose (a suggested default the creator can change); OMIT for 'general' or if none fits. Valid styles per genre:\n${styleMenu}",
  "narrativeVoice": "how the NARRATOR sounds in the prose (NOT the audio/TTS voice) — pick the ONE that fits this channel best from: ${voiceMenu}",
  "voiceSearchKeyword": "1–2 word genre/topic tag for finding fitting narrator voices, e.g. 'horror', 'true crime', 'motivation', 'meditation'",
  "audioMood": {
    "prompt": "a text-to-music brief for the channel's SIGNATURE BACKGROUND BED that plays under narration — describe instruments/texture, tempo, and feel; it must be INSTRUMENTAL, loopable, sparse, and non-distracting (no vocals, no strong melody hooks, no heavy percussion that fights speech). Tie it to THIS niche + tone, e.g. horror → 'slow, dread-soaked low drone, distant, sub-bass, sparse, no melody'; finance → 'minimal confident lo-fi beat, soft keys, steady, understated'; wellness → 'warm ambient pads, gentle, airy, calming'",
    "type": "low_drone | drone_swell | riser_sting — the arc of the bed: 'low_drone' = flat sustained ambience (calm, atmospheric, most niches); 'drone_swell' = builds toward a mid/late swell (story-driven, escalating); 'riser_sting' = rises to a hit at the climax (dramatic reveals, hype). Pick from the niche's energy + structure.",
    "moodTags": ["2–4 short mood tags, e.g. 'dread','slow','sparse' or 'uplifting','warm','steady'"]
  },
  "clarifyingQuestions": [  // 0–3 questions, ONLY for dimensions the creator's description leaves genuinely open — the lane/subject ("facts about WHAT?"), the audience, the region/era, the format. A detailed description gets [] (common and correct). Each: a plain, friendly question; 2–4 comma-separated example answers; and a short declarative prefix the answer will be appended under so it reads as clean channel DNA (question "Which corner of life do your stories live in?" → prefix "Stories live in:"). Never ask what the text already answers; never ask more than genuinely helps.
    { "question": "", "examples": "", "prefix": "" }
  ]
}

Output JSON only. No prose, no code fences.`

  return { system, userMessage }
}
