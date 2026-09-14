import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stories, reels, pipelineSteps } from '@reels/db'
import { attachSpend, llmCall, spendFromError } from '@reels/providers'
import { DEFAULT_SOURCE_POLICY, SourcePolicySchema, StoryBibleSchema, outroTailMs } from '@reels/core'
import { generateStory } from './generate-story.js'
import { analyzeStory } from './analyze-story.js'
import { runEndingRepair } from './ending-repair.js'
import { routeDepiction } from '../depiction-routing.js'
import type { CostSink } from '../harness.js'
import type * as DbModule from '@reels/db'
import type * as ProvidersModule from '@reels/providers'

type StepRow = { status: string; inputHash: string; finishedAt: Date; output: unknown }
type StoryRow = { id: string; channelId: string; title: string; body: string; [key: string]: unknown }
type FixtureReel = { id: string; channelId: string; storyId: string | null; status: string; seedIdea: string; genreCategory: string; sourcePolicy: unknown; dossier?: string; [key: string]: unknown }
const state = vi.hoisted(() => ({
  db: null as unknown,
  reel: null as unknown as FixtureReel,
  channel: {} as Record<string, unknown>,
  storyRows: new Map<string, StoryRow>(),
  step: null as StepRow | null,
  rejectionRows: [] as Array<{ createdAt: Date; reasonCode: string; note: string }>,
  foreignStoryReel: null as { id: string } | null,
  failPersistence: false,
  spent: 0,
  llm: vi.fn(),
}))

vi.mock('@reels/db', async (importOriginal) => ({
  ...await importOriginal<typeof DbModule>(),
  getDb: () => state.db,
}))
vi.mock('@reels/providers', async (importOriginal) => ({
  ...await importOriginal<typeof ProvidersModule>(),
  llmCall: state.llm,
}))
// Exercise production prompt assembly, sequencing, error handling and persistence. Only the provider,
// database transport and already-tested harness ledger/cache are replaced; no paid calls or DB needed.
vi.mock('../harness.js', () => ({
  runStep: async (
    ctx: { inputHash: string },
    run: (cost: CostSink) => Promise<{ output: unknown; costCents: number }>,
  ) => {
    if (state.step?.status === 'done' && state.step.inputHash === ctx.inputHash) {
      return { output: state.step.output, skipped: true, costCents: 0 }
    }
    let total = 0
    const sink: CostSink = { add: (amount) => { total += amount }, get total() { return total } }
    try {
      const result = await run(sink)
      state.spent += result.costCents
      state.step = { status: 'done', inputHash: ctx.inputHash, finishedAt: new Date(), output: result.output }
      return { ...result, skipped: false }
    } catch (error) {
      state.spent += total + spendFromError(error)
      throw error
    }
  },
}))

function makeDb() {
  const db = {
    query: {
      channels: { findFirst: async () => state.channel },
      reels: { findFirst: async (query?: { columns?: { id?: boolean } }) => query?.columns?.id ? state.foreignStoryReel : state.reel },
      stories: { findMany: async () => [], findFirst: async (query?: { columns?: { id?: boolean } }) => {
        const id = query?.columns?.id ? (state.step?.output as { winnerStoryId?: string } | undefined)?.winnerStoryId : state.reel.storyId
        return id ? state.storyRows.get(id) : undefined
      } },
      rejections: { findMany: async () => state.rejectionRows },
      pipelineSteps: { findFirst: async () => state.step },
    },
    select: (fields: Record<string, unknown>) => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: async () => 'value' in fields ? [{ value: state.storyRows.size }] : [],
      }
      return query
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === reels) Object.assign(state.reel, values)
          else if (table === pipelineSteps && state.step) Object.assign(state.step, values)
          else throw new Error('Unexpected update in fixture')
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: StoryRow) => ({
        onConflictDoNothing: async () => {
          if (table !== stories) throw new Error('Unexpected insert in fixture')
          if (!state.storyRows.has(values.id)) state.storyRows.set(values.id, structuredClone(values))
        },
      }),
    }),
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
      if (state.failPersistence) {
        state.failPersistence = false
        throw new Error('Injected failure after completed step, before story linkage')
      }
      return run(db)
    },
  }
  return db
}

const story = {
  title: 'The archive door', language: 'english',
  narration: 'The letter arrived.\nShe opened the archive.\nHer own signature waited inside.\nShe finally told her sister.',
  peakMoment: 'Her own signature waited inside.',
  logline: 'A letter makes her confront a promise.', subgenreTags: ['family'], newCanon: [],
}
const plan = {
  premise: 'A letter about Balete Drive arrives.', conflict: 'She hid the letter.', escalation: 'Her sister arrives.',
  twist: 'She signed it.', ending: 'She tells her sister.', emotionalDestination: 'release',
  hookPromise: 'Who signed the letter?', viewerTransformation: { before: 'She is innocent.', after: 'She signed it.' },
  logline: 'A promise returns.', whyThisStory: 'A specific promise.', mechanics: [], elements: { structure: 'confession', register: 'subdued' },
}
const pass = { pass: true, reason: 'The story earns its change.', rewriteCanFix: true, essence: { pass: true, reason: 'The change is clear.' } }
const cleanFidelity = { issues: [], summary: 'Supported.' }
const facts = [{ id: 'F1', kind: 'DIRECT', value: 'The archive opened in 1900.', stance: 'FACT', weight: 'Critical', source: ['ARCHIVE'], derived_from: [] }]
const claims = [{ id: 'C1', order: 1, purpose: 'Establish the opening.', evidence: ['F1'] }]
const audit = () => state.step!.output as {
  winnerStoryId: string; winner: typeof story; plannerStatus: string;
  gate: { status: string; verdicts: typeof pass[] }; ebn: { citationMap: unknown[] }; plan: typeof plan;
}
const promptText = (index: number) => {
  const call = vi.mocked(llmCall).mock.calls[index]![0]
  return `${call.system}\n${call.messages.map((message) => message.content).join('\n')}`
}
function queue(...results: unknown[]) {
  for (const result of results) {
    if (result instanceof Error) state.llm.mockRejectedValueOnce(result)
    else state.llm.mockResolvedValueOnce({ data: result, costCents: 1, inputHash: 'provider-fixture' })
  }
}
function queueStandard() {
  const refinement = { narration: story.narration, peakMoment: story.peakMoment }
  queue(plan, story, refinement, refinement, pass)
}
function evidenceMode() {
  state.reel.sourcePolicy = SourcePolicySchema.parse({ realEvents: true, evidenceRequired: true, invention: 'none' })
  state.reel.dossier = 'ARCHIVE: The archive opened in 1900.'
  state.channel.storyMode = 'ebn'
}
function citedDraft(words: number) {
  const narration = Array.from({ length: words }, (_, index) => index === words - 1 ? 'opened.' : 'archive').join(' ')
  return { title: story.title, logline: story.logline, peakSentence: narration, narrative: [{ claimId: 'C1', sentences: [{ text: narration, factIds: ['F1'] }] }] }
}
function targetWords() {
  return Math.round((Number(state.channel.targetSeconds) - outroTailMs(state.reel.genreCategory) / 1000) * 2.5)
}

beforeEach(() => {
  vi.stubEnv('STORY_PLAN_GATE', '')
  vi.stubEnv('STORY_FINISHING_QA', '')
  vi.stubEnv('STORY_ENDING_REPAIR', '')
  state.llm.mockReset()
  state.llm.mockImplementation(() => { throw new Error('Unexpected paid call after fixture responses exhausted') })
  state.channel = {
    id: 'channel-1', name: 'Archive stories', nicheDescription: 'Stories of promises and places',
    worldBible: { region: 'Philippines', era: 'present' }, toneConfig: {}, targetSeconds: 75,
    tasteRubric: null, editorialPrinciples: 'Preserve ambiguity; never announce a moral.',
    genreCategory: 'horror', narrativeStyle: 'oral_storytelling', narrativeVoice: 'conversational',
    styleInfluence: 'medium', storyMode: 'standard', sourcePolicy: DEFAULT_SOURCE_POLICY,
  }
  state.reel = { id: 'reel-1', channelId: 'channel-1', storyId: null, status: 'drafting', seedIdea: 'A promise on Balete Drive', genreCategory: 'horror', sourcePolicy: DEFAULT_SOURCE_POLICY }
  state.storyRows.clear()
  state.step = null
  state.spent = 0
  state.rejectionRows = []
  state.foreignStoryReel = null
  state.failPersistence = false
  state.db = makeDb()
})
afterEach(() => vi.unstubAllEnvs())

describe('generateStory production orchestration', () => {
  it('recovers a regeneration after step completion without re-paying or retaining the rejected story', async () => {
    state.storyRows.set('old-story', { id: 'old-story', channelId: 'channel-1', title: 'Rejected', body: 'The rejected story.' })
    state.reel.storyId = 'old-story'
    state.rejectionRows = [{ createdAt: new Date(0), reasonCode: 'other', note: 'Use the promised subject.' }]
    queueStandard()
    state.failPersistence = true
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow('Injected failure')
    const expectedId = audit().winnerStoryId
    expect(expectedId).not.toBe('old-story')
    expect(state.reel.storyId).toBe('old-story')
    await generateStory('reel-1', 'channel-1', 'english')
    expect(state.reel.storyId).toBe(expectedId)
    expect(state.storyRows.get(expectedId)?.body).toBe(audit().winner.narration)
    expect(state.llm).toHaveBeenCalledTimes(5)
    expect(state.spent).toBe(5)
    expect(state.storyRows.size).toBe(2)
  })

  it('preserves edits on the identified story and does not regress a published reel on redelivery', async () => {
    queueStandard()
    await generateStory('reel-1', 'channel-1', 'english')
    state.storyRows.get(state.reel.storyId!)!.body = 'The creator edited this line.'
    state.reel.status = 'published'
    await generateStory('reel-1', 'channel-1', 'english')
    expect(state.storyRows.get(state.reel.storyId!)!.body).toBe('The creator edited this line.')
    expect(state.reel.status).toBe('published')
    expect(state.llm).toHaveBeenCalledTimes(5)
  })

  it.each(['foreign channel', 'other reel'])('refuses to recover a cached winner identity belonging to a %s', async (ownership) => {
    queueStandard()
    state.failPersistence = true
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow('Injected failure')
    const id = audit().winnerStoryId
    state.storyRows.set(id, { id, channelId: ownership === 'foreign channel' ? 'channel-2' : 'channel-1', title: story.title, body: story.narration, logline: story.logline })
    if (ownership === 'other reel') state.foreignStoryReel = { id: 'reel-2' }
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow(ownership === 'foreign channel' ? 'conflicting winner identity' : 'another reel')
    expect(state.reel.storyId).toBeNull()
    expect(state.spent).toBe(5)
    expect(state.llm).toHaveBeenCalledTimes(5)
  })

  it('holds ambiguous legacy output instead of overwriting a different linked story', async () => {
    queueStandard()
    await generateStory('reel-1', 'channel-1', 'english')
    delete (state.step!.output as { winnerStoryId?: string }).winnerStoryId
    state.storyRows.get(state.reel.storyId!)!.body = 'A distinct draft or creator edit.'
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow('legacy generation')
    expect(state.storyRows.get(state.reel.storyId!)!.body).toBe('A distinct draft or creator edit.')
    expect(state.llm).toHaveBeenCalledTimes(5)
  })

  it.each(['horror', 'drama', 'commentary', 'reddit_story', 'comedy', 'informational', 'lifestyle', 'childrens', 'fairytale', 'general', 'romance', 'mystery', 'satire', 'documentary', 'romantic mystery', 'cozy mystery', 'romantic science fiction'])('carries the complete %s contract through every standard stage', async (genre) => {
    state.reel.genreCategory = genre
    state.reel.sourcePolicy = SourcePolicySchema.parse({ realPlaces: true, realEvents: true, realPeople: 'historical', invention: 'constrained' })
    queueStandard()
    await generateStory('reel-1', 'channel-1', 'tagalog')
    for (let index = 0; index < 5; index++) {
      const text = promptText(index)
      expect(text).toContain(genre)
      expect(text).toContain('tagalog')
      expect(text).toContain('Preserve ambiguity; never announce a moral.')
      expect(text).toContain('Real places may be named accurately')
    }
  })

  it('keeps the brief and exact gate reason on modern-writer fallback, recording failed spend once', async () => {
    const refinement = { narration: story.narration, peakMoment: story.peakMoment }
    queue(attachSpend(new Error('Planner schema repair failed'), 7), story, refinement, refinement,
      { ...pass, pass: false, reason: 'Pay off the letter the opening promised.' }, story, refinement, refinement, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(audit().plannerStatus).toBe('failed_direct_writer')
    expect(promptText(1)).toContain('A promise on Balete Drive')
    expect(promptText(5)).toContain('Pay off the letter the opening promised.')
    expect(state.llm.mock.calls[1]![0].provider).toBe('anthropic')
    expect(state.spent).toBe(15)
  })

  it.each([
    ['light', 'Lightly borrow from'],
    ['full', 'Fully commit to'],
    ['invalid', 'Work in the tradition of'],
  ])('preserves %s style strength through standard authoring, refinement and judgment', async (influence, instruction) => {
    state.channel.narrativeStyle = 'urban_legend'
    state.channel.styleInfluence = influence
    queueStandard()
    await generateStory('reel-1', 'channel-1', 'english')
    for (let index = 0; index < 5; index++) {
      expect(promptText(index)).toContain(`STYLE — ${instruction}`)
      expect(promptText(index)).toContain(`Style influence: ${influence === 'invalid' ? 'medium' : influence}`)
    }
  })

  it.each([2, 3, 4])('records swallowed paid failure at standard call %s without double billing', async (failedIndex) => {
    const refinement = { narration: story.narration, peakMoment: story.peakMoment }
    const results: unknown[] = [plan, story, refinement, refinement, pass]
    results[failedIndex] = attachSpend(new Error('Paid schema failure'), 9)
    queue(...results)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(state.spent).toBe(13)
    if (failedIndex === 4) expect(audit().gate.status).toBe('failed')
  })

  it('restores the original plan when a paid re-judge fails after the doctor', async () => {
    vi.stubEnv('STORY_PLAN_GATE', '1')
    const failedPlan = { pass: false, reason: 'The decision lacks consequences.', decision: { pass: false }, chain: { pass: true }, causedEnding: { pass: true } }
    const refinement = { narration: story.narration, peakMoment: story.peakMoment }
    queue(plan, failedPlan, { premise: 'UNVERIFIED REPAIR', conflict: 'different', escalation: 'different', twist: 'different', ending: 'different', emotionalDestination: 'different' },
      attachSpend(new Error('Paid re-judge failed'), 4), story, refinement, refinement, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(audit().plan.premise).toBe(plan.premise)
    expect(promptText(4)).not.toContain('UNVERIFIED REPAIR')
    expect(state.spent).toBe(11)
  })

  it('records a paid finishing-judge failure while preserving the passing editorial verdict', async () => {
    vi.stubEnv('STORY_FINISHING_QA', '1')
    queueStandard()
    queue(attachSpend(new Error('Paid finishing failure'), 6))
    await generateStory('reel-1', 'channel-1', 'english')
    expect(state.spent).toBe(11)
    expect(audit().gate.verdicts[0]?.pass).toBe(true)
  })

  it('preserves mixed-genre context in optional plan repair, ending detection, and finishing review', async () => {
    vi.stubEnv('STORY_PLAN_GATE', '1')
    vi.stubEnv('STORY_FINISHING_QA', '1')
    vi.stubEnv('STORY_ENDING_REPAIR', '1')
    state.reel.genreCategory = 'romantic science fiction'
    state.reel.sourcePolicy = SourcePolicySchema.parse({ realPlaces: true, invention: 'constrained' })
    const planCheck = { pass: true, reason: 'The consequence follows.', decision: { pass: true }, chain: { pass: true }, causedEnding: { pass: true } }
    const refinement = { narration: story.narration, peakMoment: story.peakMoment }
    queue(plan, { ...planCheck, pass: false }, plan, planCheck, story, refinement, refinement,
      { landed: true, landingKind: 'action' }, pass, { issues: [], summary: 'The chosen ending works.' })
    await generateStory('reel-1', 'channel-1', 'english')
    for (const index of [1, 2, 3, 7, 9]) {
      expect(promptText(index)).toContain('romantic science fiction')
      expect(promptText(index)).toContain('Real places may be named accurately')
      expect(promptText(index)).toContain('Preserve ambiguity; never announce a moral.')
    }
    expect(state.llm).toHaveBeenCalledTimes(10)
  })

  it('checks framing on an optional standard fact check using the final story', async () => {
    state.channel.factCheck = true
    state.reel.dossier = 'ARCHIVE: The archive opened in 1900.'
    queueStandard()
    queue({ facts }, cleanFidelity)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(promptText(6)).toContain(story.title)
    expect(promptText(6)).toContain(story.logline)
    expect(promptText(6)).toContain(story.narration)
    expect(state.spent).toBe(7)
  })
})

describe('evidence-constrained production orchestration', () => {
  it('refuses a missing dossier before any paid call', async () => {
    evidenceMode()
    delete state.reel.dossier
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow('no curated dossier')
    expect(state.llm).not.toHaveBeenCalled()
  })

  it('rejects duplicate evidence IDs before the planner can overwrite provenance', async () => {
    evidenceMode()
    queue({ facts: [...facts, ...facts] })
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow('duplicate')
    expect(state.llm).toHaveBeenCalledTimes(1)
    expect(state.spent).toBe(1)
  })

  it('sends language, creator context and factual framing through the real EBN prompts', async () => {
    evidenceMode()
    const draft = citedDraft(targetWords())
    queue({ facts }, { claims }, draft, cleanFidelity, pass)
    await generateStory('reel-1', 'channel-1', 'tagalog')
    expect(promptText(1)).toContain('tagalog')
    expect(promptText(2)).toContain('tagalog')
    expect(promptText(2)).toContain('Preserve ambiguity; never announce a moral.')
    expect(promptText(2)).toContain('Talking to a friend')
    expect(promptText(2)).toContain('Every load-bearing specific must come from the supplied source material')
    expect(promptText(3)).toContain(draft.title)
    expect(promptText(3)).toContain(draft.logline)
    expect(audit().gate.verdicts[0]?.pass).toBe(true)
  })

  it.each([['light', 'Lightly borrow from'], ['full', 'Fully commit to']])('carries %s style strength into evidence planning, writing and judgment', async (influence, instruction) => {
    evidenceMode()
    state.channel.narrativeStyle = 'urban_legend'
    state.channel.styleInfluence = influence
    queue({ facts }, { claims }, citedDraft(targetWords()), cleanFidelity, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    for (const index of [1, 2, 4]) {
      expect(promptText(index)).toContain(`STYLE — ${instruction}`)
      expect(promptText(index)).toContain(`Style influence: ${influence}`)
    }
    expect(state.step!.output).toMatchObject({ prose: { style: 'urban_legend', influence } })
  })

  it.each(['expand', 'compress'] as const)('uses one consistent target to %s an out-of-budget cited draft', async (direction) => {
    evidenceMode()
    const words = targetWords()
    queue({ facts }, { claims }, citedDraft(direction === 'expand' ? 20 : words * 2), citedDraft(words), cleanFidelity, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    const correction = promptText(3)
    expect(correction.toLowerCase()).toContain(direction)
    expect(correction).toContain(`${words}`)
    expect(correction).not.toContain('DRAFT TO COMPRESS')
    expect(audit().gate.verdicts[0]?.pass).toBe(true)
    expect(state.spent).toBe(6)
  })

  it('scales a long-form evidence plan beyond fourteen claims without conflicting sentence caps', async () => {
    evidenceMode()
    state.channel.targetSeconds = 600
    const longClaims = Array.from({ length: 25 }, (_, i) => ({ ...claims[0]!, id: `C${i + 1}`, order: i + 1 }))
    const draft = citedDraft(targetWords())
    const texts = draft.narrative[0]!.sentences[0]!.text.split(' ')
    draft.narrative = longClaims.map((claim, index) => ({ claimId: claim.id, sentences: [{ factIds: ['F1'], text: texts.slice(Math.floor(index * texts.length / 25), Math.floor((index + 1) * texts.length / 25)).join(' ') }] }))
    draft.peakSentence = draft.narrative[0]!.sentences[0]!.text
    queue({ facts }, { claims: longClaims }, draft, cleanFidelity, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(promptText(2)).toContain('C25')
    expect(promptText(2)).not.toContain('no more than 14 sentences')
    expect(promptText(2)).not.toContain('at or below 30 words')
    expect(state.llm.mock.calls[1]![0].maxTokens).toBeGreaterThan(2000)
    expect(audit().gate.verdicts[0]?.pass).toBe(true)
  })

  it('blocks invalid claim references before any writer call and retains extraction/planning cost', async () => {
    evidenceMode()
    queue({ facts }, { claims: [{ ...claims[0], evidence: ['missing'] }] })
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow()
    expect(state.llm).toHaveBeenCalledTimes(2)
    expect(state.spent).toBe(2)
    expect(state.storyRows.size).toBe(0)
  })

  it.each(['empty citations', 'unknown fact', 'unknown claim'])('blocks %s even before the semantic fidelity gate', async (defect) => {
    evidenceMode()
    const draft = citedDraft(targetWords())
    if (defect === 'unknown claim') draft.narrative[0]!.claimId = 'missing'
    else draft.narrative[0]!.sentences[0]!.factIds = defect === 'empty citations' ? [] : ['missing']
    queue({ facts }, { claims }, draft)
    await expect(generateStory('reel-1', 'channel-1', 'english')).rejects.toThrow()
    expect(state.llm).toHaveBeenCalledTimes(3)
    expect(state.spent).toBe(3)
    expect(state.storyRows.size).toBe(0)
  })

  it('keeps an unsupported title from passing production readiness', async () => {
    evidenceMode()
    const draft = { ...citedDraft(targetWords()), title: 'The archivist committed a crime' }
    queue({ facts }, { claims }, draft, { issues: [{ axis: 'added', offending: draft.title, detail: 'The title invents a crime.' }], summary: 'Unsupported title.' }, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(promptText(3)).toContain(draft.title)
    expect(audit().gate.verdicts[0]?.pass).toBe(false)
  })

  it('checks sentence-level citation meaning after structural IDs pass', async () => {
    evidenceMode()
    const draft = citedDraft(targetWords())
    queue({ facts }, { claims }, draft,
      { issues: [{ axis: 'citation', surface: 'narration', offending: draft.narrative[0]!.sentences[0]!.text, detail: 'The cited fact does not support this statement.' }], summary: 'Unsupported citation.' }, pass)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(promptText(3)).toMatch(/"claimId"\s*:\s*"C1"/)
    expect(promptText(3)).toMatch(/"factIds"\s*:\s*\[/)
    expect(audit().gate.verdicts[0]?.pass).toBe(false)
  })

  it.each([3, 4])('accounts for the caught EBN judge failure at call %s and holds readiness', async (failedIndex) => {
    evidenceMode()
    const results: unknown[] = [{ facts }, { claims }, citedDraft(targetWords()), cleanFidelity, pass]
    results[failedIndex] = attachSpend(new Error('Paid judge schema failure'), 8)
    queue(...results)
    await generateStory('reel-1', 'channel-1', 'english')
    expect(state.spent).toBe(12)
    if (failedIndex === 4) expect(audit().gate.status).toBe('failed')
    else expect(audit().gate.verdicts[0]?.pass).toBe(false)
  })
})

describe('downstream story helper spend', () => {
  it('records paid analyzer failures that recover to a canon-only bible', async () => {
    state.reel.storyId = 'story-1'
    state.storyRows.set('story-1', { id: 'story-1', channelId: 'channel-1', title: story.title, body: story.narration })
    queue(attachSpend(new Error('Analyzer schema repair failed'), 8))
    await analyzeStory('reel-1')
    expect(state.spent).toBe(8)
    expect(state.reel.storyBible).toMatchObject({ entities: [] })
  })

  it('retains prior paid analyzer and doctor costs when the identity-state gate throws', async () => {
    state.reel.storyId = 'story-1'
    state.reel.sourcePolicy = SourcePolicySchema.parse({ realPlaces: true })
    state.storyRows.set('story-1', { id: 'story-1', channelId: 'channel-1', title: story.title, body: story.narration })
    const bible = StoryBibleSchema.parse({ entities: [{ id: 'archive', kind: 'object', description: 'An archive before its restoration.' }] })
    queue(bible, { ok: false, issues: [{ entityId: 'archive', reason: 'Missing restored state', boundaryEvidence: 'restored', requiredStateIds: ['restored'] }] }, bible)
    await expect(analyzeStory('reel-1')).rejects.toThrow('Identity state repair did not persist')
    expect(state.spent).toBe(3)
  })

  it('returns paid classification failures through the depiction routing cost result', async () => {
    queue(attachSpend(new Error('Classification schema failure'), 7))
    const result = await routeDepiction({ id: 'archive', kind: 'location', description: 'A public archive.' }, SourcePolicySchema.parse({ realPlaces: true }), 'Philippines')
    expect(result.costCents).toBe(7)
    expect(result.routing.depictionMode).toBe('generated')
  })

  it('records the ending critic failure while keeping the original narration', async () => {
    queue(attachSpend(new Error('Ending critic schema failure'), 5))
    let spent = 0
    const result = await runEndingRepair({ title: story.title, narration: story.narration, peakMoment: story.peakMoment,
      genreCategory: 'horror', nicheDescription: 'Archive stories', language: 'english', audienceDescriptor: 'Adults',
      onCost: (amount) => { spent += amount }, resolvePeak: () => story.peakMoment })
    expect(spent).toBe(5)
    expect(result.narration).toBe(story.narration)
    expect(result.audit.status).toBe('failed')
  })

  it('preserves the prefix and creator contract in an applied ending edit', async () => {
    const policy = SourcePolicySchema.parse({ realPlaces: true, invention: 'constrained' })
    queue({ landed: false, sentenceStart: 4, sentenceEnd: 4, closingLines: 'She finally told her sister.', problem: 'Resolve the promised call.', landingKind: 'action' },
      { closingLines: 'She finally called her sister.' }, { ok: true, violations: [] })
    const result = await runEndingRepair({ title: story.title, narration: story.narration, peakMoment: story.peakMoment,
      genreCategory: 'cozy mystery', nicheDescription: 'Archive stories', language: 'english', audienceDescriptor: 'Adults',
      sourcePolicy: policy, creativeContext: { genre: 'cozy mystery', niche: 'Archive stories', language: 'english', audienceDescriptor: 'Adults', targetSeconds: 75,
        editorialPrinciples: 'Keep the ending warm.', sourcePolicy: policy },
      maxAttempts: 1, resolvePeak: () => story.peakMoment })
    expect(result.narration).toBe(story.narration.replace('She finally told her sister.', 'She finally called her sister.'))
    expect(result.audit).toMatchObject({ status: 'ok', applied: true })
    for (let index = 0; index < 3; index++) {
      expect(promptText(index)).toContain('cozy mystery')
      expect(promptText(index)).toContain('Keep the ending warm.')
      expect(promptText(index)).toContain('Real places may be named accurately')
    }
  })
})
