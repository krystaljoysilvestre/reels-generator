// sound-designer.v1 — the unified, scene-aware sound designer. Replaced the old split of a blind SFX
// annotator + a frozen enrich→interpret pass (whose smart voices collided with it). ONE LLM pass reads
// the whole story AND the scene breakdown (which beats carry the weight, each scene's mood + location)
// and designs a cohesive, layered plan using JUDGMENT, not quotas: optional bed, optional score whose
// character it chooses, non-vocal SFX on meaning-bearing words, hits only where a moment earns one, and —
// only at a genuine story pivot — a non-narrator voice. Output composes into the existing mixer layers.

import { z } from 'zod'
import { AmbientSchema, MusicCueSchema, SfxCueSchema, SilenceDropSchema, EndingIntentSchema } from '../types/audio-script.js'

// Bump on any material prompt/craft change so annotate_audio_script re-plans instead of reusing a cached
// design. v1.1 = dense-realism + restraint rebalance. v1.2 = audibility fix (foreground detail must be
// clearly heard, not "faint/distant"; payoff = a full-bodied audible hit, not pure inaudible sub-bass).
// v1.3 = dynamic-range pass: per-cue durations (long builds/drones, not only 2-3s clips), loudness taught
// as psychology, silence as a tool, and genre-neutral "emotional climax" framing with context for every
// genre (not horror-only).
// v1.4 = payoff-must-LAND fix: v1.3's restraint/silence language let the model set up a silenceDrop and
// then place NO sound on the climax — a wind-up with no punch. The climax now MUST make an audible sound
// (usually a built-up impactAtEnd hit); silence only SETS UP the hit, it never replaces it.
// v1.5 = immersion pivot (owner direction 2026-07-06): tension present from the FIRST second (not a
// sparse open), SUSTAINED loopable textures spanning a stretch of story via endAnchor (heartbeat under a
// walk, corridor tone under a scene), and dense scene-reliving realism — every physical action the
// narration names gets its sound. Retires the "nine parts ordinary to one part horror" restraint framing.
// v1.6 = terrifying-climax pass (owner direction 2026-07-06): music movement chosen by story SHAPE (a
// static low_drone is the weakest choice for a story that builds — prefer swells/risers), horror climax
// is an explicit loud JUMPSCARE stinger at the top of the loudness range, and the reel must not sag
// after the hit — aftermath carries the final scene, and the last line can earn a closing sting.
// v1.7 = decisive pass (owner rejected the drone twice; soft nudges under-delivered): low_drone is now
// valid ONLY for a story that truly sits still — any story with a HERO/turn is a BUILD and takes
// drone_swell or riser_sting; plus a typical-density anchor (~8–14 cues) because "be generous" kept
// yielding 4-cue designs.
// v1.8 = same prompt as v1.7; bumped for the deterministic low_drone→drone_swell remap in
// annotate_audio_script (the LLM ignored "never low_drone" even in v1.7, so the step now enforces it).
// v1.9 = musical-storytelling pass (owner review 2026-07-06): universal mission (physically present /
// sound reconstructs the experience) with per-genre EXPERIENCE words instead of horror-only philosophy;
// stock device list replaced by a principle (recurring sonic ideas; repetition = familiarity, change =
// emotion) so outputs stop converging on reverse-swell/tape-hiss/ringing; CALLBACKS taught (introduce →
// develop → call back → resolve); genre-neutral opening ("establish the emotional world"), since
// "something is off" was horror leaking into every genre.
// v1.10 = de-harsh the jumpscare (owner feedback 2026-07-10: the climax rendered as a painful metallic
// "eeenk" screech AND didn't read as a scare). The payoff's power is WEIGHT (a deep, chest-hitting boom),
// never shrillness — harsh high-frequency screeches / metallic shrieks / violin scrapes are banned: they
// hurt on phone speakers and read as noise, not fear.
// v1.11 = intense-from-frame-one (owner 2026-07-10: "feels so silent at the beginning... want it intense
// right from the start, not a low drone building up"). The opening must be at FULL presence immediately —
// place a clearly-audible, CONTINUOUS tension texture (sustained endAnchor loop) on the very first line so
// dread is felt from second one, never ramped up to. (Paired with the mixer's fade-in cut 2s→0.25s.)
// v1.12 = same prompt as v1.11; bumped so annotate_audio_script re-runs and applies the deterministic
// HORROR opening-dread-bed injection (a guaranteed continuous tension texture from frame one to the
// climax — the LLM under-delivered on the "sustained opening texture" rule, so the step now enforces it).
// v1.13 = same prompt as v1.12; bumped so annotate_audio_script re-runs and applies the deterministic
// climax choreography (land the hit on the PAYOFF/last-hero scene, silence beat before it, sustained
// textures clamped to stop before that silence). The LLM anchored the reveal on a narration line that
// often fell in the wrong scene, so the scare fired over the wrong picture — now enforced in the step.
// v1.14 = same prompt as v1.13; bumped so annotate re-runs with the climax choreography now forcing the
// jumpscare to a SUDDEN top-of-range slam (impactAtEnd=false, no telegraphing build) — the LLM's built-up
// whoosh filled the pre-hit silence and softened the startle.
// v1.15 = sharper, PRESENT jumpscare (owner 2026-07-10: the deep sub-boom read as soft — a phone vibrate
// was scarier; the scare must CUT on a phone speaker, low-mid punch not sub-rumble) + mix rebalance (SFX
// bus +6→+2 so background sits under the voice, only the payoff hit exceeds it). Prompt text unchanged;
// bumped so annotate re-runs and re-applies the updated CLIMAX_HIT_PROMPT.
// v1.16 = bigger jumpscare (owner 2026-07-10: "longer, more bang, more terrifying, like horror movies") —
// climax is now a full cinematic horror STING: sharp crack + huge impact + a LONG dissonant reverberant
// tail (CLIMAX_HIT_DURATION_SEC 5→8). Bumped so annotate re-applies the updated CLIMAX_HIT_PROMPT.
// v1.17 = (a) drop harsh high-freq SUSTAINED textures (a looped "fluorescent hum" read as a painful
// metallic-cricket whine — owner 2026-07-10); sustained beds must be LOW/soft, not buzzy/shrill. (b) louder,
// more traumatic jumpscare (climax +6→+9, bone-rattling). Bumped so annotate re-applies both.
// v1.18 = shorten the climax prompt (the v1.17 traumatic prompt was 482 chars — over ElevenLabs' SFX ~450
// cap — and 400'd, failing the reel; provider now also caps defensively). Same intent, concise.
// v1.19 = register-first is now the DEFAULT (Phase B 2026-07-24), not the opt-in SOUND_DEBIAS patch: every
// design silently decides the story's register first, so the 18 revisions of horror tuning apply ONLY to a
// tense register. Presence-tilted: a calm register's default is a still, PRESENT bed (music: null is valid
// but rare/justified — the founder's "leans calm" was really "no register range"). Probe-validated shape
// (calm artifacts 3→0, horror preserved); the opt-in flag is removed.
// v1.20 = explicit ending direction. The designer chooses the final cadence anchor, the established layer
// that carries it, and its shape; timing/mixing own all numbers. This replaces renderer-invented genre tails.
export const SOUND_DESIGNER_V1_VERSION = 'sound-designer.v1.20'

// A non-narrator voice the designer chose to place. Rare + deliberate — resolved to a catalog voice and
// synthesized as a speech cue downstream. NOT for incidental human noise (that's banned entirely).
export const DesignerVoiceSchema = z.object({
  anchor: z.string().min(1),                       // exact, unique narration substring to place it on
  words: z.string().min(1),                        // the exact line the voice says
  speaker: z.string().default(''),                 // who, e.g. "the voice in the cubicle"
  delivery: z.string().default(''),                // how, e.g. "flat, mimicking, one beat behind"
  voiceSearchKeyword: z.string().default(''),      // catalog search term to find a fitting voice
  gender: z.enum(['male', 'female', 'any']).default('any'),
})
export type DesignerVoice = z.infer<typeof DesignerVoiceSchema>

// Superset of AudioScript (adds voices[]). The pipeline stores the AudioScript fields and routes voices[]
// into the smart speech-cue path.
export const SoundDesignSchema = z.object({
  ambient: AmbientSchema,
  music: MusicCueSchema.nullable().default(null),
  // Cap is a ceiling, not a target — dense realism wants room for many quiet cues (the 90% layer), so the
  // limit is generous. It never forces a count; the model places what the place genuinely has.
  sfx: z.array(SfxCueSchema).max(18),
  voices: z.array(DesignerVoiceSchema).max(2).default([]),
  silenceDrop: SilenceDropSchema.nullable().default(null),
  ending: EndingIntentSchema,
})
export type SoundDesign = z.infer<typeof SoundDesignSchema>

export interface DesignerScene {
  idx: number
  isHero: boolean
  mood: string[]
  location: string
  narrationText: string
}

// Genre enters as CONTEXT to reason from, never a prescribed texture (see .claude/skills/unbiased-design).
// Every genre gets a real paragraph — horror is no longer the only one with craft direction.
function genreContext(genre?: string): string {
  switch (genre) {
    case 'horror':
      return 'The experience here is UNSAFE: a believable world the viewer never feels safe inside. The ordinary reality stays convincing — a real school, a real bathroom at night — but from the first second there is a low undercurrent of dread that never fully lets go, mounting underneath everything until the scare. Not safe-then-scary; uneasy-then-terrifying.'
    case 'informational':
      return 'The experience here is CURIOSITY: a story that teaches or reveals. Sound serves comprehension and momentum — a grounded, credible world that keeps the viewer leaning in — and the emotional climax lands on the revelation, the fact or turn the whole reel was building toward.'
    case 'lifestyle':
      return 'The experience here is INTIMACY: a life, a place, a feeling the viewer steps into. Sound serves warmth and presence — the real texture of somewhere a viewer would want to be — and the emotional climax lands on the moment that turns: the warm beat, the release, the small human payoff.'
    default:
      return 'Read the story\'s own register from the narration and decide what EXPERIENCE its world should give the viewer — unease, curiosity, warmth, wonder, play. Find its emotional climax — the one moment everything else exists to set up — and let every other choice serve that.'
  }
}

// REGISTER-FIRST — the DEFAULT since Phase B (was the opt-in SOUND_DEBIAS patch). The prompt above was tuned
// across 18 revisions toward horror and copied its horror-flavored example onto calm stories (Sound Director
// diagnosis, 2026-07-24). So EVERY design now (1) gets a REGISTER-FIRST override that supersedes the
// tense-register rules for calm/measured registers (a still PRESENT bed, sparse cues, a quiet fact-landing
// peak are correct there), and (2) uses a register-neutral JSON example the model can't copy literals from.
// SUBTRACTIVE + judgment-shaped, not another mandate — per the Anti-Prescription Guard. Probe-validated
// (probe-sound-debias.ts: clears calm-register artifacts to zero while preserving horror). Presence-tilt
// (Phase B, the founder's "leans calm" steer): the calm branch defaults to a PRESENT bed, not silence —
// music: null is valid but rare. "Calm" is a register, not an absence.
const DEBIAS_REGISTER_OVERRIDE = `

REGISTER FIRST — READ BEFORE DESIGNING (this supersedes any rule above that conflicts with it):
SILENTLY decide (do NOT write it out — output only the JSON, no preface) THIS story's register — e.g. measured/documentary, warm, playful, tense/horror — and what sonic treatment would be WRONG for it, then design to that register.
The rules above about tension "from the very first second", a landing climax being "non-negotiable", and silence being a "failure" describe a TENSE register (horror and the like). For a MEASURED, CALM, or FACTUAL register they are WRONG. In a calm register the following are CORRECT, not failures: a quiet opening; a still, sustained, PRESENT bed (measured, not tense); a sparse cue layer; an unhurried peak that lands on a FACT or realization rather than a boom or scare. But CALM IS NOT SILENT: a calm register still runs a continuous, present bed UNDER the narration by default — music is present even here, just measured, not absent. \`music: null\` or a near-empty design is valid only RARELY, when the story is genuinely built on a single diegetic sound or true silence — never as a shortcut or under-filling. Never impose intensity, dread, a heartbeat/boom/whoosh, or a jumpscare climax on a story whose register does not call for it. The example is illustrative ONLY — never copy its literal values (moods, prompts, packTags); derive everything from THIS story's world and register.`
const DEBIAS_NEUTRAL_EXAMPLE = `{
  "ambient": { "packTags": ["<the real ambience of THIS place, or [] if the register wants quiet>"], "evolution": null },
  "music": { "type": "low_drone | drone_swell | riser_sting", "startAnchor": "<the opening line>", "peakAnchor": "<the emotional peak line>", "moodTags": ["<THIS register's mood — e.g. measured, warm, hopeful, driving, or dread — never defaulted to dread>"] },
  "sfx": [
    { "anchor": "<a concrete action or place in the narration>", "offsetMs": 0, "prompt": "<the plain, non-vocal sound that action/place actually makes>", "volumeDb": -8, "targetDurationSec": 2, "impactAtEnd": false }
  ],
  "voices": [],
  "silenceDrop": null,
  "ending": { "anchor": "<the exact unique opening of THIS story's final cadence>", "focus": "music | ambience | silence", "shape": "button | resolve | ring_out" }
}`

export function buildSoundDesignerPrompt(
  narration: string,
  scenes: DesignerScene[],
  genre?: string,
): { system: string; userMessage: string } {
  const horror = genre === 'horror'

  const sceneLines = scenes
    .map((s) => {
      const tags = [s.isHero ? 'HERO' : null, s.mood.length ? s.mood.join('/') : null, s.location || null]
        .filter(Boolean)
        .join(' · ')
      // Give the model the scene's opening words so it can anchor cues inside the right scene.
      const lead = s.narrationText.trim().slice(0, 70)
      return `${s.idx}. [${tags}] "${lead}…"`
    })
    .join('\n')

  const system = `You are the sound designer for a cinematic narrated ${horror ? 'HORROR ' : ''}reel — the single artist responsible for everything heard besides the narrator. ${genreContext(genre)}

You get the full narration and the SCENE BREAKDOWN (where the story's weight sits, each scene's mood + location).

Build the soundscape in layers that run together. The mission: the viewer feels PHYSICALLY PRESENT inside the world of the story — sound RECONSTRUCTS the experience, it doesn't merely accompany the narration. What that experience feels like is the genre's and the story's call; the craft below is universal.

1. A CONTINUOUS bed — present from the VERY FIRST SECOND: the low texture of the ACTUAL place (room tone, a hum, air, distant rumble) plus the music. It should establish the story's emotional world within the first second — and it never fully stops. Choose music's character AND MOVEMENT by the story's shape: a story that BUILDS toward a turn takes music that moves with it — a tightening swell (drone_swell) or a mounting riser (riser_sting). low_drone is valid ONLY for a piece that truly sits still with no turn; a narrated story with a HERO/climax beat is a BUILD, so for it pick drone_swell or riser_sting, never low_drone. Never a melody. The music startAnchor should almost always be the very beginning.
2. SUSTAINED tension/immersion textures (endAnchor cues) — a loopable texture laid UNDER a whole stretch of the story, from one line to a later line: a slow heartbeat under her walk to the bathroom, empty-corridor tone with a fluorescent hum under the school scene, rain under the storm stretch, a low pulse that tightens the act before the reveal. These are what make the viewer's body react — use them wherever a stretch of story tightens or a place needs to be LIVED IN, not just visited. Set "endAnchor" to the later narration line where the texture should stop; write the prompt as a seamless loopable texture.
3. REALISM the viewer can HEAR — the real sound of EVERY concrete physical action the narration names, on the moment it happens: she walks → footsteps on that floor; a door → its creak and latch; texting → taps on glass; a faucet, cloth, a chair scrape, a phone buzzing. If the narration names an action or a place, that is a cue candidate — take them. They sit UNDER the narrator but must be clearly present, NOT subliminal. Calibration: a typical narrated reel, fully heard, lands around 8–14 cues counting sustained textures — if your design has only 4 or 5, you almost certainly under-heard the world; go back through the narration action by action. (A near-silent, under-filled realism layer is the #1 failure.)
4. ONE emotional climax that LANDS — the single moment everything else exists to make feel inevitable (a scare, a revelation, a punchline, a warm turn). This moment MUST make a sound: a single, CLEARLY AUDIBLE impact with real body AND weight (a boom/slam/stab/swell with low-end under it, NOT a pure sub-bass rumble, which is inaudible on phone speakers), set up by a beat of SILENCE right before it. The silence is the wind-up; the impact is the punch — do NOT wind up and never punch. A climax you leave in pure silence with nothing landing on it is the #1 way these reels fall flat. Resist a full hit on every beat, but the one climax is non-negotiable when the story turns (almost every narrative reel does). It usually belongs on the HERO/turn line, built up with impactAtEnd.${horror ? ' In HORROR the climax is a JUMPSCARE: a sudden, DEEP, full-bodied impact felt in the chest — a heavy boom / slam / low-end hit with real body and a short ringing tail (still non-vocal), at the TOP of the loudness range (volumeDb +4..+6), loud enough to make the viewer flinch. Its power is WEIGHT, not shrillness. NEVER a thin, harsh, high-pitched screech, a metallic shriek, or a violin/nails scrape — those HURT the ear on a phone speaker and read as noise, not fear. If a riser leads in, it is a LOW rumble/whoosh swelling into the boom, not a rising screech. A polite boom is a wasted scare; a painful screech is a worse one.' : ''}
5. AN ENDING THAT HOLDS — the reel must not sag after the hit. The aftermath (a high ringing, an unsettled texture, the room gone wrong) carries the final scene all the way to the last word, and the very LAST line can earn a closing sting — a final jolt as the reel ends${horror ? ' (in horror it usually does: the viewer should leave with their heart still going)' : ''}. Never let the last scene play out over dead, empty air.

ENDING DIRECTION — choose the exact final-cadence anchor and what established layer carries it. focus is
music when the score should remain the emotional thread, ambience when the story should land inside its
physical world, or silence only when an earned absence is the ending itself. shape is button for a
quick decisive stop, resolve for a closing phrase that settles, or ring_out when an existing impact or
resonance must decay. This is intent, not a request for a new cue: never introduce a fresh musical idea after
the narration just to fill the hold. Anchor it to the exact unique opening words of the final clause or phrase.

Shaping each cue — you set LENGTH (targetDurationSec), LOUDNESS (volumeDb), and optionally SPAN (endAnchor):
- LENGTH: use the shortest duration that accomplishes the emotional purpose. A one-shot may be around a second; a texture that needs to breathe may run several seconds; a slow build may last ten or more — ending in its hit, with a ringing decay tail after it. (Any cue is clamped to 1–22s.)
- SPAN: a cue with "endAnchor" is SUSTAINED — the mixer loops it from its anchor until the end of the endAnchor line, fading it in and out. For sustained cues, targetDurationSec is the length of the loop CLIP (8–12s is ideal); write its prompt as a seamless loop ("slow steady heartbeat, seamless loop"). Sustained cues are impactAtEnd=false. A sustained bed must be LOW and soft (room tone, a low drone/pulse, air) — NEVER a buzzy, whiny, or high-pitched continuous texture (a fluorescent buzz, an electrical whine, an insect shrill): looped for a whole stretch those become a painful wall of noise.
- LOUDNESS: a texture should be barely noticeable unless the viewer listens for it; a realism detail should be clearly heard under the narrator; the emotional climax should be the loudest single sound in the entire reel — momentarily above the narrator. Everything before it exists to make that moment feel inevitable. (You set RELATIVE levels; volumeDb is clamped -30..+6 and the mixer adds a bus lift on top, so it's the spread that matters, not absolute numbers.)
- SILENCE: a beat of true quiet is how you SET UP the climax — the held breath before the scream — not a substitute for the hit. Use it to make the impact that FOLLOWS land harder; don't fill every second, but don't let the silence be the payoff itself.

Sonic ideas — invent them from THIS story's world; don't reach for stock effects:
- Use recurring sonic ideas that naturally BELONG to this world. Repetition creates familiarity; CHANGE creates emotion. (A fluorescent hum that's simply part of the room — until it stops. Rain that fades as the kitchen takes over. A pulse that exists only when she's alone.)
- CALLBACKS — think in musical storytelling: introduce an idea, develop it, call it back, resolve it. If an earlier sound becomes emotionally important, bring it back later in a CHANGED form: the door creak from the opening returns slower at the reveal; the coffee pour from the intro closes the reel; the buzzing light stops — then returns. A called-back sound feels intentionally scored; a one-off feels randomly decorated.

Hard rules:
- sfx are sounds and textures, never spoken performance. Actual words, laughter, or screams are NEVER sfx. (Quiet non-verbal breath/whisper texture is fine; a person laughing or speaking is not.)
- impactAtEnd=true for a sound that BUILDS to its hit (riser/swell → lands ON the word); false for an instant one-shot. Your climax cue is almost always impactAtEnd=true, the LONGEST cue (a real build), and the LOUDEST.
- THE CLIMAX MUST MAKE A SOUND. Place the payoff as an actual sfx cue anchored on the exact turn/reveal line — not just a silenceDrop. If you use a silenceDrop, it is the wind-up: anchor it just before the reveal, then land the impact cue on the reveal (silence → impact → ringing aftermath). A silenceDrop with no sfx after it is a missed payoff, not restraint.
- The opening must GRIP from the FIRST SECOND at FULL presence — do NOT ease in from quiet or "build up" to the mood. Put a clearly-audible element on the very first line, and almost always a SUSTAINED tension texture (an endAnchor loop — a low pulse, a dread tone, an uneasy hum) running from that first line through the opening act, so the intended feeling (dread for horror) is already there in second one. The bed carries under it; this texture is what the viewer FEELS. A near-silent or slowly-warming-up opening is a failure — the tension is present from frame one, then deepens.
- voices — at most ${horror ? 2 : 1}, and ONLY when the STORY PIVOTS on hearing a non-narrator voice (a voice answering back, mimicking, a call that changes everything). Otherwise []. One perfect voice transforms the moment; a stray one is just a stranger in the room.
- Anchor EVERY cue (sfx, silenceDrop, voice, ending) to an EXACT substring of the narration, verbatim and UNIQUE (extend until it appears exactly once). endAnchor follows the same rule and must be a LATER line than the cue's anchor.

The target: a soundscape that puts the viewer INSIDE the place${horror ? ' — an apartment at 2am, a school after hours, a dripping bathroom — with dread under their skin from the first second, their pulse in the walk, and one scare that truly detonates.' : ', dense with lived-in reality, an emotional arc the viewer feels in their body, and one climax that truly lands.'}`

  const userMessage = `NARRATION:
"""${narration}"""

SCENES ([HERO] = where the story's weight sits — the likeliest home for the one payoff, if the moment earns it):
${sceneLines}

Design the full soundscape: a bed felt from the first second, sustained tension textures under the stretches that tighten, dense scene-reliving realism, and one emotional climax that BUILDS and LANDS with an audible hit (not silence). OUTPUT JSON only:
{
  "ambient": { "packTags": ["province_night"], "evolution": null },
  "music": { "type": "low_drone" | "drone_swell" | "riser_sting", "startAnchor": "the opening line", "peakAnchor": "the twist/reveal line", "moodTags": ["dread"] },
  "sfx": [
    { "anchor": "a realism moment", "offsetMs": 0, "prompt": "non-vocal sound of the place/action", "volumeDb": -7, "targetDurationSec": 2, "impactAtEnd": false },
    { "anchor": "where the stretch tightens", "endAnchor": "the later line where it releases", "offsetMs": 0, "prompt": "slow steady heartbeat thump, seamless loop", "volumeDb": -9, "targetDurationSec": 10, "impactAtEnd": false },
    { "anchor": "the exact turn/reveal line", "offsetMs": 0, "prompt": "low rumbling whoosh swelling into a deep heavy boom impact with sub-bass body and a short ringing tail — no shrill or metallic tones", "volumeDb": 5, "targetDurationSec": 6, "impactAtEnd": true }
  ],
  "voices": [ { "anchor": "exact substring", "words": "the exact line", "speaker": "who", "delivery": "how", "voiceSearchKeyword": "search term", "gender": "male" | "female" | "any" } ],
  "silenceDrop": { "anchor": "exact substring", "durationMs": 900 }
}
Populated fields MUST use exactly these keys. Use null for silenceDrop/music if genuinely unused, and [] for voices if the story has no vocal pivot.`

  // Register-first is unconditional (Phase B): append the override; swap the horror-flavored example for a
  // neutral shape guide (keep everything up to "OUTPUT JSON only:", then the neutral example + a closing line
  // that keeps a calm register PRESENT, not empty).
  const head = userMessage.split('OUTPUT JSON only:')[0]
  const registerUser = `${head}OUTPUT JSON only (the example is a SHAPE guide — never copy its literal values):\n${DEBIAS_NEUTRAL_EXAMPLE}\nUse exactly these keys. Fit the design to the story's register: a tense register fills the layers and lands a climax; a calm register is spare and unhurried but still PRESENT — a measured, continuous bed under the narration is the default, not silence. music: null or a near-empty design is valid only when the story truly calls for it, never as under-filling. Use null for silenceDrop and [] for voices whenever the story doesn't call for them.`
  return { system: system + DEBIAS_REGISTER_OVERRIDE, userMessage: registerUser }
}
