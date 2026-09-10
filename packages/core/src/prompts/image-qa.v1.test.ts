import { describe, expect, it } from 'vitest'
import { buildImageQAPrompt, isBlockingImageTruthFailure } from './image-qa.v1.js'

describe('buildImageQAPrompt — time-bound appearance', () => {
  it('adds a life-stage check only when the scene selected an appearance variant', () => {
    const base = buildImageQAPrompt('the woman crosses the river')
    expect(base.userMessage).not.toContain('CHARACTER LIFE STAGE')

    const memory = buildImageQAPrompt(
      'the woman crosses the river',
      'grandmother: a young girl with long black hair and a red ribbon',
    )
    expect(memory.userMessage).toContain('EXPECTED VERIFIED ENTITY STATE')
    expect(memory.userMessage).toContain('VERIFIED ENTITY STATE')
    expect(memory.userMessage).toContain('a young girl')
  })

  it('separates blocking factual truth from best-effort craft QA', () => {
    const factual = buildImageQAPrompt(
      'anonymous hands beside an unmarked object',
      undefined,
      { required: true, depictionBasis: 'representative', narrationText: 'The directors rejected it.' },
    )
    expect(factual.userMessage).toContain('FACTUAL DEPICTION CONTRACT (blocking)')
    expect(factual.userMessage).toContain('representative must remain anonymous')
    expect(factual.userMessage).toContain('pass:false with truthPass:true is valid')
    expect(factual.userMessage).toContain('truthPass')

    const fiction = buildImageQAPrompt('a woman opens a fictional door')
    expect(fiction.userMessage).toContain('set truthPass:true')
  })

  it('classifies verified object state as truth while keeping conceptual composition in craft QA', () => {
    const prompt = buildImageQAPrompt(
      'Fountain dissolves into a blank field',
      "duchamp-fountain: turned on its back, marked 'R. Mutt 1917'",
      { required: true, depictionBasis: 'conceptual', narrationText: 'Without the rejection, it might have vanished.' },
    )

    expect(prompt.userMessage).toContain('identity-defining geometry, orientation, configuration, and markings')
    expect(prompt.userMessage).toContain('never demote those to ordinary issues')
    expect(prompt.userMessage).toContain('different composition or visual device')
    expect(prompt.userMessage).toContain('do NOT put it in truthIssues')
  })

  it('does not demand visible proof of an inherently hidden state', () => {
    const prompt = buildImageQAPrompt(
      'a weapon descends beneath a parachute',
      'the same weapon with its internal safing state changed',
      { required: true, depictionBasis: 'reconstruction', narrationText: 'Its safing pins had been removed.' },
    )

    expect(prompt.userMessage).toContain('internal, hidden, microscopic')
    expect(prompt.userMessage).toContain('Missing visible proof of an inherently hidden state is not a contradiction')
    expect(prompt.userMessage).toContain('ABSENCE OF VISIBLE PROOF IS NEVER AN IDENTITY MISMATCH')
    expect(prompt.userMessage).toContain('Do not invent expected exterior evidence')
    expect(prompt.userMessage).toContain('observable result')
  })

  it('bounds identity judgment to supplied verified reference pixels', () => {
    const prompt = buildImageQAPrompt(
      'a weapon descends beneath a parachute',
      'Mark 39 nuclear bomb: descending beneath a deployed parachute',
      { required: true, depictionBasis: 'reconstruction', narrationText: 'One weapon deployed its parachute.' },
      ['Mark 39 nuclear bomb: verified conditioning photograph'],
    )

    expect(prompt.userMessage).toContain('REFERENCE 1: Mark 39 nuclear bomb')
    expect(prompt.userMessage).toContain('never remembered or assumed facts')
    expect(prompt.userMessage).toContain('SOURCE-BOUNDED JUDGMENT')
    expect(prompt.userMessage).toContain('never use outside memory to invent a required color')
  })

  it('blocks only the independent truth verdict', () => {
    expect(isBlockingImageTruthFailure(true, { truthPass: false })).toBe(true)
    expect(isBlockingImageTruthFailure(true, { truthPass: true })).toBe(false)
    expect(isBlockingImageTruthFailure(false, { truthPass: false })).toBe(false)
  })
})
