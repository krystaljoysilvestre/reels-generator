// sound-designer.v1 — the unified, scene-aware sound designer. Replaced the old split of a blind SFX
// annotator + a frozen enrich→interpret pass (whose smart voices collided with it). ONE LLM pass reads
// the whole story AND the scene breakdown (which beats carry the weight, each scene's mood + location)
// and designs a cohesive, layered plan using JUDGMENT, not quotas: optional bed, optional score whose
// character it chooses, non-vocal SFX on meaning-bearing words, hits only where a moment earns one, and —
// only at a genuine story pivot — a non-narrator voice. Output composes into the existing mixer layers.

import { z } from 'zod'
import { AmbientSchema, MusicCueSchema, SfxCueSchema, SilenceDropSchema } from '../types/audio-script.js'

// Bump on any material prompt/craft change so annotate_audio_script re-plans instead of reusing a cached
// design. v1.1 = dense-realism + restraint rebalance. v1.2 = audibility fix (foreground detail must be
// clearly heard, not "faint/distant"; payoff = a full-bodied audible hit, not pure inaudible sub-bass).
export const SOUND_DESIGNER_V1_VERSION = 'sound-designer.v1.2'

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
})
export type SoundDesign = z.infer<typeof SoundDesignSchema>

export interface DesignerScene {
  idx: number
  isHero: boolean
  mood: string[]
  location: string
  narrationText: string
}

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

  const system = `You are the sound designer for a cinematic narrated ${horror ? 'HORROR ' : ''}reel — the single artist responsible for everything heard besides the narrator. ${horror ? 'The craft here is NOT scary music and loud stings — it is a BELIEVABLE WORLD that something quietly invades. Aim for roughly nine parts ordinary reality to one part overt horror: the supernatural lands because it interrupts a real place, not because it announces itself.' : 'Build a believable, immersive world of sound that serves the story.'}

You get the full narration and the SCENE BREAKDOWN (where the story's weight sits, each scene's mood + location).

Build the soundscape in layers that run together:

1. A CONTINUOUS bed — always present, barely noticeable: the low texture of the ACTUAL place (room tone, a faint hum, air, distant rumble). It should read as "something is slightly off here," never as "ghost music." Carry it with ambient + music; choose music's character to suit this story (a low room-tone drone, faint air, a slow pulse — not a melody). The bed never fully stops.
2. REALISM the viewer can HEAR — the real sounds of THIS place and these exact actions, each on the moment it happens: a latch, a faucet, cloth, a chair scrape, a fluorescent buzz, footsteps, a phone against a hard surface. BE GENEROUS with these — a believable world is full of them. They sit UNDER the narrator but must be clearly present, NOT subliminal: a viewer should notice the door, the footsteps, the phone. Avoid burying everything in "faint / distant / barely-there" — reserve true faintness for the continuous bed (layer 1); these foreground details are audible. (A near-silent realism layer is the #1 failure — don't under-fill it or under-play it.)
3. RESTRAINT on the overt. The reel builds toward essentially ONE real payoff: a single, CLEARLY AUDIBLE impact — a full-bodied hit with real body AND weight (a boom/slam/stab with low-end under it, NOT a pure sub-bass rumble, which is inaudible on phone speakers), set up by a beat of SILENCE right before it. Resist a hit on every scare — one earned payoff lands harder than five. A HERO scene is where it most likely belongs, but only the moment that truly turns.

Devices to reach for WHERE THEY FIT (never all, never forced):
- a reverse swell rising into the impact (makes the ear brace); a slow subconscious pulse that quickens with tension; a high ringing / everything-goes-quiet after the hit; faint tape/analog hiss for a found, old-recording feel; metallic resonance (a pipe, a far clang) for schools/hospitals/lots/elevators; and — used SPARINGLY and mixed very low — non-verbal breath or whisper TEXTURES.

Hard rules:
- sfx are sounds and textures, never spoken performance. Actual words, laughter, or screams are NEVER sfx. (Quiet non-verbal breath/whisper texture is fine; a person laughing or speaking is not.)
- impactAtEnd=true for a sound that BUILDS to its hit (riser/swell → lands ON the word); false for an instant one-shot.
- The opening should GRIP from the first second — settle the viewer into the real place with something faintly wrong. Don't leave it empty.
- voices — at most ${horror ? 2 : 1}, and ONLY when the STORY PIVOTS on hearing a non-narrator voice (a voice answering back, mimicking, a call that changes everything). Otherwise []. One perfect voice is chilling; a stray one is a stranger in the room.
- Anchor EVERY cue (sfx, silenceDrop, voice) to an EXACT substring of the narration, verbatim and UNIQUE (extend until it appears exactly once).

The target: a soundscape that feels like a real recording of the place${horror ? ' — an apartment at 2am, a school after hours, a dripping bathroom — until something that doesn\'t belong slips in. Dense with quiet reality; ruthless with the overt.' : '.'}`

  const userMessage = `NARRATION:
"""${narration}"""

SCENES ([HERO] = where the story's weight sits — the likeliest home for the one payoff, if the moment earns it):
${sceneLines}

Design the full soundscape: a continuous bed, dense quiet realism throughout, and a restrained overt layer that builds to one felt payoff. OUTPUT JSON only:
{
  "ambient": { "packTags": ["province_night"], "evolution": null },
  "music": { "type": "low_drone" | "drone_swell" | "riser_sting", "startAnchor": "", "peakAnchor": "the twist/reveal line", "moodTags": ["dread"] },
  "sfx": [ { "anchor": "exact substring", "offsetMs": 0, "prompt": "non-vocal sound", "volumeDb": -8, "impactAtEnd": false } ],
  "voices": [ { "anchor": "exact substring", "words": "the exact line", "speaker": "who", "delivery": "how", "voiceSearchKeyword": "search term", "gender": "male" | "female" | "any" } ],
  "silenceDrop": { "anchor": "exact substring", "durationMs": 900 }
}
Populated fields MUST use exactly these keys. Use null for silenceDrop/music if genuinely unused, and [] for voices if the story has no vocal pivot.`

  return { system, userMessage }
}
