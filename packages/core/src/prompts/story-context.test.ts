import { describe, expect, it } from 'vitest'
import { SourcePolicySchema } from '../types/source-policy.js'
import { GENRE_MODULE_VALUES } from './scenes.v1.js'
import { buildChannelSamplePrompt } from './channel-sample.v2.js'
import { buildStoryPlannerPrompt } from './story-planner.v1.js'
import { buildStoryWriterPrompt } from './story.v2.js'
import { buildStoryEditorPrompt } from './story-editor.v1.js'
import { buildStoryNaturalizerPrompt } from './story-naturalizer.v1.js'
import { buildStoryGatePrompt, composeTasteRubric, defaultTasteRubric, DEFAULT_TASTE_RUBRICS } from './story-critic.v2.js'
import { buildStoryFinishingJudgePrompt } from './story-finishing-judge.v1.js'
import { buildStoryEndingCriticPrompt } from './story-ending-critic.v1.js'
import { renderStoryCreativeContext, renderStorySourceGuards, resolveWritingGenre, type StoryCreativeContext } from './story-context.js'

const policy = SourcePolicySchema.parse({
  realPlaces: true,
  realPeople: 'historical',
  realEvents: true,
  evidenceRequired: true,
  invention: 'none',
})

const plan = {
  premise: 'A returning visitor finds the neighborhood changed.',
  conflict: 'What still connects the visitor to this place?',
  escalation: 'Each familiar detail reveals what has changed.',
  twist: 'They recognize a connection they had overlooked.',
  ending: 'The visitor greets an old friend.',
  emotionalDestination: 'Recognition and warmth.',
}

function context(genre: string): StoryCreativeContext {
  return {
    genre,
    // Deliberately contains old classifier keywords: declared intent must win.
    niche: 'A lyrical account of family history and romance, with a mystery.',
    language: 'Filipino',
    audienceDescriptor: 'readers aged 10–12 who enjoy formal oral storytelling',
    targetSeconds: 95,
    narrativeStyle: 'a reflective oral tradition',
    narrativeVoice: 'documentary',
    editorialPrinciples: 'Let the final recognition remain hopeful.',
    sourcePolicy: policy,
  }
}

function stages(c: StoryCreativeContext) {
  const shared = { channelName: 'Homecoming', nicheDescription: c.niche, language: c.language }
  return {
    planner: buildStoryPlannerPrompt({
      ...shared, creativeContext: c, toneConfig: '{}', worldBibleJson: '{}',
      targetSeconds: c.targetSeconds, angleDirective: '', avoidList: '', rejectionAvoidList: '',
    }),
    writer: buildStoryWriterPrompt({
      ...shared, creativeContext: c, audienceDescriptor: c.audienceDescriptor,
      toneConfig: '{}', worldBibleJson: '{}', fewshotStories: '', targetSeconds: c.targetSeconds,
      targetWords: 210, plan,
    }),
    editor: buildStoryEditorPrompt({
      nicheDescription: c.niche, language: c.language, creativeContext: c,
      audienceDescriptor: c.audienceDescriptor, narration: 'The visitor recognizes the place.',
      peakMoment: 'The visitor recognizes the place.', emotionalDestination: plan.emotionalDestination,
      canonicalNames: [], targetWords: 210,
    }),
    naturalizer: buildStoryNaturalizerPrompt({
      creativeContext: c, language: c.language, audienceDescriptor: c.audienceDescriptor,
      narration: 'The visitor recognizes the place.', peakMoment: 'The visitor recognizes the place.',
    }),
    gate: buildStoryGatePrompt({
      ...shared, creativeContext: c, tasteRubric: defaultTasteRubric(c.genre, c.niche),
      narration: 'The visitor recognizes the place.', title: 'Homecoming', logline: 'A visitor returns.',
    }),
    finishing: buildStoryFinishingJudgePrompt({
      ...shared, creativeContext: c, narration: 'The visitor recognizes the place.',
      title: 'Homecoming', logline: 'A visitor returns.',
    }),
    preview: buildChannelSamplePrompt({
      name: shared.channelName, nicheDescription: c.niche, language: c.language,
      creativeContext: c, toneJson: '{}', worldJson: '{}', targetSeconds: c.targetSeconds,
      sourceMaterial: 'The supplied archive states that the visitor returned in 1910.',
    }),
  }
}

describe('declared writing genre versus legacy module selection', () => {
  it.each(GENRE_MODULE_VALUES)('retains the known %s default despite conflicting niche keywords', genre => {
    expect(resolveWritingGenre(genre, 'horror science romance')).toBe(genre)
  })

  it.each(['mystery', 'romance', 'romantic comedy', 'historical documentary', 'adventure', 'lyrical poetry', '科幻', 'horror comedy'])('preserves the custom %s contract instead of keyword reclassification', genre => {
    expect(resolveWritingGenre(genre, 'horror science romance')).toBe('general')
    expect(defaultTasteRubric(genre, 'horror science romance')).toBe(DEFAULT_TASTE_RUBRICS.general)
  })

  it('uses keyword compatibility only for absent legacy values', () => {
    expect(resolveWritingGenre(undefined, 'horror at home')).toBe('horror')
    expect(resolveWritingGenre(null, 'science explained')).toBe('informational')
    expect(resolveWritingGenre('  ', 'comedy')).toBe('comedy')
    expect(resolveWritingGenre(' general ', 'horror at home')).toBe('general')
    expect(resolveWritingGenre(' HORROR ', 'science explained')).toBe('horror')
  })
})

describe('the same creative contract survives the complete prompt chain', () => {
  it.each([...GENRE_MODULE_VALUES, 'romantic comedy', 'historical documentary', 'lyrical poetry', '科幻'])('%s keeps genre, audience, language, voice and rules in every stage', genre => {
    const c = context(genre)
    for (const [stage, prompt] of Object.entries(stages(c))) {
      for (const required of [c.genre, c.niche, c.language, c.audienceDescriptor, c.editorialPrinciples!]) {
        expect(prompt.system, `${stage} dropped ${required}`).toContain(required)
      }
      expect(prompt.system, `${stage} dropped narrator voice`).toContain('Observed and precise')
      expect(prompt.system, `${stage} lost real-place permission`).toContain('Real places may be named accurately')
      expect(prompt.system, `${stage} lost source restriction`).toContain('invent nothing')
      expect(prompt.system, `${stage} lost precedence`).toContain('PRECEDENCE:')
    }
  })

  it('retains selected form-specific meaning instead of only its catalog id', () => {
    const essay = renderStoryCreativeContext({ ...context('commentary'), narrativeStyle: 'personal_essay' })
    const observation = renderStoryCreativeContext({ ...context('comedy'), narrativeStyle: 'observational' })
    expect(essay).toContain('Arrives at the take by the end, not the start')
    expect(observation).toContain('Recognition humor')
    expect(DEFAULT_TASTE_RUBRICS.commentary).toContain('personal essay may earn it by the end')
    expect(DEFAULT_TASTE_RUBRICS.comedy).toContain('observational comedy may land through precise recognition')
  })

  it('keeps literal creator direction as data, including unfamiliar form names', () => {
    const c = { ...context('科幻'), narrativeStyle: '山歌', narrativeVoice: 'a chorus of witnesses' }
    const output = renderStoryCreativeContext(c)
    expect(output).toContain('Selected storytelling style: 山歌')
    expect(output).toContain('Selected narrator voice: a chorus of witnesses')
  })

  it.each([
    ['light', 'Lightly borrow from'],
    ['medium', 'Work in the tradition of'],
    ['full', 'Fully commit to'],
  ] as const)('preserves the selected %s style influence across all stages', (styleInfluence, direction) => {
    const c = { ...context('commentary'), narrativeStyle: 'personal_essay', styleInfluence }
    for (const [stage, prompt] of Object.entries(stages(c))) {
      expect(prompt.system, `${stage} lost the selected influence`).toContain(`Style influence: ${styleInfluence}`)
      expect(prompt.system, `${stage} uses the wrong strength`).toContain(direction)
    }
  })
})

describe('explicit rubric authority and purposeful endings', () => {
  it('labels a full operator override as binding, excludes built-in rules, and retains additional creator rules', () => {
    const rubric = composeTasteRubric({
      genreCategory: 'horror', niche: 'Horror',
      tasteRubric: 'Always close by repeating the opening sentence.',
      editorialPrinciples: 'Keep the ending hopeful.',
    })
    expect(rubric).toContain('OPERATOR-AUTHORED FULL RUBRIC')
    expect(rubric).toContain('explicit criteria remain binding')
    expect(rubric).toContain('Source fidelity and safety constraints still take precedence')
    expect(rubric).toContain('Always close by repeating the opening sentence.')
    expect(rubric).toContain('Keep the ending hopeful.')
    expect(rubric).not.toContain(DEFAULT_TASTE_RUBRICS.horror)
    expect(rubric).not.toContain('BUILT-IN GENRE DEFAULTS')
  })

  it('labels fallback rules as defaults without weakening separately supplied creator rules', () => {
    const rubric = composeTasteRubric({
      genreCategory: 'comedy', niche: 'Observational comedy',
      tasteRubric: '  ', editorialPrinciples: 'Let recognition carry the final laugh.',
    })
    expect(rubric).toContain('BUILT-IN GENRE DEFAULTS')
    expect(rubric).toContain(DEFAULT_TASTE_RUBRICS.comedy)
    expect(rubric).toContain("THIS CHANNEL'S OWN RULES")
    expect(rubric).toContain('Let recognition carry the final laugh.')
    expect(rubric).not.toContain('OPERATOR-AUTHORED FULL RUBRIC')
  })

  it('requires loss of purpose as well as duplication before replacing a repeated ending', () => {
    const prompt = buildStoryEndingCriticPrompt({
      genreCategory: 'childrens', language: 'English', title: 'Home', sentenceCount: 3,
      creativeContext: { ...context('childrens'), editorialPrinciples: 'Return to the opening refrain at the end.' },
      numberedNarration: '1. Home is where we help.\n2. We put every toy away together.\n3. Home is where we help.',
    })
    expect(prompt.system).toContain('Return to the opening refrain at the end.')
    expect(prompt.system).toContain('A duplicate without that second finding is not a failure')
    expect(prompt.system).toContain('explain why this repetition adds no useful effect and weakens the payoff')
    expect(prompt.system).not.toContain('Found one → decoration')
    expect(prompt.system).not.toContain('ALREADY SAID IT → the close is decoration')
    expect(prompt.system).not.toContain('If you have named the sentence, you are not on the fence — fail it')
  })
})

describe('source permissions in every authoring mode', () => {
  it('keeps the historical fiction default without granting real identity permissions', () => {
    const guards = renderStorySourceGuards()
    expect(guards).toContain('Fictionalize specific real places')
    expect(guards).toContain('No real, identifiable people')
    expect(guards).toContain('Events are invented')
  })

  it('does not let a creative context override a separately supplied frozen policy', () => {
    const c = context('mystery')
    const prompt = buildStoryWriterPrompt({
      channelName: 'Homecoming', nicheDescription: c.niche, creativeContext: c,
      sourcePolicy: SourcePolicySchema.parse({}), language: c.language,
      audienceDescriptor: c.audienceDescriptor, toneConfig: '{}', worldBibleJson: '{}',
      fewshotStories: '', targetSeconds: 95, targetWords: 210, plan,
    })
    expect(prompt.system).toContain('Fictionalize specific real places')
    expect(prompt.system).not.toContain('Real places may be named accurately')
  })

  it('requires actual source material before a factual preview is even prompted', () => {
    const vars = { name: 'History', nicheDescription: 'History', language: 'English', toneJson: '{}', worldJson: '{}', targetSeconds: 60, sourcePolicy: policy }
    expect(() => buildChannelSamplePrompt(vars)).toThrow('Add source material')
    expect(() => buildChannelSamplePrompt({ ...vars, promptHint: 'A court case', reviseDraft: 'A plausible account.' })).toThrow('Add source material')
    const prompt = buildChannelSamplePrompt({ ...vars, sourceMaterial: 'The court dismissed the case.' })
    expect(prompt.userMessage).toContain('The court dismissed the case.')
    expect(prompt.system).toContain('source-based preview awaiting production fidelity checks')
  })
})

describe('modern writer fallback without a planner result', () => {
  it('preserves the requested subject, angle and both kinds of revision feedback', () => {
    const prompt = buildStoryWriterPrompt({
      channelName: 'Homecoming', nicheDescription: 'Mysteries about old streets', genreCategory: 'mystery',
      language: 'English', audienceDescriptor: 'adults', toneConfig: '{}', worldBibleJson: '{}',
      fewshotStories: '', targetSeconds: 90, targetWords: 200,
      operatorSeed: 'A missing map', angleDirective: 'An outside observer',
      operatorFeedback: 'Keep the friendship central', qaFeedback: 'The clue is unexplained', regenerationNonce: 2,
    })
    expect(prompt.system).toContain('Declared genre / form: mystery')
    expect(prompt.system).toContain('a versatile storyteller')
    for (const required of ['A missing map', 'An outside observer', 'Keep the friendship central', 'The clue is unexplained', 'attempt #2']) {
      expect(prompt.userMessage).toContain(required)
    }
    expect(prompt.userMessage).not.toContain('undefined')
  })
})
