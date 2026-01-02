import { describe, expect, it } from 'vitest'

import { formatRank, getComparisonClass } from './comparison'

describe('comparison utility', () => {
  describe('getComparisonClass', () => {
    describe('normal comparison (higher is better)', () => {
      it('should return "better" when valueA is higher', () => {
        expect(getComparisonClass(100, 50)).toBe('better')
        expect(getComparisonClass(1, 0)).toBe('better')
        expect(getComparisonClass(0.5, 0.1)).toBe('better')
      })

      it('should return "worse" when valueA is lower', () => {
        expect(getComparisonClass(50, 100)).toBe('worse')
        expect(getComparisonClass(0, 1)).toBe('worse')
        expect(getComparisonClass(0.1, 0.5)).toBe('worse')
      })

      it('should return "neutral" when values are equal', () => {
        expect(getComparisonClass(100, 100)).toBe('neutral')
        expect(getComparisonClass(0, 0)).toBe('neutral')
        expect(getComparisonClass(-5, -5)).toBe('neutral')
      })
    })

    describe('inverted comparison (lower is better)', () => {
      it('should return "better" when valueA is lower', () => {
        expect(getComparisonClass(50, 100, true)).toBe('better')
        expect(getComparisonClass(1, 5, true)).toBe('better')
        expect(getComparisonClass(0, 1, true)).toBe('better')
      })

      it('should return "worse" when valueA is higher', () => {
        expect(getComparisonClass(100, 50, true)).toBe('worse')
        expect(getComparisonClass(5, 1, true)).toBe('worse')
        expect(getComparisonClass(1, 0, true)).toBe('worse')
      })

      it('should return "neutral" when values are equal', () => {
        expect(getComparisonClass(100, 100, true)).toBe('neutral')
        expect(getComparisonClass(0, 0, true)).toBe('neutral')
      })
    })

    describe('real-world FPL scenarios', () => {
      it('should handle points comparison (higher better)', () => {
        expect(getComparisonClass(1139, 1130)).toBe('better') // A has more points
        expect(getComparisonClass(1130, 1139)).toBe('worse') // A has fewer points
      })

      it('should handle rank comparison (lower better)', () => {
        expect(getComparisonClass(259000, 353000, true)).toBe('better') // A has better rank
        expect(getComparisonClass(353000, 259000, true)).toBe('worse') // A has worse rank
      })

      it('should handle hits comparison (lower better)', () => {
        expect(getComparisonClass(2, 5, true)).toBe('better') // A took fewer hits
        expect(getComparisonClass(5, 2, true)).toBe('worse') // A took more hits
      })

      it('should handle squad value comparison (higher better)', () => {
        expect(getComparisonClass(104.4, 103.8)).toBe('better')
        expect(getComparisonClass(103.8, 104.4)).toBe('worse')
      })

      it('should handle bank comparison (higher better)', () => {
        expect(getComparisonClass(2.5, 0.0)).toBe('better')
        expect(getComparisonClass(0.0, 2.5)).toBe('worse')
      })
    })

    describe('edge cases', () => {
      it('should handle negative values', () => {
        expect(getComparisonClass(-10, -20)).toBe('better') // -10 > -20
        expect(getComparisonClass(-20, -10)).toBe('worse')
        expect(getComparisonClass(-10, -20, true)).toBe('worse') // lower is better, -20 < -10
        expect(getComparisonClass(-20, -10, true)).toBe('better')
      })

      it('should handle zero correctly', () => {
        expect(getComparisonClass(0, -1)).toBe('better')
        expect(getComparisonClass(-1, 0)).toBe('worse')
        expect(getComparisonClass(0, 1)).toBe('worse')
        expect(getComparisonClass(1, 0)).toBe('better')
      })

      it('should handle decimal precision', () => {
        expect(getComparisonClass(0.1, 0.2)).toBe('worse')
        expect(getComparisonClass(0.2, 0.1)).toBe('better')
        expect(getComparisonClass(0.10000001, 0.1)).toBe('better')
      })
    })
  })

  describe('formatRank', () => {
    describe('small numbers (< 1000)', () => {
      it('should return the number as string', () => {
        expect(formatRank(1)).toBe('1')
        expect(formatRank(100)).toBe('100')
        expect(formatRank(999)).toBe('999')
      })
    })

    describe('thousands (1000 - 999,999)', () => {
      it('should format with K suffix', () => {
        expect(formatRank(1000)).toBe('1K')
        expect(formatRank(1500)).toBe('2K') // rounds
        expect(formatRank(10000)).toBe('10K')
        expect(formatRank(259000)).toBe('259K')
        expect(formatRank(353000)).toBe('353K')
        expect(formatRank(999999)).toBe('1000K')
      })

      it('should round to nearest K', () => {
        expect(formatRank(1499)).toBe('1K')
        expect(formatRank(1500)).toBe('2K')
        expect(formatRank(1501)).toBe('2K')
      })
    })

    describe('millions (>= 1,000,000)', () => {
      it('should format with M suffix and one decimal', () => {
        expect(formatRank(1000000)).toBe('1.0M')
        expect(formatRank(1500000)).toBe('1.5M')
        expect(formatRank(2345678)).toBe('2.3M')
        expect(formatRank(10000000)).toBe('10.0M')
      })

      it('should round to one decimal place', () => {
        expect(formatRank(1050000)).toBe('1.1M')
        expect(formatRank(1049999)).toBe('1.0M')
      })
    })

    describe('real-world FPL ranks', () => {
      it('should format typical overall ranks', () => {
        expect(formatRank(12345)).toBe('12K')
        expect(formatRank(123456)).toBe('123K')
        expect(formatRank(1234567)).toBe('1.2M')
        expect(formatRank(5678901)).toBe('5.7M')
      })

      it('should format league ranks (usually small)', () => {
        expect(formatRank(1)).toBe('1')
        expect(formatRank(5)).toBe('5')
        expect(formatRank(12)).toBe('12')
      })
    })

    describe('edge cases', () => {
      it('should handle zero', () => {
        expect(formatRank(0)).toBe('0')
      })

      it('should handle boundary values', () => {
        expect(formatRank(999)).toBe('999')
        expect(formatRank(1000)).toBe('1K')
        expect(formatRank(999999)).toBe('1000K')
        expect(formatRank(1000000)).toBe('1.0M')
      })
    })
  })
})
