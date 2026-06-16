import { describe, it, expect } from 'vitest'
import {
  transition,
  canTransition,
  getAllowedTransitions,
  isTerminal,
  IllegalTransitionError,
  type ReelStatus,
} from './reel-state-machine.js'

describe('reel state machine', () => {
  describe('transition()', () => {
    it('returns the next status on a valid transition', () => {
      expect(transition('drafting', 'story_review')).toBe('story_review')
      expect(transition('story_review', 'storyboard')).toBe('storyboard')
      expect(transition('storyboard', 'rendering')).toBe('rendering')
      expect(transition('rendering', 'render_qa')).toBe('render_qa')
      expect(transition('render_qa', 'spot_check')).toBe('spot_check')
      expect(transition('spot_check', 'approved')).toBe('approved')
      expect(transition('approved', 'scheduled')).toBe('scheduled')
      expect(transition('scheduled', 'published')).toBe('published')
    })

    it('throws IllegalTransitionError on invalid transitions', () => {
      expect(() => transition('drafting', 'published')).toThrow(IllegalTransitionError)
      expect(() => transition('drafting', 'rendering')).toThrow(IllegalTransitionError)
      expect(() => transition('published', 'drafting')).toThrow(IllegalTransitionError)
      expect(() => transition('rejected', 'published')).toThrow(IllegalTransitionError)
    })

    it('error message names the from and to states', () => {
      expect(() => transition('drafting', 'published')).toThrow(
        'drafting → published',
      )
    })
  })

  describe('failure path', () => {
    it('any non-terminal status can transition to failed', () => {
      const failableStatuses: ReelStatus[] = [
        'drafting', 'story_review', 'storyboard', 'rendering',
        'render_qa', 'spot_check', 'scheduled',
      ]
      for (const s of failableStatuses) {
        expect(() => transition(s, 'failed')).not.toThrow()
      }
    })

    it('failed can retry from drafting or rendering', () => {
      expect(transition('failed', 'drafting')).toBe('drafting')
      expect(transition('failed', 'rendering')).toBe('rendering')
    })
  })

  describe('rejection path', () => {
    it('story_review can reject', () => {
      expect(transition('story_review', 'rejected')).toBe('rejected')
    })

    it('rejected can return to drafting for a retry', () => {
      expect(transition('rejected', 'drafting')).toBe('drafting')
    })
  })

  describe('re-render from spot_check', () => {
    it('spot_check can send back to rendering', () => {
      expect(transition('spot_check', 'rendering')).toBe('rendering')
    })
  })

  describe('canTransition()', () => {
    it('returns true for valid transitions', () => {
      expect(canTransition('drafting', 'story_review')).toBe(true)
    })

    it('returns false for invalid transitions', () => {
      expect(canTransition('drafting', 'published')).toBe(false)
    })
  })

  describe('getAllowedTransitions()', () => {
    it('returns array of valid next states', () => {
      const allowed = getAllowedTransitions('drafting')
      expect(allowed).toContain('story_review')
      expect(allowed).toContain('failed')
      expect(allowed).not.toContain('published')
    })
  })

  describe('isTerminal()', () => {
    it('published is the only terminal status', () => {
      expect(isTerminal('published')).toBe(true)
    })

    it('all other statuses are non-terminal', () => {
      const nonTerminal: ReelStatus[] = [
        'drafting', 'story_review', 'storyboard', 'rendering',
        'render_qa', 'spot_check', 'approved', 'scheduled',
        'rejected', 'failed',
      ]
      for (const s of nonTerminal) {
        expect(isTerminal(s), `${s} should be non-terminal`).toBe(false)
      }
    })
  })
})
