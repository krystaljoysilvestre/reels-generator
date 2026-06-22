// scenes.v1 — scene breakdown template (docs/04 §4, updated per [M9])
// Each scene emits its FULL contiguous narration substring (not a "start…end" marker).

export const SCENES_V1_VERSION = 'scenes.v1'

export interface ScenesPromptVars {
  worldBibleJson: string
  era: string
  regionDescriptor: string
  nicheDescription: string // the channel's genre/niche — drives the visual language (nothing hardcoded to one genre)
  narration: string
  // Beat-driven count: a length-scaled range the director picks WITHIN by cutting on dramatic
  // beats, rather than a fixed clock-derived number.
  minScenes: number
  maxScenes: number
  peakMoment: string // the reel's peak line (verbatim substring) — gets its own scene; '' to skip
}

export function buildScenesPrompt(v: ScenesPromptVars): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels.

CHANNEL GENRE / NICHE: ${v.nicheDescription}
Compose every shot in the visual language of THIS genre — show what it shows, imply what it implies. Do NOT import conventions from other genres (e.g. don't make a bright cooking/travel/explainer reel dark and ominous, and don't make a horror reel flat and cheerful). Match the genre.

WORLD BIBLE: ${v.worldBibleJson}
Visual canon: use canonical names for recurring places/objects so they render consistently.
Era: ${v.era}. Region look: ${v.regionDescriptor}.`

  const peakBlock = v.peakMoment.trim()
    ? `\n\nThe PEAK of this reel is this line: "${v.peakMoment.trim()}" — give it its OWN dedicated scene (don't bury it inside a longer span) so the climax lands as its own shot.`
    : ''

  const userMessage = `Cut the narration into scenes on its DRAMATIC BEATS — start a new scene at each real shift in location, time, focus, or tension (the hook, each escalation or turn, the peak, the resolution), NOT at even time intervals. Use between ${v.minScenes} and ${v.maxScenes} scenes; let the story's structure decide the exact number within that range. Each scene covers a contiguous span of narration with no gaps and no overlaps, in order.${peakBlock}

Narration:
"""${v.narration}"""

For each scene write:
- narrationText: the COMPLETE, VERBATIM substring of the narration that this scene covers (copy-paste exactly, no truncation with "…")
- imagePrompt: CONTENT ONLY. START with the single most important thing the viewer must see — the exact subject, person, or action the line is about (be concrete, NOT a generic empty room). THEN add, in order: shot size + camera angle (wide establishing / intimate close detail, low or high); one foreground element for depth; the light source with its direction (e.g. a single candle from the left, cold moonlight through slats); a touch of atmosphere (fog, haze, deep shadow, negative space). One concrete sentence, ~20-35 words — do NOT bury the key element under description. World-bible nouns, not synonyms. NO style or medium words ("cinematic", "photo", "painting", "woodcut", colour-grade terms) — the system owns the look.
- motionPrompt: one slow camera/element movement, present tense ("camera pushes in slowly; curtain shifts once"). No cuts, no fast moves.
- tier: "video" for the 2–3 most visually DYNAMIC / highest-impact beats — always include the opening beat, then pick the rest by visual impact (not every genre has a "climax"); "still" otherwise. At most 3 video.
- mood: 2–3 words for ambient/grade hints.
- location: a short canonical label for WHERE this scene takes place (e.g. "rented bedroom", "hallway", "sari-sari store"). Use the EXACT same label for every scene in the same place, and a NEW label only when the place actually changes. (Scenes that share a location are kept visually continuous; a change starts a fresh look — so be honest about when the place is truly the same vs different.)

CONTINUITY (people, places, objects): each scene image is generated independently, so a recurring element reads as the SAME one ONLY if you describe it the same way every time. The first time it appears, fix its defining visual traits; reuse those SAME traits near-verbatim every time it returns — never redesign a recurring element. This is what makes the reel feel like one world instead of unrelated stills.
- People/figures: build, age, hair, wardrobe, ONE distinguishing detail (+ face if this genre shows faces; if it only implies people, keep them as consistent silhouettes, faces in shadow).
- Places: layout, key furniture, wall + floor materials, colours, signs of wear (world-bible canonical names) — the door/window/bed in one scene are the SAME ones when you return.
- Objects: name them concretely — count, state, condition, not the bare noun (a vague "door" renders open or as a double panel; a "window" glows). Pin it: "a single closed wooden door flush in the wall", "a dark window, nothing visible outside". Match the state the story implies (a shadow under the door ⇒ it's shut).

LIGHTING & TIME: read the time of day from the narration (including Tagalog cues) and make it unmistakable in the image — a time LABEL alone won't render correctly, you must describe the actual light. Night / gabi / madaling-araw / "alas-[1-4]" / 3 AM = TOTAL DARKNESS: the frame is overwhelmingly PURE BLACK — at most ONE small light source (a weak lamp, a candle, a phone screen) whose glow barely reaches the nearest surface and falls off to black within a foot; the bed, walls, and far corners are SWALLOWED in black, not lit like an evening room. NOT the moon, NOT light through a window. Every window or opening is a solid BLACK rectangle: deep night in the rural tropics has no usable moonlight, so NO daylight, NO moon glow, nothing lit or visible outside (a window glowing at 3 AM is the #1 mistake — don't). Dusk/dawn = low warm/cold ambient. Day / umaga / tanghali / hapon = natural daylight. Lead with the darkness for night beats; never let a 3 AM scene look like a lit evening room.

SAFETY (all genres): no gore, no graphic violence, no nudity or sexualization, no minors in harmful or sexual contexts. (This also keeps generations within the image model's content policy.)
GENRE TREATMENT: render tension the way THIS genre does. For horror / thriller / paranormal, actively build DREAD — compose for unease: heavy negative space that feels occupied, something subtly WRONG at the edge of frame, the suggestion of a presence just out of view, oppressive shadow, an unsettling off-centre focal point. Imply rather than depict (silhouettes, reflections, what's barely visible) — scarier than showing it outright, and it stays within content policy. For non-threatening genres, just show the subject clearly and well-lit per the scene.

SHOW ONLY WHAT IS SEEN: depict what the narrator actually sees — no more. If something is only HEARD (a voice, a knock, footsteps, breathing) or only FELT (being watched, a presence in the room) and the narration never says it was SEEN, do NOT render its source — not even a silhouette. Instead render the narrator hearing/sensing it and the charged, empty dark around them (e.g. a voice in the night → the person frozen in bed facing the dark, NOT a figure standing there). Inventing a visible figure the story kept unseen destroys the fear. Only show a presence when the narration explicitly says it was seen (a shadow, a shape, a glimpse).

PERSPECTIVE: detect the narration's voice from the FULL narration, then apply ONE perspective to EVERY scene in the reel (don't mix).
- FIRST-PERSON (the narrator tells their own experience — "ako", "ko", "akin", "nakita ko", "I", "my") → shoot the WHOLE reel in POV: the camera IS the narrator's eyes. Every shot is what THEY see — the door, the shadow beneath it, the dark corner, the person they're speaking to, the road ahead — optionally with their own hands, feet, or shoulder at the edge of frame. NEVER show the narrator as a separate full figure (they are the camera). Keep it from going static by varying the POV: wide of the room from the bed, a close push on the door, a glance down at the floor, etc.
- THIRD-PERSON (the story is about someone else) → observer framing: show the character(s) in the scene normally.
The narrator being unseen in POV is separate from CHARACTERS, which still governs any OTHER recurring person who IS seen.

PROGRESSION & VARIETY: the reel is a sequence, not a set of similar stills — advance the visual story. Don't repeat the same shot size, camera distance, or focal point on consecutive scenes unless the narration deliberately lingers; vary the framing as the beats call for it (wide establishing, medium, close detail, low or high angle). BUT when consecutive scenes are about the SAME subject, keep that subject the recognizable focus — don't cut away to an unrelated environment shot. (Same place + varied framing is the goal: continuity of WHERE, variety in HOW it's shot.)

OUTPUT (JSON only):
{
  "scenes": [
    {
      "idx": 1,
      "narrationText": "complete verbatim substring",
      "imagePrompt": "",
      "motionPrompt": "",
      "tier": "still",
      "mood": ["tense", "quiet"],
      "location": "rented bedroom"
    }
  ]
}`

  return { system, userMessage }
}
