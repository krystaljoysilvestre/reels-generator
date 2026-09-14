import { describe, expect, it } from 'vitest'
import { buildEbnWriterPrompt, TRUE_CRIME_PERMISSIONS } from './story-ebn-writer.v1.js'
import { buildEbnPlannerPrompt } from './story-ebn-planner.v1.js'
import { buildEbnFidelityPrompt, EbnFidelitySchema } from './story-ebn-fidelity.v1.js'

describe('evidence story contract', () => {
  it.each(['tagalog', 'english', 'japanese'])('threads requested %s independently of English evidence', language => {
    const writer = buildEbnWriterPrompt({ language, audienceDescriptor: 'A curious family audience', claims: [], permissions: TRUE_CRIME_PERMISSIONS, targetWords: 750 })
    const planner = buildEbnPlannerPrompt({ language, facts: [], criticalIds: [] })
    expect(writer.system).toContain(`OUTPUT LANGUAGE: ${language}`)
    expect(writer.system).toContain('A curious family audience')
    expect(planner.system).toContain(`narrated in ${language}`)
  })

  it.each([50, 200, 750, 3000])('has one consistent narration budget for %i words', targetWords => {
    const prompt = buildEbnWriterPrompt({ language: 'english', claims: [], permissions: TRUE_CRIME_PERMISSIONS, targetWords })
    expect(prompt.userMessage).toContain(`${targetWords} words; acceptable range ${Math.round(targetWords * 0.9)}–${Math.round(targetWords * 1.1)} words`)
    expect(prompt.userMessage).not.toMatch(/no more than \d+ sentences/)
    expect(prompt.system).not.toContain('at or below 30 words')
  })

  it('checks factual framing separately while requiring critical coverage only in narration', () => {
    const prompt = buildEbnFidelityPrompt({ facts: [], criticalIds: [], narration: 'Officials alleged fraud.', title: 'He committed fraud', logline: 'The allegation is proven.' })
    expect(prompt.userMessage).toContain('TITLE:\nHe committed fraud')
    expect(prompt.userMessage).toContain('LOGLINE:\nThe allegation is proven.')
    expect(prompt.system).toContain('Only the narration must cover every Critical fact')
    expect(EbnFidelitySchema.parse({ issues: [{ surface: 'title', axis: 'certainty', offending: 'He committed fraud', detail: 'The source only alleges it.' }] }).issues[0]!.surface).toBe('title')
  })

  it('checks that existing cited ids actually support their sentence', () => {
    const citations = [{ text: 'The board voted against it.', factIds: ['F2'], claimId: 'C1' }]
    const prompt = buildEbnFidelityPrompt({ facts: [], criticalIds: [], narration: citations[0]!.text, citations })
    expect(prompt.userMessage).toContain(JSON.stringify(citations))
    expect(prompt.system).toContain('does not repair a wrong sentence citation')
    expect(EbnFidelitySchema.parse({ issues: [{ axis: 'citation', offending: citations[0]!.text, detail: 'F2 concerns the date, not the decision.' }] }).issues[0]!.axis).toBe('citation')
  })
})
