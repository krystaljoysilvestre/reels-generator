import { describe, expect, it } from 'vitest'
import { buildEbnPlannerPrompt } from './story-ebn-planner.v1.js'
import { buildEbnWriterPrompt, TRUE_CRIME_PERMISSIONS } from './story-ebn-writer.v1.js'

const editorialBrief = 'Follow the Crossroads structure. On revision, make the alternate road explicit.'

describe('EBN editorial brief isolation', () => {
  it('gives the planner channel direction without promoting it to evidence', () => {
    const prompt = buildEbnPlannerPrompt({
      language: 'tagalog',
      facts: [{ id: 'F01', stance: 'FACT', weight: 'Critical', value: 'The directors voted to reject the work.' }],
      criticalIds: ['F01'],
      editorialBrief,
      maxClaims: 7,
    })

    expect(prompt.userMessage).toContain(editorialBrief)
    expect(prompt.userMessage).toContain('direction only; never evidence')
    expect(prompt.system).toContain('It is direction, NEVER evidence')
    expect(prompt.userMessage).toContain('Use no more than 7 claims')
  })

  it('gives the writer voice and revision direction without relaxing citation discipline', () => {
    const prompt = buildEbnWriterPrompt({
      language: 'tagalog',
      claims: [{
        id: 'C1',
        order: 1,
        purpose: 'Reveal the decision.',
        facts: [{ id: 'F01', stance: 'FACT', value: 'The directors voted to reject the work.' }],
      }],
      permissions: TRUE_CRIME_PERMISSIONS,
      editorialBrief,
      targetWords: 200,
    })

    expect(prompt.userMessage).toContain(editorialBrief)
    expect(prompt.userMessage).toContain('direction only; never evidence')
    expect(prompt.system).toContain('A requested example, interpretation, alternate path, motive, or factual statement')
    expect(prompt.system).toContain('For EVERY sentence, cite the factIds')
    expect(prompt.system).toContain('Never mention the dossier, Evidence Bible')
    expect(prompt.userMessage).toContain('200 words; acceptable range 180–220 words')
    expect(prompt.system).toContain('OUTPUT LANGUAGE: tagalog')
    expect(prompt.system).toContain('there is no fixed sentence count or per-sentence word limit')
  })
})
