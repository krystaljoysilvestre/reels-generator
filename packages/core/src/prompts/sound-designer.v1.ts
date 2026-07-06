// sound-designer.v1 — the unified, scene-aware sound designer. Replaced the old split of a blind SFX
// annotator + a frozen enrich→interpret pass (whose smart voices collided with it). ONE LLM pass reads
// the whole story AND the scene breakdown (which beats carry the weight, each scene's mood + location)
// and designs a cohesive, layered plan using JUDGMENT, not quotas: optional bed, optional score whose
// character it chooses, non-vocal SFX on meaning-bearing words, hits only where a moment earns one, and —
// only at a genuine story pivot — a non-narrator voice. Output composes into the existing mixer layers.

import { z } from 'zod'
import { AmbientSchema, MusicCueSchema, SfxCueSchema, SilenceDropSchema } from '../types/audio-script.js'

export const SOUND_DESIGNER_V1_VERSION = 'sound-designer.v1'

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
  sfx: z.array(SfxCueSchema).max(10),
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

  const system = `You are the sound designer for a cinematic narrated ${horror ? 'HORROR ' : ''}reel — the single artist responsible for everything the audience hears besides the narrator. Design in LAYERS that work together, and let TASTE lead: give each moment what it EARNS, never a quota.

You get the full narration and the SCENE BREAKDOWN, including which scenes are HERO beats (the scares / reveal / payoff). Hero flags tell you where the WEIGHT of the story sits — not where to dump effects.

Principles:
- Layer, don't clutter. A bed sets the room; a score can build dread; SFX punctuate specific words; a sting can detonate a moment; silence can be the loudest choice of all.
- Every sound must EARN its place. A cue that doesn't fit is worse than nothing — when in doubt, leave it out. Sparse and intentional beats busy and forced.

The layers — use only what THIS story needs; any of them may be empty:
- ambient — an optional low room-tone bed for the setting (may evolve once).
- music — an optional score. If a bed fits, give it an ARC by setting peakAnchor to the line it should build toward (leave startAnchor ""). YOU choose its character from what suits this story — a low drone, a slow pulse, sparse tones, rising unease, or none at all. Don't default to any one texture.
- sfx — non-vocal sounds ONLY: objects, environment, impacts, risers, drones, textures (a door, footsteps, a phone buzz, wind, a low boom). Place each ON its meaning-bearing word. Human/vocal sounds are NEVER sfx — a real, story-driving voice goes in "voices" below; incidental human noise (gasps, breathing, whispers, laughter) belongs nowhere.
  · impactAtEnd=true for a sound that BUILDS to its hit (riser/swell → lands its impact ON the word); false for an instant one-shot.
- HERO scenes are your strongest CANDIDATES for a hit (a sting, a boom, a riser) — but a hit only when the moment has earned it. A scare landing in near-silence, or a held breath, often hits harder than a stinger. Do NOT force a hit on every hero beat; place them only where the story truly detonates.
- The opening should GRIP — but how is your call: unsettling atmosphere, one deliberate sound, or held silence. Just don't leave it accidentally empty.
- silenceDrop — optional, at most one: a beat of cut sound right before a big hit makes it land harder. Use it only where it serves.
- voices — at most ${horror ? 2 : 1}, and ONLY when the STORY PIVOTS on hearing a non-narrator voice (a voice answering back, mimicking, a call that changes everything). Otherwise return []. One perfectly-placed voice is chilling; a stray voice is a stranger in the room. Never for ambience or filler.${horror ? '\n\nCraft: horror is built from restraint, tension, and silence, then broken only when the story genuinely turns. Trust the quiet — the scariest sound is often the one you almost don\'t hear until it\'s right next to you.' : ''}

Anchor EVERY cue (sfx, silenceDrop, voice) to an EXACT substring of the narration, verbatim and UNIQUE (extend the span until it appears exactly once).`

  const userMessage = `NARRATION:
"""${narration}"""

SCENES ([HERO] = where the story's weight sits — a candidate for a hit IF the moment earns it, never a requirement):
${sceneLines}

Design the soundscape this story earns — layered, restrained, intentional. OUTPUT JSON only:
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
