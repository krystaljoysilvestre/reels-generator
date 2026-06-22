// Deterministic QA for a scene breakdown — pure, no LLM, cheap to run on every reel.
// Complements validateSceneTiling (gaps/coverage/order, enforced in breakdown_scenes): this covers the
// checks that tiling + the Zod schema DON'T — peak placement, tier discipline, and image-prompt hygiene.
//
// Two severities, by design:
//   - errors:   structural violations worth one LLM repair round (peak split across scenes, too many
//               video tiers). Things the model can fix and that genuinely hurt the reel.
//   - warnings: image-prompt hygiene + soft misses (style-word leakage, leading with the setting,
//               location-label drift, count outside the suggested range). Surfaced for observability so
//               real failures accumulate; never block a render on a heuristic.
//
// idx integrity is NOT checked here — it's fixed deterministically at persist time (idx = narration
// order), which is more robust than asking the LLM to renumber.

export interface SceneQAScene {
  narrationText: string
  imagePrompt: string
  tier: 'still' | 'video'
  location: string
}

export interface SceneQAInput {
  narration: string
  peakMoment: string // '' when the reel has no designated peak
  minScenes: number
  maxScenes: number
  scenes: SceneQAScene[]
}

export interface SceneQAResult {
  errors: string[] // → trigger an LLM repair round
  warnings: string[] // → logged only
}

const MAX_VIDEO_TIERS = 3

// Style/medium words the image prompt must NOT contain — the system owns the look [CLAUDE.md rule 2].
// Kept tight + word-boundary matched to avoid false hits (e.g. "render" inside "tenderness").
const STYLE_LEAK_WORDS = [
  'cinematic', 'photograph', 'photorealistic', 'photo-realistic', 'hyperrealistic', 'hyper-realistic',
  'painting', 'illustration', 'render', 'octane', 'unreal engine', '4k', '8k', 'ultra hd', 'hdr',
  'color grade', 'colour grade', 'color-graded', 'film grain', 'bokeh',
]

// Openers that signal the prompt leads with the SETTING/shot rather than the subject (VISUAL PRIORITY).
// Heuristic — a warning, not an error. Matched at the very start of the prompt, case-insensitive.
const SETTING_FIRST_OPENERS = [
  'a room', 'an empty', 'a dark room', 'the room', 'interior', 'a wide shot', 'wide shot',
  'an empty room', 'a kitchen', 'the kitchen', 'a hallway', 'the hallway', 'a landscape', 'a view of',
  'establishing shot', 'a establishing', 'an establishing',
]

function norm(s: string): string {
  return s.trim().toLowerCase()
}

// Two location labels likely name the SAME place if one contains the other as a whole-word phrase
// (e.g. "bedroom" vs "rented bedroom"). Same-place labels MUST match exactly or they break the
// per-location seed that keeps a room continuous across shots.
function labelsLikelySamePlace(a: string, b: string): boolean {
  const x = norm(a)
  const y = norm(b)
  if (x === y) return false
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(long)
}

export function reviewSceneBreakdown(input: SceneQAInput): SceneQAResult {
  const errors: string[] = []
  const warnings: string[] = []
  const { scenes } = input
  const narration = input.narration.trim()

  // ── Peak placement (error) ───────────────────────────────────────────────
  // The peak line must sit WITHIN a single scene so it lands as its own beat. If it's a real substring
  // of the narration but no single scene's text contains it, it's split across a boundary → repairable.
  const peak = input.peakMoment.trim()
  if (peak && narration.includes(peak)) {
    const containedIn = scenes.filter((s) => s.narrationText.includes(peak))
    if (containedIn.length === 0) {
      errors.push(`The peak line ("${peak.slice(0, 60)}") is split across scene boundaries — it must sit within ONE scene so it lands as its own beat.`)
    } else {
      // Contained, but buried in a much longer span → soft nudge toward its own shot.
      const host = containedIn[0]!
      if (peak.length / host.narrationText.trim().length < 0.5) {
        warnings.push(`The peak line is buried in a longer scene (peak is ${Math.round((peak.length / host.narrationText.trim().length) * 100)}% of the scene's text) — consider giving it its own shot.`)
      }
    }
  }

  // ── Tier discipline ──────────────────────────────────────────────────────
  const videoCount = scenes.filter((s) => s.tier === 'video').length
  if (videoCount > MAX_VIDEO_TIERS) {
    errors.push(`${videoCount} scenes are marked "video"; at most ${MAX_VIDEO_TIERS} are allowed (cost + render time). Keep the ${MAX_VIDEO_TIERS} most visually dynamic beats as video, the rest "still".`)
  }
  if (scenes.length > 0 && scenes[0]!.tier !== 'video') {
    warnings.push('The opening scene is not "video" — the first beat usually benefits from motion.')
  }

  // ── Count vs the suggested beat-driven range (warning) ─────────────────────
  if (scenes.length < input.minScenes) {
    warnings.push(`${scenes.length} scenes is below the suggested minimum (${input.minScenes}) for this length — the story may be under-cut.`)
  } else if (scenes.length > input.maxScenes) {
    warnings.push(`${scenes.length} scenes is above the suggested maximum (${input.maxScenes}) for this length — the story may be over-cut.`)
  }

  // ── Image-prompt hygiene (warnings) ────────────────────────────────────────
  scenes.forEach((s, i) => {
    const prompt = norm(s.imagePrompt)
    const n = i + 1
    const leaked = STYLE_LEAK_WORDS.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(prompt))
    if (leaked.length > 0) {
      warnings.push(`Scene ${n} image prompt contains style/medium words (${leaked.join(', ')}) — content only; the system owns the look.`)
    }
    if (SETTING_FIRST_OPENERS.some((o) => prompt.startsWith(o))) {
      warnings.push(`Scene ${n} image prompt may lead with the setting, not the subject (VISUAL PRIORITY) — open on the specific thing the line is about.`)
    }
  })

  // ── Location-label drift (warning) ─────────────────────────────────────────
  const labels = [...new Set(scenes.map((s) => s.location.trim()).filter(Boolean))]
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (labelsLikelySamePlace(labels[i]!, labels[j]!)) {
        warnings.push(`Location labels "${labels[i]}" and "${labels[j]}" may name the same place — use ONE label so same-place scenes share a generation seed (continuity).`)
      }
    }
  }

  return { errors, warnings }
}
