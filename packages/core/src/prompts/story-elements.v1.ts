// story-elements.v1 — the story-composition ontology: the dimensions a FINISHED story can be
// DESCRIBED along. A supporting asset for the PLANNER (like story-mechanics), used for structural
// variety + analytics. Complementary to mechanics: mechanics = WHY a story works (emotional
// psychology — dread, guilt, obsession); elements = WHAT PARTS/SHAPE it has.
//
// ── TWO PERMANENT INVARIANTS (see plan; enforced here + in the planner/writer) ──
// 1. The Writer writes from an IDEA, never from elements. Elements are planner metadata; they must
//    NOT reach the Writer prompt unless a future experiment validates it. If they do, the beat-sheet
//    stage the whole design avoided has been rebuilt.
// 2. Story quality DOMINATES element diversity. Elements prevent ACCIDENTAL structural convergence,
//    they don't maximize novelty. A "diverse" story that reads weird has failed.
//
// Authored under .claude/skills/unbiased-design: describe-don't-prescribe — palettes are examples to
// reason from, never menus or quotas; a dimension may be empty. HARD CAP ~10 dimensions (anti-bloat).
// Versioned source code: ANY edit bumps STORY_ELEMENTS_V1_VERSION (rides into the planner version).

import { z } from 'zod'
import type { GenreModule } from './scenes.v1.js'

export const STORY_ELEMENTS_V1_VERSION = 'elements.v1.6'

// The labels the planner records about the idea it ALREADY committed to. Short free-text strings —
// palettes below are guidance, not enums, so a planner can always name its own value. `pov` and
// `anchor` optional (pov is often implied by structure; anchor is empty for many non-horror stories).
export const StoryElementsSchema = z.object({
  structure: z.string().min(1), // build archetype (story-angles vocabulary)
  pov: z.string().optional(), // narrative vantage — inferred from structure when structure implies one
  role: z.string().min(1), // the protagonist's narrative role
  setting: z.string().min(1), // the MICRO-location (bathroom, hallway, a bus seat) — not the macro place
  anchor: z.string().optional(), // the ordinary thing/routine the story contaminates or hangs on
  trigger: z.string().min(1), // the inciting detail/anomaly that starts it
  turn: z.string().min(1), // the reveal/reversal TYPE
  aftereffect: z.string().min(1), // what the viewer carries away
  tensionCurve: z.string().min(1), // the pacing shape only (emotion belongs to mechanics)
  // The temperature the idea commits to, named in the genre writer's own register vocabulary
  // (e.g. horror: "kinetic shock"). Optional — genres without registers (general) leave it blank.
  // Recorded for the anti-sameness rotation + performance-by-register analytics, and passed to the
  // Writer (committed telling temperature) and the voice-delivery envelope downstream.
  register: z.string().optional(),
})
export type StoryElements = z.infer<typeof StoryElementsSchema>

// One-line description of each dimension, shown to the planner. Genre-neutral names; genre-specific
// FLAVOR lives in the palettes below.
const DIMENSION_DESCRIPTIONS: Array<{ key: keyof StoryElements; desc: string }> = [
  { key: 'structure', desc: 'the build archetype — how the telling is shaped' },
  { key: 'pov', desc: 'narrative vantage; leave blank if your structure already implies one' },
  { key: 'role', desc: "the protagonist's role in life (who this happens to) — same event, different person = a different story" },
  { key: 'setting', desc: 'the MICRO-location it happens in (a specific room/place), not the general building' },
  { key: 'anchor', desc: 'the ordinary thing or routine the story contaminates or hangs on; blank if the story has none' },
  { key: 'trigger', desc: 'the inciting detail that sets it off' },
  { key: 'turn', desc: 'the TYPE of reveal/reversal at the peak' },
  { key: 'aftereffect', desc: 'what the viewer is left carrying' },
  { key: 'tensionCurve', desc: 'the pacing shape only — where it rises, holds, releases (not the emotion)' },
  { key: 'register', desc: "the temperature the idea commits to — ONE of the writer's registers, in its own words; blank if none fits" },
]

// Per-dimension, per-genre palettes: suggestive vocabularies to reason from. `pov` shares cross-genre
// values; `structure` = a neutral shared base (story-angles vocabulary) plus per-genre additions, so
// no genre inherits another genre's native shapes as its examples; horror `turn` reuses the analyzer's
// contradiction vocabulary so elements + reveal system speak one language.
// Empty array = no suggestions for that genre → the planner names its own. General stays minimal.
//
// CULTURE-NEUTRAL BY DESIGN: palette values are deliberately generic (a corner store, a night-shift
// worker) — the channel's own culture/texture enters via niche, world bible, language, and few-shots,
// never baked into these shared assets. renderElementPalette tells the planner to translate.
type Palette = Partial<Record<keyof StoryElements, string[]>>

const BASE_STRUCTURE_VALUES = ['cold_open', 'witness_account', 'mundane_wrong', 'second_person', 'outsider_pov', 'artifact']
const POV_VALUES = ['first-person', 'witness', 'outsider', 'second-person', 'retold']

const PALETTES: Record<GenreModule, Palette> = {
  horror: {
    // Examples deliberately span all four registers (quiet dread / coiled suspense / kinetic shock /
    // folk uncanny) so the planning fuel doesn't gravitate to domestic dread alone.
    structure: ['slow_dread', 'retold_legend', 'pursuit'],
    role: ['a student', 'a night-shift worker', 'a nurse', 'a security guard', 'a delivery rider', 'a shopkeeper closing alone', 'a late-night driver', 'a live-in caretaker', 'someone home after years away', 'a new tenant', 'the last passenger on the last trip'],
    setting: ['a bathroom', 'a hallway', 'an elevator', 'a parking basement', 'the last ride home', 'a kitchen at 3AM', 'a stairwell', 'a childhood bedroom in the old family house', 'a rooftop', 'a corner store at closing', 'an empty road between towns', 'a footbridge at night'],
    anchor: ['a mirror', 'earphones', 'a baby monitor', 'the stairs', 'a group-chat notification', 'a helmet', 'the CCTV feed', 'a childhood photo', 'the hum of an appliance at night', 'a bedtime routine', 'an elder\'s old warning'],
    trigger: ['a sound with no source', 'an object moved since last night', 'a reply that shouldn\'t come', 'a reflection that\'s wrong', 'wet footprints', 'a smell', 'a name being called', 'a second set of footsteps that stops when yours do', 'headlights taking every turn you take', 'a rule you broke without knowing it was one', 'a warning given one day too late'],
    // Reuse the analyzer's contradiction taxonomy (see scenes.v1 REVEAL rules).
    turn: ['spatial contradiction', 'identity contradiction', 'temporal contradiction', 'causal contradiction', 'behavioral contradiction', 'moral contradiction'],
    aftereffect: ['a contaminated routine', 'a new rule to live by', 'lingering uncertainty', 'an irreversible loss', 'a thing you can never look at the same way'],
    tensionCurve: ['calm→unease→dread→still', 'dread-from-line-one, sustained', 'quiet→quiet→sudden→cut', 'slow domestic build→late detonation', 'tightening loop→near-miss→turn', 'warning→violation→the price collected', 'over in seconds→the long after'],
  },
  drama: {
    structure: ['the_last_time', 'unsent_message'],
    role: ['a daughter', 'an estranged brother', 'a widow', 'a breadwinner', 'a former lover', 'a caregiver', 'a father who left', 'an eldest child who raised the rest', 'a best friend who knew first', 'a parent home for good after years working away'],
    setting: ['a hospital waiting room', 'the family dinner table', 'a childhood bedroom', 'a bus terminal', 'a wake', 'a rented apartment', 'the old house being sold', 'a graduation missed', 'the airport arrivals gate'],
    anchor: ['a kept receipt', 'the plate still set', 'an unwashed mug', 'the ringtone never changed', 'a name still first in the contacts', 'the jacket on its hook', 'a half of everything (the other cup, the other chair)', 'an old voicemail never deleted'],
    trigger: ['a returning face', 'an unsent message found', 'a diagnosis', 'an inheritance', 'a photograph', 'a phone call after years', 'the last box packed', 'a debt discovered after the funeral'],
    turn: ['recognition', 'a hidden sacrifice revealed', 'a misunderstanding uncovered', 'a truth arriving too late', 'the roles reversed (the child becomes the parent)', 'what the silence was protecting', 'the thing finally said that can\'t be unsaid'],
    aftereffect: ['a permanent loss', 'a reconciliation that costs something', 'an unanswered "what if"', 'forgiveness that comes too late', 'a habit kept in someone\'s memory', 'a goodbye done right, and how much it cost'],
    tensionCurve: ['restraint→swell→quiet break', 'warm→crack→ache', 'steady→reveal→release', 'ordinary day→one sentence→everything after', 'held civility→rupture→what\'s left standing'],
  },
  commentary: {
    structure: ['claim_first', 'case_dissection'],
    role: ['someone who used to believe the opposite', 'an insider', 'a frustrated regular person', 'a former true-believer'],
    setting: ['no scene — direct address', 'a specific incident being dissected'],
    trigger: ['a viral take', 'a double standard spotted', 'a personal experience that broke the belief'],
    turn: ['the concession that flips into the knife', 'the receipt nobody expected', 'naming the unsaid'],
    aftereffect: ['a side taken', 'a comfortable belief made uncomfortable', 'a line worth quoting'],
    tensionCurve: ['claim→concede→turn→land', 'escalating certainty'],
  },
  reddit_story: {
    // Subject breadth is huge — the format hosts them all. Shapes: am_i_wrong, revenge, malicious
    // compliance, TIFU, discovery (cheating/betrayal), creepy encounter (reddit-horror), confession.
    structure: ['am_i_wrong_post', 'petty_revenge', 'malicious_compliance', 'tifu_confession', 'the_discovery', 'creepy_encounter', 'anonymous_confession'],
    role: ['the poster asking who\'s wrong', 'the one who got even', 'the rule-follower', 'the fool who owns it', 'the one who found out', 'the partner', 'the sibling', 'the roommate', 'the coworker', 'the in-law', 'the neighbor'],
    // Range is the point — subjects span relationships, workplace, family, revenge, horror, legal,
    // neighbors, weddings; stakes span petty (a group chat) to life-sized (a betrayal, a will). Pick
    // the scale and subject THIS story earns; don't default to office/family every time.
    setting: ['a group chat', 'the office', 'a marriage or relationship', 'a family reunion', 'a shared apartment', 'a wedding', 'a workplace with a dumb rule', 'a subdivision with an HOA-type body', 'a wake or funeral', 'a hospital ward', 'a lawyer\'s or notary\'s office', 'a bank or lending office', 'an online marketplace or dating-app deal', 'a rented place with the neighbors from hell', 'an old house / an attic at night', 'a family land or inheritance dispute'],
    trigger: ['a message screenshot', 'a partner\'s phone lighting up at 2AM', 'a petty rule broken', 'money owed', 'a boundary crossed', 'a dumb order given', 'a slight that had it coming', 'a small lie that unravels', 'a secret found', 'an inheritance or a will', 'a paternity or parentage reveal', 'a life\'s savings on the line', 'an eviction or a forged signature', 'a stalker or someone watching', 'something wrong found at home'],
    turn: ['the reframe', 'the comeuppance landing', 'the rule backfiring on its maker', 'the disaster the narrator caused', 'the gut-punch detail found in hindsight', 'the detail the poster reveals about themselves', 'the betrayal that can never be undone', 'who was really behind it all along', 'the detail that can\'t be explained away'],
    aftereffect: ['a side taken', 'satisfaction / justice served', 'a "you\'re the one who\'s wrong" gut-punch', 'an unresolved judgment thrown to the viewer', 'a chill that doesn\'t resolve', 'a secret finally said out loud'],
    tensionCurve: ['calm setup→petty escalation→breaking point', 'reasonable→unreasonable→verdict', 'wrong done→the plan→the payoff', 'dumb order→literal obedience→backfire', 'normal→one wrong detail→it won\'t explain away'],
  },
  comedy: {
    structure: ['escalating_spiral', 'deadpan_report'],
    role: ['the overconfident one', 'the deadpan narrator', 'the one thing keeps happening to', 'the straight man', 'the relative with no filter', 'the new hire who believed the office lie', 'the group\'s designated responsible one'],
    setting: ['a wedding', 'a job interview', 'a family group chat', 'public transport at rush hour', 'an office party', 'a neighborhood street festival', 'the returns counter', 'a video call with the camera accidentally on'],
    anchor: ['the group chat', 'the office microwave', 'a shared Google sheet', 'the last slice everyone\'s pretending not to want', 'an autocorrected text', 'the "wrong send"', 'a loyalty card one stamp away'],
    trigger: ['a tiny lie that grows', 'a misread situation', 'one wrong assumption', 'a plan that overcommits', 'a rule followed far too literally', 'two events double-booked'],
    turn: ['expectation subverted', 'a callback detonating', 'escalation reaching its absurd logical end', 'the innocent explanation that is somehow worse', 'the wrong person having heard everything'],
    aftereffect: ['a punchline that recontextualizes it all', 'a "this is us" recognition', 'a groan-laugh', 'a new family legend nobody is allowed to forget'],
    tensionCurve: ['setup→build→snap', 'straight→straighter→break', 'calm→spiral→deadpan landing'],
  },
  informational: {
    structure: ['question_first', 'myth_takedown'],
    // No "person it happened to" role: both probes showed it luring the planner into fake
    // first-person autobiography — the explainer speaks as the explainer (see the identity taboo).
    role: ['the curious skeptic', 'someone who just found out', 'the friend who explains things well'],
    setting: ['no scene — direct explanation', 'anchored on one vivid case'],
    trigger: ['a surprising fact', 'a common misconception', 'a "wait, why?" question'],
    turn: ['the misconception flip', 'the felt-scale reveal', 'the so-what that lands'],
    aftereffect: ['an idea the viewer can re-explain', 'a changed assumption'],
    tensionCurve: ['hook→build→payoff'],
  },
  lifestyle: {
    structure: ['payoff_first', 'day_in_the_life'],
    role: ['someone who finally tried it', 'the practitioner sharing the real way', 'a beginner on day one', 'the friend who always knows the spot'],
    setting: ['a kitchen', 'a market', 'a travel spot', 'a home corner'],
    trigger: ['the payoff moment shown first', 'an insider secret', 'a sensory hook'],
    turn: ['the reveal of how it\'s really done', 'the attainable first step'],
    aftereffect: ['a want + a belief it\'s doable', 'a saved idea'],
    tensionCurve: ['payoff→how→invitation'],
  },
  general: {},
}

// pov is cross-genre; structure = neutral shared base + the genre's own native shapes.
function paletteFor(genre: GenreModule, key: keyof StoryElements): string[] {
  if (key === 'structure') return [...BASE_STRUCTURE_VALUES, ...(PALETTES[genre]?.structure ?? [])]
  if (key === 'pov') return POV_VALUES
  return PALETTES[genre]?.[key] ?? []
}

// Prompt fragment: the element palette for this genre. Describe-don't-prescribe framing.
export function renderElementPalette(genre: GenreModule): string {
  const lines = DIMENSION_DESCRIPTIONS.map(({ key, desc }) => {
    const vals = paletteFor(genre, key)
    const egs = vals.length ? ` — e.g. ${vals.join(', ')}` : ''
    return `- ${key}: ${desc}${egs}`
  })
  return `STORY ELEMENTS — the dimensions a finished story on this channel can be DESCRIBED along. These are labels for the idea you commit to, not a form to fill before deciding, and NOT instructions to the writer. Examples are a palette to reason from — pick what fits THIS story or name your own; a dimension may be empty (especially anchor/pov). Never pick a value just to fill a slot.
The examples are deliberately culture-neutral: translate them into THIS channel's own world — its places, jobs, objects, and habits, drawn from the niche, the world bible, and the language — never paste them as-is.
${lines.join('\n')}`
}

// The four highest-signal, always-present dimensions. role + anchor ride in the differ-rule text
// (not this hard key) so their nullability/optionality can't break dedup. Normalized: lowercased,
// trimmed, non-alphanumerics collapsed — so "CR/bathroom" and "cr bathroom" collide as intended.
export function elementFingerprint(el: Pick<StoryElements, 'structure' | 'setting' | 'trigger' | 'turn'>): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return [el.structure, el.setting, el.trigger, el.turn].map(norm).join(' | ')
}

// Prompt fragment: what the channel has already used recently, so the planner can steer clear.
export function formatRecentElements(recent: StoryElements[]): string {
  if (recent.length === 0) return '(nothing yet — the catalog is young)'
  const fps = recent.map((e) => `  • ${elementFingerprint(e)}`)
  const roles = [...new Set(recent.map((e) => e.role.trim()).filter(Boolean))]
  const anchors = [...new Set(recent.map((e) => e.anchor?.trim()).filter((s): s is string => !!s))]
  const registers = [...new Set(recent.map((e) => e.register?.trim()).filter((s): s is string => !!s))]
  return [
    'Recent fingerprints (structure | setting | trigger | turn):',
    ...fps,
    roles.length ? `Recent roles: ${roles.join(', ')}` : '',
    anchors.length ? `Recent anchors: ${anchors.join(', ')}` : '',
    registers.length ? `Recent registers: ${registers.join(', ')} — a long streak in one register is its own kind of sameness; vary when quality allows.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
