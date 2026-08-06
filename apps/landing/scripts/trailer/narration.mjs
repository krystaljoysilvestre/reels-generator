// The trailer's narration — the one source of truth for both the voice and the burned captions.
//
// It lives in its own module on purpose: the caption renderer needs these words, and importing
// gen-trailer-audio.mjs to get them would execute its ElevenLabs calls at module load and spend money.
// One list also means a reworded line can never leave a caption behind that disagrees with the voice.
export const LINES = [
  [1, 'Every story begins with a single question.'],
  [2, 'What if... everything you knew changed?'],
  [3, 'What if history remembered something different?'],
  [4, 'What if tomorrow arrived... too early?'],
  [5, 'What if legends were real?'],
  [6, 'What if something had been watching us all along?'],
  [7, 'What if we were never alone?'],
  [8, 'Every answer begins another story.'],
  [9, 'Every world begins with imagination.'],
  [10, 'Kendrix. Build stories people can’t stop watching.'],
]

// ONE word per line carries the brand gradient. This is the captions' real idea: the gradient runs
// through every line of the film and then, at 36s, contracts and becomes the K — so the logo is the
// payoff of something the viewer has been reading for thirty seconds rather than a card at the end.
// Chosen by hand, because the load-bearing word is a judgement, not a rule: it is the word the
// question turns on.
export const EMPHASIS = {
  1: 'question',
  2: 'changed',
  3: 'different',
  4: 'too early',
  5: 'real',
  6: 'watching',
  7: 'alone',
  8: 'another story',
}

// Beats 2–7 are an anaphora: one question, six widening worlds. The captions set the stem once and
// hold it while only the clause changes, so the film's rhetorical shape is visible rather than implied.
// (Kept as data, not as a regex over the lines, so the device is explicit and easy to switch off.)
export const ANAPHORA = {
  stem: 'What if',
  beats: [2, 3, 4, 5, 6, 7],
  // What each beat says AFTER the stem. Ellipses in the spoken lines become a beat of space here.
  clauses: {
    2: 'everything you knew changed?',
    3: 'history remembered something different?',
    4: 'tomorrow arrived… too early?',
    5: 'legends were real?',
    6: 'something had been watching us all along?',
    7: 'we were never alone?',
  },
}

// Captions run beats 1–8 and stop.
//
// Beat 9 is deliberately NOT captioned. The montage is cut from the product's own finished reels, so it
// already carries their burned captions — a film caption on top of it stacked two bars and read as a
// bug. Stepping aside there makes the handoff start where the product's output first appears, which is
// truer than the original plan: the film's captions (1–8) → the product's own captions (the montage,
// then the reel revealed inside Kendrix) → the brand's own words. Found by looking at frame 26.5s.
export const CAPTIONED_BEATS = [1, 2, 3, 4, 5, 6, 7, 8]
