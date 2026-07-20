// place-source.v1 — the two judgement calls around sourcing a REAL photo for a factual scene's location
// (see hypotheses/real-places.md). Both are deliberately conservative so we only ever attach a real photo
// when it genuinely helps and genuinely matches.

import { z } from 'zod'

export const PLACE_SOURCE_V1_VERSION = 'place-source.v1'

// (1) DECIDE — is this location a specific, real, NAMED place worth a real photo (a landmark, named building,
// named site), or a GENERIC setting (a bedroom, an office, "a street") a real photo would not improve? This
// is the impact≠coverage guard: a generic setting must NOT pull in a random real interior. Also produces the
// search query when sourceable.
export const PlaceSourceDecisionSchema = z.object({
  sourceable: z.boolean(),
  query: z.string().default(''), // Wikimedia Commons search query when sourceable; '' otherwise
  reason: z.string().default(''),
})

export function buildPlaceSourceDecidePrompt(name: string, description: string, region?: string): { system: string; userMessage: string } {
  const system = `You decide whether a documentary scene's LOCATION is a specific, real, NAMED place that has photographs — a landmark, a named building, a named historic site, a named natural feature — versus a GENERIC setting (a bedroom, an office, a street, "a forest", "a kitchen") that a real photo would NOT meaningfully improve.

You are given the location's NAME and a factual description. Judge primarily by the NAME: if it names a specific real place (e.g. "Paoay Church", "Tacoma Narrows Bridge"), it is sourceable even when the description only lists physical features. If the name is a generic noun ("Bedroom", "Office", "Street"), it is not.

Return sourceable=true ONLY for a specific, real, named place a viewer could recognise and that would plausibly have photos online. For anything generic, unnamed, or fictional, return sourceable=false — a real photo of a random such place would be wrong, not helpful.

When sourceable, write the best Wikimedia Commons search query for a clear photo of that place: its proper name${region ? ', including the country/region for disambiguation' : ''}. Keep it short, no quotes.`
  const userMessage = `Location name: "${name}"\nFactual description:\n"""${description}"""${region ? `\n\nRegion/country context: ${region}` : ''}\n\nReturn JSON: { "sourceable": boolean, "query": string, "reason": string }`
  return { system, userMessage }
}

// (2) VERIFY — does the SOURCED image (IMAGE 1, supplied by the caller) actually depict the described place?
// A FILTER against obvious mismatches, not a proof of correctness: it rejects a wrong subject / generic
// stand-in / map / logo / person, but cannot catch a wrong-but-similar place (the wrong cathedral). Below
// threshold → discard the source and fall back to a generated plate.
export const PlaceVerifySchema = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  note: z.string().default(''),
})

export function buildPlaceVerifyPrompt(name: string, description: string): { system: string; userMessage: string } {
  const system = `You verify whether a photograph depicts a specific named place. You are a strict FILTER against obvious mismatches: pass an image ONLY if it clearly shows the named place — the right kind of structure with matching distinctive features. Fail it if it is a different subject, a generic stand-in, a map, a diagram, a logo, a portrait/person, or clearly the wrong place. When unsure, fail (low confidence).`
  const userMessage = `Does IMAGE 1 depict "${name}"?\nFactual description:\n"""${description}"""\n\nReturn JSON: { "matches": boolean, "confidence": 0..1, "note": string }`
  return { system, userMessage }
}
