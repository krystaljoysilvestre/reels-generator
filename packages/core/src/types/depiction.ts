// Depiction — HOW a real-world subject may be shown (see specs/depictive-fidelity.md).
//
// Sourcing a real photograph used to be one boolean on one entity kind: `policy.realPlaces && kind ===
// 'location'`. That conflated three questions a factual reel actually has to answer separately — WHAT kind of
// subject is this, MAY we depict it from a real image, and IS the real image allowed to be presented as
// itself. This module answers the last two once, up front, and hands the pipeline a single value to enforce.
//
// ── THREE MODES, THREE DIFFERENT TRUTH OBLIGATIONS ──────────────────────────────────────────────────────
//   generated        the model creates the depiction; no real image involved
//   reference_plate  a real image CONDITIONS a generated frame, and is never presented as authentic
//                    event imagery (historical reconstruction — the depictive-fidelity CARE tier)
//   archival_only    a real image is PRESENTED directly and never enters generation (genuine licensed
//                    archival media — the depictive-ethics floor's own carve-out)
//   identity_withheld a real PERSON we could not verify: no real image, and no INVENTED one either —
//                    the beat is carried by representative staging
//
// These are not degrees of one feature. Historical reconstruction and contemporary archival depiction make
// different claims to the viewer, so they get different mechanisms — which is why "real person support" is
// deliberately NOT one code path.
//
// PRECEDENCE: this sits UNDER the depictive-ethics floor (specs/depictive-ethics-floor.md), never beside it.
// A creator's Source Policy can widen narrative permission; it can never grant a depiction the floor forbids.

import { z } from 'zod'
import type { SourcePolicy } from './source-policy.js'

// What kind of real-world thing an entity denotes. Decided by the entity-source decider from the entity's
// NAME (its de-kebabed bible id) plus description — NOT from `kind`, which only distinguishes
// character/location/object and so cannot tell an eagle from a person or the Titanic from a cracked mirror.
export const SubjectClassSchema = z.enum([
  'place',
  'object',
  'animal',
  'human',
  'fictional', // invented — never sourced, whatever real name it may resemble
  'generic', // real but anonymous ("a bedroom", "a stray dog") — a real photo would not improve it
])
export type SubjectClass = z.infer<typeof SubjectClassSchema>

export const DepictionModeSchema = z.enum(['generated', 'reference_plate', 'archival_only', 'identity_withheld'])
export type DepictionMode = z.infer<typeof DepictionModeSchema>

// Why the mode is what it is. Recorded for audit: when a reel declines to depict someone, the reason has to
// be legible months later without re-running the classifier.
export const EligibilityReasonSchema = z.enum([
  'real_subject', // place/object/animal resolved and sourceable
  'verified_historical', // human, structurally verified long dead
  'living_or_recently_deceased', // human, identity verified, too recent for a conditioning plate
  'death_date_unverifiable', // human, identity verified, no usable P570
  'identity_unverified', // could not establish WHO this is — never sourced on any path
  'generic_subject', // real but anonymous
  'fictional_subject',
  'not_permitted', // the channel's Source Policy doesn't allow it
])
export type EligibilityReason = z.infer<typeof EligibilityReasonSchema>

export const DepictionRoutingSchema = z.object({
  subjectClass: SubjectClassSchema,
  depictionMode: DepictionModeSchema,
  eligibilityReason: EligibilityReasonSchema,
  query: z.string().default(''), // sourcing query when a real image is permitted; '' otherwise
})
export type DepictionRouting = z.infer<typeof DepictionRoutingSchema>

/**
 * Conservative depictive-fidelity boundary.
 *
 * This is NOT a copyright/public-domain calculation. Copyright duration and likeness/depictive ethics are
 * different axes, and the photograph's own term is unrelated to the subject's death — the Commons licence
 * allowlist in providers/wikimedia/source.ts is the copyright mechanism.
 *
 * This constant separates historical reconstruction from living/recent-person likeness treatment, and
 * nothing else. Do not read it as a legal conclusion.
 */
export const HUMAN_PLATE_MIN_YEARS_DEAD = 100

/**
 * Year-level eligibility. Wikidata P570 is frequently YEAR-precision only, so this compares calendar years
 * and never pretends to day accuracy on a safety gate. A null/absent death year is INELIGIBLE, not unknown.
 */
export function isHistoricallyEligible(deathYear: number | null | undefined, currentYear: number): boolean {
  if (typeof deathYear !== 'number' || !Number.isFinite(deathYear)) return false
  return deathYear <= currentYear - HUMAN_PLATE_MIN_YEARS_DEAD
}

/**
 * The human three-way, in one place. IDENTITY is verified before ELIGIBILITY, and the two fail to different
 * outcomes on purpose:
 *
 *   no identity anchor  → 'identity_withheld' no real image AND no invented one; representative staging
 *   identity, too recent → 'archival_only'    may be PRESENTED from a real photo, never conditioned on
 *   identity, long dead  → 'reference_plate'  may condition a reconstruction
 *
 * The first case is NOT 'generated'. That was the tempting answer and it is wrong: 'generated' mints an
 * ordinary plate, i.e. it INVENTS a face for a named real person and splices it into every scene — a
 * fabricated likeness, which is the harm this whole module exists to prevent. Observed live on 2026-08-12:
 * Marcel Duchamp failed identity verification and promptly received an invented committed look.
 *
 * Nor is it 'archival_only', which is the STRONGER claim ("this person may be presented from a real
 * photograph") and must never be reached by an identity we could not establish. Unverified identity gets its
 * own mode precisely because neither neighbour is safe: don't invent them, and don't source them either.
 */
export function depictionModeForHuman(args: {
  wikibaseItem: string | null | undefined
  deathYear: number | null | undefined
  currentYear: number
}): { depictionMode: DepictionMode; eligibilityReason: EligibilityReason } {
  if (!args.wikibaseItem) return { depictionMode: 'identity_withheld', eligibilityReason: 'identity_unverified' }
  if (isHistoricallyEligible(args.deathYear, args.currentYear)) {
    return { depictionMode: 'reference_plate', eligibilityReason: 'verified_historical' }
  }
  return {
    depictionMode: 'archival_only',
    eligibilityReason: typeof args.deathYear === 'number' ? 'living_or_recently_deceased' : 'death_date_unverifiable',
  }
}

// ── Provenance ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * Where a real image came from and — crucially — WHAT IT IS BEING USED FOR.
 *
 * `usage` is not decoration. A conditioning reference and a presented archival photograph make materially
 * different claims, and they have different rules: a conditioning plate MAY be transformed (a grayscale
 * archival portrait is colourised before it conditions colour scenes, or it produces a
 * grayscale-head-on-colour-body seam), while a presented archival photograph may NEVER be generatively
 * modified. Recording usage is what makes that invariant auditable instead of merely asserted.
 *
 * `sourceAssetKey` / `conditioningAssetKey` keep the same distinction in the bytes: without them, a
 * colourised plate would claim "this came from Wikimedia" while the pixels that actually conditioned the
 * scene were /edit output.
 *
 * Every field past `author` is optional so pre-existing jsonb (bible entities and channel entity_plates
 * written before this) parses unchanged.
 */
export const MediaOriginSchema = z.object({
  type: z.enum(['generated', 'sourced']),
  provider: z.string().optional(), // e.g. 'wikimedia'
  url: z.string().optional(), // the FILE / description page
  license: z.string().optional(), // e.g. 'CC BY-SA 4.0', 'Public domain'
  author: z.string().optional(),
  // Added with depictive fidelity beyond places:
  usage: z.enum(['conditioning_reference', 'presented_archival']).optional(),
  subjectClass: SubjectClassSchema.optional(),
  licenseUrl: z.string().optional(), // machine-readable deed (CC-BY compliance)
  articleUrl: z.string().optional(), // the Wikipedia article, distinct from the file page
  wikibaseItem: z.string().optional(), // Wikidata id — the identity anchor that permitted a human depiction
  deathYear: z.number().optional(), // the verified P570 year, recorded so eligibility is re-checkable
  sourceAssetKey: z.string().optional(), // untouched sourced bytes
  conditioningAssetKey: z.string().optional(), // what actually conditions scenes (= sourceAssetKey if untransformed)
  conditioningTransform: z.enum(['colorized']).optional(),
})
export type MediaOrigin = z.infer<typeof MediaOriginSchema>

/** True when this origin describes a real photograph PRESENTED as itself (not a conditioning input). */
export function isPresentedArchival(origin: MediaOrigin | null | undefined): boolean {
  return origin?.type === 'sourced' && origin.usage === 'presented_archival'
}

// ── Permission helpers ───────────────────────────────────────────────────────────────────────────────────
// Read policy through these, never by testing the raw fields. `realPlaces` is a HISTORICAL NAME: it has
// always meant "this reel may depict real-world subjects from real sources", and an object or animal rides
// exactly the permission a real place does. The stored field keeps its name so a FROZEN reel policy stays
// readable, but `policy.realPlaces && subjectClass === 'animal'` at a call site reads like a bug — so don't
// write it anywhere.

export function allowsRealWorldEntityPlates(policy: SourcePolicy): boolean {
  return policy.realPlaces
}

/** A conditioning plate for a long-dead figure needs BOTH narrative permission and structural eligibility. */
export function canUseHistoricalHumanPlate(policy: SourcePolicy, routing: Pick<DepictionRouting, 'depictionMode'>): boolean {
  return policy.realPeople !== 'none' && routing.depictionMode === 'reference_plate'
}

/** A presented archival photograph of a living/recent person. Identity was verified upstream. */
export function canUseArchivalHumanShot(policy: SourcePolicy, routing: Pick<DepictionRouting, 'depictionMode'>): boolean {
  return policy.realPeople !== 'none' && routing.depictionMode === 'archival_only'
}

// ── Invariant: an archival_only person's identity never reaches a generated prompt ───────────────────────
// Invariant 1 (no plate) stops CONDITIONING leakage. These stop TEXTUAL likeness generation, which is the
// other half and the one that actually failed in production on 2026-07-24: a scene prompt naming real
// officials rendered a fabricated press photo with no sourced reference involved at all.
//
// Pure and exported so the guarantee is unit-testable rather than buried in the render step.

/**
 * Name forms to look for and remove: the full de-kebabed name plus each token of 3+ characters, so a prompt
 * naming only the surname is caught too.
 *
 * Deliberately OVER-broad. Scrubbing a word that merely coincides with a name is a cosmetic loss the
 * positive restatement repairs; missing one produces a fabricated likeness of a real person.
 */
export function personNameVariants(entityId: string): string[] {
  const full = entityId.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')
  const tokens = full.split(/\s+/).filter((t) => t.length >= 3)
  return [...new Set([full, ...tokens])].filter(Boolean)
}

// Matches the name as a whole word, case-insensitively, including a possessive ("Rizal's").
const nameRe = (name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s|\u2019s)?\\b`, 'gi')

export function mentionsAny(text: string, names: readonly string[]): boolean {
  return names.some((n) => nameRe(n).test(text))
}

/** Remove every name form, then tidy the punctuation the removal leaves behind. */
export function scrubNames(text: string, names: readonly string[]): string {
  let out = text
  for (const n of names) out = out.replace(nameRe(n), '')
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])\s*([,.;:])/g, '$2')
    .replace(/^[\s,;:]+/, '')
    .trim()
}

/**
 * Last-resort staging when a rewrite cannot be trusted. Names nothing and nobody; carries the beat through
 * the setting and its objects. Written positively, per DESCRIBE PRESENCE, NOT ABSENCE — negation is the
 * weakest lever available to an image model, so "no faces" reliably produces faces.
 */
export const SAFE_REPRESENTATIVE_STAGING =
  'the setting itself, empty of identifiable people — documents and objects on a desk as physical things, an empty chair, a distant silhouetted figure far from camera'

// ── Disclosure ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * The burned on-screen media label, computed from what the reel ACTUALLY contains rather than from channel
 * configuration.
 *
 * This existed as a constant string ('Illustrated · based on documented sources') set whenever
 * storyMode === 'ebn'. Once a reel can contain a genuine archival photograph, that constant becomes a false
 * statement about real media — it would label a real photograph an illustration. Disclosure has to be a
 * property of the published frames, not of a channel flag.
 *
 * Returns '' for no label. A reel that is not evidence-backed keeps today's behaviour (no label): extending
 * disclosure to every channel is a separate product decision and is deliberately NOT made here.
 */
export function computeMediaDisclosure(args: {
  hasGeneratedScenes: boolean
  hasArchivalScenes: boolean
  isEvidenceBacked: boolean
}): string {
  if (!args.isEvidenceBacked) return ''
  const basis = 'based on documented sources'
  if (args.hasArchivalScenes && args.hasGeneratedScenes) return `Illustration + archival photographs · ${basis}`
  if (args.hasArchivalScenes) return `Archival photographs · ${basis}`
  return `Illustrated · ${basis}`
}
