import type { VoiceSettings } from './voice-settings.js'

// Operator-facing narrator DELIVERY presets — a single dropdown choice (mirrors the music-mood control)
// instead of three raw sliders. Each preset sets pace/expressiveness/steadiness; the picked voice's timbre
// (similarity_boost) + speaker boost carry over from the base. "Auto" = no preset → per-story auto-tuning.
export type DeliveryPreset = 'calm' | 'tense' | 'dramatic' | 'urgent' | 'deadpan'

// The three axes the operator controls (speed = pace, style = expressiveness, stability = steadiness).
type DeliveryAxes = Pick<VoiceSettings, 'speed' | 'style' | 'stability'>

export const DELIVERY_PRESETS: Record<DeliveryPreset, { label: string; hint: string; axes: DeliveryAxes }> = {
  calm:     { label: 'Calm',     hint: 'gentle, slow, steady',   axes: { speed: 0.92, style: 0.12, stability: 0.72 } },
  tense:    { label: 'Tense',    hint: 'held-back, uneasy',       axes: { speed: 0.90, style: 0.30, stability: 0.42 } },
  dramatic: { label: 'Dramatic', hint: 'expressive, big swings',  axes: { speed: 0.96, style: 0.50, stability: 0.30 } },
  urgent:   { label: 'Urgent',   hint: 'fast, driving',           axes: { speed: 1.08, style: 0.32, stability: 0.45 } },
  deadpan:  { label: 'Deadpan',  hint: 'flat, eerily even',       axes: { speed: 0.98, style: 0.05, stability: 0.82 } },
}

// Ordered options for a dropdown: [{ value, label, hint, axes }].
export const DELIVERY_PRESET_OPTIONS = (Object.keys(DELIVERY_PRESETS) as DeliveryPreset[]).map((value) => ({ value, ...DELIVERY_PRESETS[value] }))

// Merge a preset's axes onto a base (keeps timbre/speaker-boost from the base voice).
export function applyDeliveryPreset(base: VoiceSettings, preset: DeliveryPreset): VoiceSettings {
  return { ...base, ...DELIVERY_PRESETS[preset].axes }
}

// Which preset (if any) the current settings match — for highlighting the active row. Exact-ish on the
// three axes (small epsilon for float noise). null = a hand-tuned/legacy value that matches no preset.
export function matchDeliveryPreset(vs: VoiceSettings): DeliveryPreset | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005
  for (const key of Object.keys(DELIVERY_PRESETS) as DeliveryPreset[]) {
    const a = DELIVERY_PRESETS[key].axes
    if (near(vs.speed, a.speed) && near(vs.style, a.style) && near(vs.stability, a.stability)) return key
  }
  return null
}
