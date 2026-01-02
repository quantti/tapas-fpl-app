import { describe, it, expect } from 'vitest'

import { getPlaystyleLabel } from './useHeadToHeadComparison'

describe('getPlaystyleLabel', () => {
  describe('Template playstyle (9-11 matches)', () => {
    it('returns Template for 11 matches (perfect template)', () => {
      expect(getPlaystyleLabel(11)).toBe('Template')
    })

    it('returns Template for 10 matches', () => {
      expect(getPlaystyleLabel(10)).toBe('Template')
    })

    it('returns Template for 9 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(9)).toBe('Template')
    })
  })

  describe('Balanced playstyle (6-8 matches)', () => {
    it('returns Balanced for 8 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(8)).toBe('Balanced')
    })

    it('returns Balanced for 7 matches', () => {
      expect(getPlaystyleLabel(7)).toBe('Balanced')
    })

    it('returns Balanced for 6 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(6)).toBe('Balanced')
    })
  })

  describe('Differential playstyle (3-5 matches)', () => {
    it('returns Differential for 5 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(5)).toBe('Differential')
    })

    it('returns Differential for 4 matches', () => {
      expect(getPlaystyleLabel(4)).toBe('Differential')
    })

    it('returns Differential for 3 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(3)).toBe('Differential')
    })
  })

  describe('Maverick playstyle (0-2 matches)', () => {
    it('returns Maverick for 2 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(2)).toBe('Maverick')
    })

    it('returns Maverick for 1 match', () => {
      expect(getPlaystyleLabel(1)).toBe('Maverick')
    })

    it('returns Maverick for 0 matches (completely differential)', () => {
      expect(getPlaystyleLabel(0)).toBe('Maverick')
    })
  })

  describe('edge cases', () => {
    it('handles negative numbers as Maverick', () => {
      expect(getPlaystyleLabel(-1)).toBe('Maverick')
    })

    it('handles numbers above 11 as Template', () => {
      expect(getPlaystyleLabel(15)).toBe('Template')
    })
  })
})
