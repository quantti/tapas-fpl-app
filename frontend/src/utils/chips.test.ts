import { describe, expect, it } from 'vitest'

import {
  AVAILABLE_CHIPS,
  CHIP_LABELS,
  getChipLabel,
  getChipsForCurrentHalf,
  getRemainingChips,
  getUsedChips,
} from './chips'

describe('chips utility', () => {
  describe('constants', () => {
    it('should have all 4 available chips', () => {
      expect(AVAILABLE_CHIPS).toEqual(['bboost', '3xc', 'freehit', 'wildcard'])
    })

    it('should have correct chip labels', () => {
      expect(CHIP_LABELS).toEqual({
        bboost: 'BB',
        '3xc': 'TC',
        freehit: 'FH',
        wildcard: 'WC',
      })
    })
  })

  describe('getChipLabel', () => {
    it('should return correct label for known chips', () => {
      expect(getChipLabel('bboost')).toBe('BB')
      expect(getChipLabel('3xc')).toBe('TC')
      expect(getChipLabel('freehit')).toBe('FH')
      expect(getChipLabel('wildcard')).toBe('WC')
    })

    it('should handle uppercase input', () => {
      expect(getChipLabel('BBOOST')).toBe('BB')
      expect(getChipLabel('Wildcard')).toBe('WC')
    })

    it('should return uppercase name for unknown chips', () => {
      expect(getChipLabel('unknown')).toBe('UNKNOWN')
    })
  })

  describe('getRemainingChips', () => {
    describe('first half (GW1-19)', () => {
      const isSecondHalf = false

      it('should return all chips when none used', () => {
        const result = getRemainingChips([], isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit', 'wildcard'])
      })

      it('should exclude chips used in first half', () => {
        const chipsUsed = [{ name: 'wildcard', event: 5 }]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit'])
      })

      it('should exclude multiple chips used in first half', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 },
          { name: 'bboost', event: 12 },
        ]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['3xc', 'freehit'])
      })

      it('should ignore chips used in second half', () => {
        const chipsUsed = [{ name: 'wildcard', event: 25 }]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit', 'wildcard'])
      })

      it('should handle mixed chips from both halves', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 }, // first half - counts
          { name: 'bboost', event: 25 }, // second half - ignored
        ]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit'])
      })
    })

    describe('second half (GW20+)', () => {
      const isSecondHalf = true

      it('should return all chips when none used in second half', () => {
        const result = getRemainingChips([], isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit', 'wildcard'])
      })

      it('should return all chips even if all were used in first half', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 },
          { name: 'bboost', event: 10 },
          { name: '3xc', event: 15 },
          { name: 'freehit', event: 18 },
        ]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit', 'wildcard'])
      })

      it('should exclude chips used in second half', () => {
        const chipsUsed = [{ name: 'wildcard', event: 22 }]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost', '3xc', 'freehit'])
      })

      it('should handle GW20 as second half boundary', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 19 }, // first half - ignored
          { name: 'bboost', event: 20 }, // second half - counts
        ]
        const result = getRemainingChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['3xc', 'freehit', 'wildcard'])
      })
    })
  })

  describe('getUsedChips', () => {
    describe('first half (GW1-19)', () => {
      const isSecondHalf = false

      it('should return empty array when no chips used', () => {
        const result = getUsedChips([], isSecondHalf)
        expect(result).toEqual([])
      })

      it('should return chips used in first half', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 },
          { name: 'bboost', event: 12 },
        ]
        const result = getUsedChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['wildcard', 'bboost'])
      })

      it('should exclude chips used in second half', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 }, // counts
          { name: 'bboost', event: 25 }, // ignored
        ]
        const result = getUsedChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['wildcard'])
      })

      it('should normalize chip names to lowercase', () => {
        const chipsUsed = [{ name: 'WILDCARD', event: 5 }]
        const result = getUsedChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['wildcard'])
      })
    })

    describe('second half (GW20+)', () => {
      const isSecondHalf = true

      it('should return empty when all chips used in first half', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 },
          { name: 'bboost', event: 10 },
        ]
        const result = getUsedChips(chipsUsed, isSecondHalf)
        expect(result).toEqual([])
      })

      it('should return chips used in second half only', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 }, // ignored
          { name: 'bboost', event: 22 }, // counts
        ]
        const result = getUsedChips(chipsUsed, isSecondHalf)
        expect(result).toEqual(['bboost'])
      })
    })
  })

  describe('getChipsForCurrentHalf', () => {
    describe('first half scenarios', () => {
      it('should return all remaining when no chips used in GW1', () => {
        const result = getChipsForCurrentHalf([], 1)
        expect(result).toEqual({
          used: [],
          remaining: ['BB', 'TC', 'FH', 'WC'],
        })
      })

      it('should show used and remaining chips correctly in GW10', () => {
        const chipsUsed = [{ name: 'wildcard', event: 5 }]
        const result = getChipsForCurrentHalf(chipsUsed, 10)
        expect(result).toEqual({
          used: ['WC'],
          remaining: ['BB', 'TC', 'FH'],
        })
      })

      it('should show all chips used when all 4 used in first half', () => {
        const chipsUsed = [
          { name: 'bboost', event: 3 },
          { name: '3xc', event: 8 },
          { name: 'freehit', event: 12 },
          { name: 'wildcard', event: 15 },
        ]
        const result = getChipsForCurrentHalf(chipsUsed, 18)
        expect(result).toEqual({
          used: ['BB', 'TC', 'FH', 'WC'],
          remaining: [],
        })
      })
    })

    describe('second half scenarios (GW20+)', () => {
      it('should reset chips at GW20 - all available again', () => {
        // Manager used all chips in first half
        const chipsUsed = [
          { name: 'bboost', event: 3 },
          { name: '3xc', event: 8 },
          { name: 'freehit', event: 12 },
          { name: 'wildcard', event: 15 },
        ]
        const result = getChipsForCurrentHalf(chipsUsed, 20)
        expect(result).toEqual({
          used: [],
          remaining: ['BB', 'TC', 'FH', 'WC'],
        })
      })

      it('should track chips used in second half separately', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 5 }, // first half - ignored
          { name: 'bboost', event: 22 }, // second half - counts
        ]
        const result = getChipsForCurrentHalf(chipsUsed, 25)
        expect(result).toEqual({
          used: ['BB'],
          remaining: ['TC', 'FH', 'WC'],
        })
      })

      it('should handle GW20 boundary correctly', () => {
        const chipsUsed = [
          { name: 'wildcard', event: 19 }, // first half (< 20)
          { name: 'bboost', event: 20 }, // second half (>= 20)
        ]
        const result = getChipsForCurrentHalf(chipsUsed, 20)
        expect(result).toEqual({
          used: ['BB'],
          remaining: ['TC', 'FH', 'WC'],
        })
      })
    })

    describe('GW19 deadline edge case', () => {
      it('should treat as first half when deadline not passed', () => {
        const chipsUsed = [{ name: 'wildcard', event: 5 }]
        // Future deadline
        const futureDeadline = new Date(Date.now() + 86400000).toISOString()
        const result = getChipsForCurrentHalf(chipsUsed, 19, futureDeadline)
        expect(result).toEqual({
          used: ['WC'],
          remaining: ['BB', 'TC', 'FH'],
        })
      })

      it('should treat as second half when deadline passed', () => {
        const chipsUsed = [{ name: 'wildcard', event: 5 }]
        // Past deadline
        const pastDeadline = new Date(Date.now() - 86400000).toISOString()
        const result = getChipsForCurrentHalf(chipsUsed, 19, pastDeadline)
        expect(result).toEqual({
          used: [],
          remaining: ['BB', 'TC', 'FH', 'WC'],
        })
      })
    })
  })
})
