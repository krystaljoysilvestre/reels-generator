import { eq } from 'drizzle-orm'
import { getDb, reels, stories, scenes } from '@reels/db'
import { llmCall, listVoices, buildInputHash } from '@reels/providers'
import { AudioScriptSchema, AudioPacksSchema, OperatorSfxSchema, cueVolumeDb, resolveMusicMood, MusicMoodSchema, isVocalSfxPrompt, isHarshSustainedTexture, buildOpeningDreadCue, pickDreadEndAnchor, choreographClimax, type AudioScript, type OperatorCue } from '@reels/core'
import { buildSoundDesignerPrompt, SOUND_DESIGNER_V1_VERSION, SoundDesignSchema, type DesignerScene } from '../../prompts-bridge.js'
import type { DesignerVoice } from '@reels/core/prompts/sound-designer.v1'
import { runStep } from '../harness.js'
import { countOccurrences, validateAnchorUniqueness } from '../anchors.js'

// Turn the designer's pivotal non-narrator voices into placeable smart SPEECH cues: resolve each to a
// fitting catalog voice and anchor it uniquely. This is now the ONLY source of non-narrator voices — the
// old frozen enrich→interpret path is retired, so no more random background "voices"/laughter drifting in.
async function realizeDesignerVoices(voices: DesignerVoice[], narration: string, language: string): Promise<OperatorCue[]> {
  const cues: OperatorCue[] = []
  for (const v of voices) {
    if (!v.words.trim()) continue
    if (countOccurrences(narration, v.anchor) !== 1) continue // must place uniquely
    const catalog = await listVoices(language, v.voiceSearchKeyword ? { search: v.voiceSearchKeyword } : undefined)
    const pool = v.gender && v.gender !== 'any' ? catalog.filter((c) => c.gender.toLowerCase() === v.gender) : catalog
    const voiceId = (pool[0] ?? catalog[0])?.id
    if (!voiceId) continue
    cues.push({
      id: crypto.randomUUID(), source: 'smart', anchor: v.anchor, offsetMs: 0, volumeDb: cueVolumeDb('speech'),
      kind: 'speech', words: v.words, speaker: v.speaker || undefined, delivery: v.delivery || undefined, voiceId,
    })
  }
  return cues
}

// annotate_audio_script — step 2 (docs/02 §4)
// Validates anchor uniqueness after generation (see ../anchors.ts).

export async function annotateAudioScript(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error(`Story not found: ${reel.storyId}`)

  const { channels } = await import('@reels/db')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const channelGenre = channel?.genreCategory

  // Scene breakdown feeds the designer: which beats are HERO scares/reveals (→ jumpscare stings), plus
  // each scene's mood + location + opening words (→ scene-aware, appropriately-placed cues).
  const reelScenes = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  reelScenes.sort((a, b) => a.idx - b.idx)
  const designerScenes: DesignerScene[] = reelScenes.map((s) => ({
    idx: s.idx,
    isHero: s.isHero,
    mood: s.mood ?? [],
    location: s.location ?? '',
    narrationText: s.narrationText,
  }))
  const { system, userMessage } = buildSoundDesignerPrompt(story.body, designerScenes, channelGenre)

  // Manual per-scene cues (operator "Add a sound") win on anchor collisions and are preserved verbatim.
  const manualCues = OperatorSfxSchema.parse(reel.operatorSfx ?? []).filter((c) => c.source === 'manual')
  const manualSig = manualCues.map((c) => `${c.id}:${c.anchor}:${c.assetKey ?? ''}`).join('|')
  const inputHash = buildInputHash(SOUND_DESIGNER_V1_VERSION, {
    narration: story.body,
    scenes: designerScenes.map((s) => `${s.idx}:${s.isHero ? 'H' : ''}:${s.mood.join(',')}`).join('|'),
    genre: channelGenre ?? '',
    manualSig,
  })

  const result = await runStep(
    { reelId, stepName: 'annotate_audio_script', inputHash },
    async (cost) => {
      const llm = await llmCall({
        templateVersion: SOUND_DESIGNER_V1_VERSION,
        schema: SoundDesignSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Validate anchor uniqueness — repair call if any fail. The designer's voices carry anchors too, so
      // pass the full design (SoundDesignSchema is a superset of AudioScript; validateAnchorUniqueness only
      // reads .sfx/.silenceDrop/.music/.ambient, so voices are checked separately in realizeDesignerVoices).
      let design = llm.data
      cost.add(llm.costCents)
      const errors = validateAnchorUniqueness(story.body, design)
      if (errors.length > 0) {
        const repairLlm = await llmCall({
          templateVersion: SOUND_DESIGNER_V1_VERSION,
          schema: SoundDesignSchema,
          system,
          messages: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: JSON.stringify(llm.data) },
            {
              role: 'user',
              content: `The following anchors are invalid: ${errors.join('; ')}. Each anchor must be an exact substring that appears EXACTLY ONCE in the narration. Extend any ambiguous anchor span until unique. Return the corrected JSON only.`,
            },
          ],
        })
        design = repairLlm.data
        cost.add(repairLlm.costCents)
      }

      // Split the design: AudioScript fields (bed/score/sfx/silence) + pivotal voices → smart speech cues.
      // Drop any vocal SFX the designer slipped in (belt-and-suspenders behind the prompt ban — voices are
      // the ONLY intended human sound). Manual anchors win, so a smart voice on a manual anchor is dropped.
      const manualAnchors = new Set(manualCues.map((c) => c.anchor))
      // Owner-set deterministic rule (2026-07-06, after rejecting the drone on three listening passes):
      // narrated reels never take a static low_drone bed — the LLM kept choosing it for eerie/sparse moods
      // despite explicit prompt guidance ("never low_drone" in v1.7), so it's enforced here. drone_swell
      // keeps the chosen moods but MOVES. (low_drone stays valid for preset/uploaded beds.)
      const music =
        design.music?.type === 'low_drone' ? { ...design.music, type: 'drone_swell' as const } : design.music

      const audioScript = AudioScriptSchema.parse({
        ambient: design.ambient,
        sfx: design.sfx
          .filter((c) => !isVocalSfxPrompt(c.prompt))
          // Drop harsh high-freq textures from the SUSTAINED layer (endAnchor) — looped for a whole stretch
          // they become a painful buzzy/whiny wall (owner: the looped "fluorescent hum" hurt). One-shots keep.
          .filter((c) => {
            if (c.endAnchor && isHarshSustainedTexture(c.prompt)) {
              console.log(`[annotate] ${reelId.slice(0, 8)} dropped harsh sustained texture "${c.prompt}"`)
              return false
            }
            return true
          }),
        music,
        silenceDrop: design.silenceDrop,
      })

      // Owner-set HORROR climax choreography (2026-07-10): deterministically land the ONE hit on the PAYOFF
      // (last-hero) scene, with a silence beat right before it and any sustained texture clamped to stop at
      // that silence — the LLM anchors the reveal on a narration line that often falls in the wrong scene,
      // so the scare fired over the wrong picture. See climax-choreography.ts.
      let silenceAnchor: string | null = null
      if (channelGenre === 'horror') {
        const choreo = choreographClimax({
          sfx: audioScript.sfx,
          silenceDrop: audioScript.silenceDrop,
          narration: story.body,
          scenes: reelScenes.map((s) => ({ idx: s.idx, isHero: s.isHero, narrationText: s.narrationText })),
        })
        audioScript.sfx = choreo.sfx
        audioScript.silenceDrop = choreo.silenceDrop
        silenceAnchor = choreo.silenceAnchor
        if (choreo.payoffAnchor) console.log(`[annotate] ${reelId.slice(0, 8)} climax hit → payoff scene "${choreo.payoffAnchor}"`)
      }
      // Guaranteed continuous dread bed from the opening line UNTIL the silence beat (so it stops right
      // before the hit), else until the climax. The LLM won't reliably place an opening tension texture.
      if (channelGenre === 'horror' && audioScript.sfx.length < 18) {
        const endAnchor = silenceAnchor ?? pickDreadEndAnchor({ sfx: audioScript.sfx, music: audioScript.music })
        const dread = endAnchor ? buildOpeningDreadCue({ narration: story.body, endAnchor }) : null
        if (dread && !audioScript.sfx.some((c) => c.anchor === dread.anchor)) {
          audioScript.sfx.unshift(dread)
          console.log(`[annotate] ${reelId.slice(0, 8)} injected opening dread bed → "${dread.anchor}" until "${endAnchor}"`)
        }
      }
      const smart = (await realizeDesignerVoices((design.voices ?? []) as DesignerVoice[], story.body, reel.language))
        .filter((c) => !manualAnchors.has(c.anchor))

      return { output: { audioScript, smart }, costCents: cost.total }
    },
  )

  // Every reel should have background music (Sound step). The bed's ARC (type) + mood TAGS come from the
  // operator's mood preset — reel override → channel default → the channel's derived audioMood (fallback).
  //  • AI-music channels: the preset ALWAYS wins over any type/tags the LLM guessed (operator's choice);
  //    we keep the LLM's start/peak anchors (its timing), empty when it proposed no music.
  //  • preset/upload channels: unchanged — seed from the first pool bed; selectMusicTrack matches by type.
  const audioScript = result.output.audioScript as AudioScript
  const smartCues = result.output.smart as OperatorCue[]
  {
    const audioPacks = channel ? AudioPacksSchema.parse(channel.audioPacks) : undefined
    if (audioPacks?.musicMode === 'ai') {
      const reelMood = MusicMoodSchema.safeParse(reel.musicMood)
      const { type, moodTags } = resolveMusicMood(
        reelMood.success ? reelMood.data : null,
        audioPacks.musicMood,
        audioPacks.audioMood,
      )
      // Owner-set deterministic rule (2026-07-06, after rejecting the drone on three listening passes):
      // an AI-composed bed for a narrated reel is never a static low_drone — it reads as one flat
      // unchanging tone under the whole story. drone_swell keeps the preset's moods but MOVES. This is
      // the ACTUAL type decision point (the preset always wins here, so prompt-side guidance couldn't
      // reach it). Preset/uploaded beds are untouched below.
      audioScript.music = {
        type: type === 'low_drone' ? 'drone_swell' : type,
        startAnchor: audioScript.music?.startAnchor ?? '',
        peakAnchor: audioScript.music?.peakAnchor ?? '',
        moodTags,
      }
    } else if (!audioScript.music) {
      const bed = audioPacks?.musicPack[0]
      if (bed) {
        audioScript.music = { type: bed.type, startAnchor: '', peakAnchor: '', moodTags: bed.moodTags }
      }
    }
    // An operator-uploaded bed plays on ANY channel mode (even 'none'/empty pool) — make sure a music
    // intent exists so compute_timings produces the envelope timing and the mixer doesn't skip music.
    if (reel.musicUploadKey && !audioScript.music) {
      audioScript.music = { type: 'low_drone', startAnchor: '', peakAnchor: '', moodTags: [] }
    }
  }
  // (silenceDrop now comes straight from the designer — no separate smart-note pass to merge.)

  // Persist audio_script + the merged cue set (manual cues preserved, smart cues appended). These come
  // from the (possibly cached) step output, so re-runs don't re-mint cue UUIDs and downstream SFX stays
  // cached. Manual cues already won anchor collisions inside the step.
  await db
    .update(reels)
    .set({
      audioScript: audioScript as never,
      operatorSfx: [...manualCues, ...smartCues] as never,
      updatedAt: new Date(),
    })
    .where(eq(reels.id, reelId))
}
