// story-mechanics.v1 — the emotional-patterns library: WHY stories work on a viewer, per genre.
// A supporting asset, not a pipeline stage: fed to the PLANNER's internal idea exploration as a
// palette to draw from and COMBINE. The Writer never sees mechanics (mechanics are for planning;
// the Writer writes someone who lived it).
//
// Versioned source code: ANY edit must bump STORY_MECHANICS_V1_VERSION (concatenated into the
// Planner's version string → busts its inputHash). Mechanic `id`s are STABLE — they get persisted
// in plans/step outputs and counted later; rename the `name`, never the `id`.
//
// Authored under .claude/skills/unbiased-design: this is context to reason from, never a checklist.
// The render explicitly tells the model a story may want none of these.

import type { GenreModule } from './scenes.v1.js'

export const STORY_MECHANICS_V1_VERSION = 'mechanics.v1.5'

export interface StoryMechanic {
  /** stable id — persisted in plans and counted across the catalog; never rename */
  id: string
  name: string
  /** one line: the effect on the VIEWER, not a definition */
  why: string
}

export const STORY_MECHANICS: Record<GenreModule, StoryMechanic[]> = {
  horror: [
    { id: 'contamination', name: 'Contamination', why: 'An ordinary thing (a mirror, a knock, a routine) becomes permanently unsafe — the viewer takes the fear home because they own the thing too.' },
    { id: 'false_safety', name: 'False safety', why: 'A reasonable explanation lets everyone relax — so the truth, when it comes, has no defense left to break through.' },
    { id: 'delayed_realization', name: 'Delayed realization', why: 'The viewer (or narrator) had the evidence all along and misread it; the horror detonates in hindsight, which is where it lives longest.' },
    { id: 'inevitability', name: 'Inevitability', why: 'Once a rule is felt ("it comes closer each night"), the viewer dreads each beat BEFORE it happens — dread beats surprise.' },
    { id: 'irreversible_choice', name: 'Irreversible choice', why: 'The narrator did something small that cannot be undone (answered, looked, let it in) — guilt fuses with fear.' },
    { id: 'occupied_absence', name: 'Occupied absence', why: 'Evidence of a presence where there can be none (footprints, a reply, a closed door) — the mind fills the gap with something worse than any figure.' },
  ],
  drama: [
    { id: 'unmet_need', name: 'Unmet need', why: 'Someone wants one simple thing they can never ask for — the viewer aches because they recognize the wanting.' },
    { id: 'sacrifice', name: 'Hidden sacrifice', why: 'What one person quietly gave up is revealed late — love proven by what was never said.' },
    { id: 'misunderstanding', name: 'Load-bearing misunderstanding', why: 'Two people each hold half the truth; the viewer holds both halves and can\'t hand them over.' },
    { id: 'irreversible_loss', name: 'Irreversible loss', why: 'The chance to say it passes for good — the viewer feels the door close on their own unsaid things.' },
    { id: 'too_late_truth', name: 'Truth arriving too late', why: 'Understanding lands exactly when it can no longer help — the most human timing there is.' },
    { id: 'object_griefcarrier', name: 'The object that carries it', why: 'A mundane thing (a kept receipt, an unwashed mug) holds the whole feeling — the viewer cries at an object because naming the grief head-on would bounce off.' },
    { id: 'overdue_reckoning', name: 'The overdue reckoning', why: 'The thing two people spent years not saying finally gets said out loud — the viewer braces, because it cannot be unsaid and both of them know it.' },
    { id: 'impossible_choice', name: 'The impossible choice', why: 'Loyalty to one person costs another — whichever way they choose, someone they love loses; the viewer argues with the choice because there is no right one.' },
    { id: 'earned_goodbye', name: 'The earned goodbye', why: 'Letting go done well — the loss is real but so is the grace; the viewer leaves sad and warm at once, and that mix is what gets shared.' },
  ],
  commentary: [
    { id: 'sacred_cow', name: 'Sacred cow', why: 'Challenging something the audience loves forces engagement — agreement or fury, never a scroll-past.' },
    { id: 'double_standard', name: 'Double standard', why: 'Holding two accepted things side by side until the contradiction is undeniable — the viewer feels caught.' },
    { id: 'receipts', name: 'Receipts', why: 'One concrete example the viewer recognizes as true from their own experience does what ten vague claims can\'t — it converts the skeptical.' },
    { id: 'concede_then_turn', name: 'Concede, then turn', why: 'Granting the other side\'s best point first earns the ear for the knife that follows.' },
    { id: 'name_the_unsaid', name: 'Naming the unsaid', why: 'Saying the thing everyone thinks but won\'t say — relief and outrage in the same beat.' },
  ],
  reddit_story: [
    { id: 'authenticity', name: 'The authenticity spell', why: 'The whole appeal is "did this actually happen?" — the feeling of overhearing a real person. Ordinary, over-specific detail no one would invent earns the belief; the suspense is who is telling the truth, not what happens next. Break the spell (sound scripted, polished, literary) and the genre dies.' },
    { id: 'righteous_anger', name: 'Clear injustice', why: 'Someone is wronged so plainly the viewer gets angry ON THEIR behalf — righteous anger is the most shareable emotion on the platform; a neutral situation nobody spreads.' },
    { id: 'comeuppance', name: 'Comeuppance', why: 'The wrongdoer gets exactly what they earned — no more — and the viewer stays to the last second for it; the payoff (revenge landed, rule backfired, karma collected) is why they share.' },
    { id: 'real_consequence', name: 'Real consequence', why: 'Something that cannot be undone is on the line — a marriage, years of savings, a job, a sibling bond severed for good, a trust that can never be rebuilt. Weight is what separates a story you judge from one you forget; the biggest posts pair a tiny mundane detail with a life-sized stake.' },
    { id: 'mundane_stakes', name: 'Mundane texture', why: 'Names, exact amounts, timelines, the specific object — concrete, boring detail is what makes it BELIEVABLE. Believability is texture, not size: what is AT STAKE can be a parking spot OR a life, and the texture works the same either way. Never shrink a story to stay "relatable"; let it be as big as it honestly is.' },
    { id: 'self_incrimination', name: 'Accidental self-incrimination', why: 'The narrator reveals their own fault without noticing — the viewer trusts a confessor who isn\'t clean, and it\'s what makes an "am I wrong?" genuinely arguable.' },
    { id: 'escalation_ladder', name: 'Petty escalation', why: 'Each retaliation is one notch too far — the viewer keeps watching to see where sanity breaks.' },
    { id: 'moral_split', name: 'Genuine moral split', why: 'Both sides are half right — the comment section becomes the second half of the story.' },
    { id: 'the_update', name: 'The update', why: 'New information reframes the whole account — the viewer re-reads their own judgment.' },
  ],
  comedy: [
    { id: 'expectation_subversion', name: 'Expectation subversion', why: 'The setup promises one ending; the punchline delivers a different, retroactively obvious one — the gap is the laugh.' },
    { id: 'logical_escalation', name: 'Logical escalation', why: 'Each step is absurd but follows strictly from the last — commitment to the logic is what makes it funny.' },
    { id: 'callback', name: 'Callback', why: 'A planted detail returns at the worst moment — the audience feels smart for catching it.' },
    { id: 'deadpan_contrast', name: 'Deadpan contrast', why: 'Insane events, flat delivery — the narrator\'s seriousness does the laughing for the viewer.' },
    { id: 'hyper_specificity', name: 'Hyper-specificity', why: '"A 2003 Nokia in a ziplock bag" is funny where "an old phone" is dead — precision reads as truth.' },
    { id: 'the_tag', name: 'The tag', why: 'One more line after the punch — smaller, drier — that makes the joke land twice and hands the viewer the quote they\'ll repeat.' },
  ],
  informational: [
    { id: 'curiosity_gap', name: 'Curiosity gap', why: 'A question the viewer suddenly NEEDS answered — attention held by an open loop, not a promise of facts.' },
    { id: 'misconception_flip', name: 'Misconception flip', why: 'Colliding with what the viewer thought they knew — being corrected is memorable; being lectured isn\'t.' },
    { id: 'felt_scale', name: 'Felt scale', why: 'A number translated into a scene ("that\'s every seat in the country\'s biggest stadium, twice") — magnitude experienced, not stated.' },
    { id: 'one_vivid_case', name: 'One vivid case', why: 'A single concrete story carries the general truth better than three thin examples.' },
    { id: 'so_what', name: 'The so-what', why: 'Connecting the fact to the viewer\'s own life — knowledge that lands as relevance gets retold.' },
  ],
  lifestyle: [
    { id: 'payoff_first', name: 'Payoff first', why: 'Leading with the finished moment (the pull-apart, the summit view) — desire first, journey second.' },
    { id: 'insider_secret', name: 'Insider secret', why: 'The detail only a practitioner knows — the viewer feels let into something.' },
    { id: 'sensory_anchor', name: 'Sensory anchor', why: 'One texture, sound, or first-taste moment rendered exactly — the body responds before the mind.' },
    { id: 'attainability', name: 'Attainability', why: 'A visible first step turns envy into intention — saves become attempts.' },
    { id: 'honest_cost', name: 'The honest cost', why: 'Naming what it really takes (the time, the mess, the failed first try) — candor converts aspiration into trust.' },
  ],
  general: [],
}

// Render the genre's mechanics for the PLANNER. Explicitly not a checklist: combining is where the
// interesting stories live, and "none of these" is a valid answer.
export function renderMechanics(genre: GenreModule): string {
  const list = STORY_MECHANICS[genre]
  if (list.length === 0) return ''
  return `WHY STORIES LIKE THIS WORK — mechanics you can draw from (each names the effect on the viewer):
${list.map((m) => `- ${m.name} (${m.id}): ${m.why}`).join('\n')}
These are a palette, never a checklist. The strongest ideas usually come from a COMBINATION of two or three interacting mechanics — but pick only what THIS story wants, and a great premise may use none of them.`
}
