// Story angle directives — the diversity lever for best-of-N story generation.
// N identical prompts converge on near-duplicate drafts even at high temperature; a distinct
// hook/structure archetype per candidate forces genuinely different stories. Archetypes are
// niche-agnostic on purpose: the prompt tells the model to interpret the angle in the
// channel's own terms, so the same list serves horror, true-crime, folklore, etc.

export interface StoryAngle {
  id: string
  directive: string
}

// Keep ≥ N+2 entries so a regeneration round can exclude the rejected winner's angle and
// still field a full slate. Order matters only as the rotation base (see selectAngles).
export const STORY_ANGLES: StoryAngle[] = [
  {
    id: 'cold_open',
    directive:
      'Open mid-action at the worst moment — no setup, no scene-setting — then let the story catch up to how it got there.',
  },
  {
    id: 'witness_account',
    directive:
      'A first-hand account: the narrator lived through something they still can\'t stop turning over, and is telling it for the first time.',
  },
  {
    id: 'retold_legend',
    directive:
      'Retell a story a community already tells — a legend, a warning, a famous incident — but the teller includes one specific detail they could not possibly know unless they were there.',
  },
  {
    id: 'mundane_wrong',
    directive:
      'An ordinary daily routine, described plainly, where exactly one small detail is off — and it compounds each time it recurs.',
  },
  {
    id: 'second_person',
    directive:
      'Direct second-person address — put the viewer inside the events as they unfold, decisions and all.',
  },
  {
    id: 'slow_dread',
    directive:
      'A quiet, patient build with no overt turn until late; the payoff must recontextualize the very first line.',
  },
  {
    id: 'outsider_pov',
    directive:
      'Told by someone adjacent to the events — a neighbor, a driver, a store clerk — who only saw the edges of what happened.',
  },
  {
    id: 'artifact',
    directive:
      'Anchor the entire story on one physical object; by the end, what that object means must have completely flipped.',
  },
]

// Deterministic slate selection: rotate the archetype list by the regeneration nonce (so each
// "write another" round leads with fresh angles), drop the previously rejected winner's angle
// (repeating the exact approach the operator just rejected is the one guaranteed-wrong move),
// and take the first n. Deterministic on (n, nonce, excludeId) so the step's input hash — which
// includes the selected angle ids — is stable across retries of the same round.
export function selectAngles(n: number, nonce: number, excludeId?: string): StoryAngle[] {
  const pool = STORY_ANGLES.filter((a) => a.id !== excludeId)
  const offset = pool.length > 0 ? nonce % pool.length : 0
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)]
  return rotated.slice(0, Math.min(n, rotated.length))
}
