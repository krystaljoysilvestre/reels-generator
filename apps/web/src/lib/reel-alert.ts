// Client-only "reel is done" alert helpers. Both browser gates (audio autoplay + notification permission)
// require a user gesture, so `primeReelAlert()` is called when the operator clicks Render; the chime +
// desktop notification then fire later from the app-wide poll (see RenderAlertWatcher) with no further gesture.

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext }

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
  if (!Ctx) return null
  audioCtx = audioCtx ?? new Ctx()
  return audioCtx
}

// Call on a user gesture (the Render click): unlock the AudioContext so the completion chime can play
// later without a gesture, and ask for notification permission if the user hasn't decided yet.
export function primeReelAlert(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  } catch { /* ignore */ }
  try {
    void getCtx()?.resume()
  } catch { /* ignore */ }
}

// A soft two-note chime — rising for "ready", falling for "snag". Synthesized (no asset to ship/load).
export function playChime(success: boolean): void {
  try {
    const ctx = getCtx()
    if (!ctx) return
    void ctx.resume()
    const now = ctx.currentTime
    const notes = success ? [660, 990] : [440, 330]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.16
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.42)
    })
  } catch { /* ignore */ }
}

// Fire a desktop notification if the user granted permission. Returns whether it fired.
export function notifyReel(title: string, body: string): boolean {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'reel-done' })
      return true
    }
  } catch { /* ignore */ }
  return false
}
