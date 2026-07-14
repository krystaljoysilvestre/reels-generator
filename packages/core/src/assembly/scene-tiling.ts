// Deterministic scene retiling — guarantee the scenes tile the narration GAPLESSLY and VERBATIM.
//
// The breakdown LLM reliably picks good CUT POINTS but is unreliable at COPYING the narration verbatim:
// it drifts punctuation (straight vs curly quotes), and at each boundary it can drop a few characters —
// and the more scenes there are, the more boundaries, the more likely a gap. A gap is fatal: compute_timings
// throws SceneCoverageError on any uncovered span. So instead of trusting the LLM's copied text, we trust
// only WHERE each scene STARTS (located tolerantly), then replace every scene's narrationText with the exact
// substring of the real narration from that start to the next scene's start. Any gap is absorbed into the
// preceding scene; punctuation drift disappears because we slice the real text. Result: always gapless,
// always verbatim. This is the "LLM proposes structure → code executes exactly" pattern (see ARCHITECTURE.md).

// Leading characters of a scene's text we use to LOCATE its start, tried longest-first. A long head is
// unambiguous; when punctuation drift near the start breaks it, we fall back to shorter heads (the monotonic
// cursor keeps even a short head from matching too early). Only if the shortest fails do we bail.
const HEAD_LENS = [24, 16, 10, 6]

// Normalize for LOCATING only (never for output): lowercase, unify quote glyphs, collapse whitespace runs.
// Returns the normalized string plus a map from each normalized index → the raw index it came from.
function normalizeWithMap(raw: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let prevWasSpace = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!
    if (/\s/.test(c)) {
      if (!prevWasSpace) {
        norm += ' '
        map.push(i)
        prevWasSpace = true
      }
      continue
    }
    prevWasSpace = false
    // unify curly/smart quotes and common dash variants to a single canonical form
    let n = c.toLowerCase()
    if (n === '‘' || n === '’' || n === '`' || n === '´') n = "'"
    else if (n === '“' || n === '”') n = '"'
    else if (n === '–' || n === '—') n = '-'
    norm += n
    map.push(i)
  }
  return { norm, map }
}

/**
 * Snap LLM scene spans to the real narration so they tile it gaplessly and verbatim.
 * @returns corrected narrationText[] (one per input scene, same order), or `null` if a scene's start could
 *          not be located (caller should fall back to the LLM output + repair path).
 */
export function retileToNarration(narration: string, sceneTexts: string[]): string[] | null {
  if (sceneTexts.length === 0) return null
  const { norm, map } = normalizeWithMap(narration)

  const rawStarts: number[] = []
  let normCursor = 0
  for (const t of sceneTexts) {
    const fullHead = normalizeWithMap(t).norm.trim()
    if (fullHead.length === 0) return null
    let at = -1
    for (const len of HEAD_LENS) {
      const head = fullHead.slice(0, len)
      if (head.length < len && len !== HEAD_LENS[HEAD_LENS.length - 1]) continue // text shorter than this head → try the next shorter
      at = norm.indexOf(head, normCursor)
      if (at !== -1) break
    }
    if (at === -1) return null // can't align this scene even with the shortest head → bail to the LLM path
    rawStarts.push(map[at]!)
    normCursor = at + 1
  }

  // Spans in RAW space: scene i covers [start_i, start_{i+1}); scene 1 absorbs any leading text (from 0),
  // the last scene runs to the end. A dropped span between two scenes is absorbed into the earlier one.
  const out: string[] = []
  for (let i = 0; i < rawStarts.length; i++) {
    const from = i === 0 ? 0 : rawStarts[i]!
    const to = i + 1 < rawStarts.length ? rawStarts[i + 1]! : narration.length
    if (to <= from) return null // out-of-order starts → not alignable, bail
    out.push(narration.slice(from, to))
  }
  return out
}
