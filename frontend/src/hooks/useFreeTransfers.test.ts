import { describe, it, expect } from 'vitest'
import { calculateFreeTransfers } from './useFreeTransfers'

describe('calculateFreeTransfers', () => {
  describe('basic free transfer accumulation', () => {
    it('returns 1 FT at start of season (GW1)', () => {
      const history: { event: number; event_transfers: number }[] = []
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 1)

      expect(result).toBe(1)
    })

    it('returns 2 FT if no transfers made in GW1', () => {
      const history = [{ event: 1, event_transfers: 0 }]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 2)

      expect(result).toBe(2)
    })

    it('caps FT at 5 even if no transfers for multiple weeks (2024/25 rule)', () => {
      const history = [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
        { event: 3, event_transfers: 0 },
        { event: 4, event_transfers: 0 },
        { event: 5, event_transfers: 0 },
        { event: 6, event_transfers: 0 },
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 7)

      // 1 -> 2 -> 3 -> 4 -> 5 -> 5 -> 5 (capped at 5)
      expect(result).toBe(5)
    })

    it('returns 1 FT if 1 transfer made each week', () => {
      const history = [
        { event: 1, event_transfers: 1 },
        { event: 2, event_transfers: 1 },
        { event: 3, event_transfers: 1 },
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 4)

      // GW1: 1 FT -> use 1 -> 0 FT -> gain 1 -> 1 FT
      // GW2: 1 FT -> use 1 -> 0 FT -> gain 1 -> 1 FT
      // GW3: 1 FT -> use 1 -> 0 FT -> gain 1 -> 1 FT
      // GW4: 1 FT
      expect(result).toBe(1)
    })

    it('returns 2 FT after banking one week', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // Bank: 1 -> 2 FT
        { event: 2, event_transfers: 2 }, // Use 2: 2 -> 0 -> 1 FT
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 3)

      expect(result).toBe(1)
    })
  })

  describe('transfer consumption', () => {
    it('handles multiple transfers in a week (hits)', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 4 }, // 2 -> -2 -> clamped to 0 -> 1 FT
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 3)

      // After GW1: 2 FT (banked)
      // GW2: Use 4 transfers (2 free, 2 hits), FT = max(0, 2-4) = 0, then +1 = 1
      expect(result).toBe(1)
    })

    it('never goes negative on FT', () => {
      const history = [{ event: 1, event_transfers: 10 }] // 10 transfers!
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 2)

      // Start: 1 FT, use 10 -> max(0, 1-10) = 0, +1 = 1
      expect(result).toBe(1)
    })
  })

  describe('wildcard chip', () => {
    it('resets FT to 1 during wildcard GW', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT (banked)
        { event: 2, event_transfers: 0 }, // Still 2 FT
        { event: 3, event_transfers: 5 }, // Wildcard week (current)
      ]
      const chips = [{ name: 'wildcard', event: 3 }]

      // Current GW is wildcard GW - shows 1 FT remaining (reset, no +1 yet)
      const result = calculateFreeTransfers(history, chips, 3)
      expect(result).toBe(1)
    })

    it('FT is 2 after wildcard GW ends', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT (banked)
        { event: 2, event_transfers: 0 }, // Still 2 FT
        { event: 3, event_transfers: 5 }, // Wildcard week (completed)
      ]
      const chips = [{ name: 'wildcard', event: 3 }]

      // GW3 wildcard (completed) -> 1 FT + 1 = 2 FT for GW4
      const result = calculateFreeTransfers(history, chips, 4)
      expect(result).toBe(2)
    })

    it('FT accumulates after wildcard', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 5 }, // Wildcard -> 1 -> 2 FT
        { event: 3, event_transfers: 0 }, // 2 -> 3 FT
      ]
      const chips = [{ name: 'wildcard', event: 2 }]

      const result = calculateFreeTransfers(history, chips, 4)

      // GW2: wildcard -> 1 FT, +1 = 2 FT
      // GW3: bank -> 3 FT
      expect(result).toBe(3)
    })

    it('handles second wildcard in second half of season', () => {
      // Simulate first wildcard used early, second in GW20+
      const history = [
        { event: 1, event_transfers: 5 }, // First wildcard -> 1 -> 2 FT
        { event: 2, event_transfers: 0 }, // Bank -> 3 FT
        { event: 20, event_transfers: 8 }, // Second wildcard -> 1 -> 2 FT
        { event: 21, event_transfers: 0 }, // Bank -> 3 FT
      ]
      const chips = [
        { name: 'wildcard', event: 1 },
        { name: 'wildcard', event: 20 },
      ]

      const result = calculateFreeTransfers(history, chips, 22)

      // GW1: wildcard -> 1 FT, +1 = 2 FT
      // GW2: bank -> 3 FT
      // GW20: wildcard -> 1 FT, +1 = 2 FT
      // GW21: bank -> 3 FT
      expect(result).toBe(3)
    })
  })

  describe('free hit chip', () => {
    it('free hit preserves FT (transfers do not count)', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 10 }, // Free hit - transfers don't count, +1 = 3 FT
      ]
      const chips = [{ name: 'freehit', event: 2 }]

      const result = calculateFreeTransfers(history, chips, 3)

      // GW1: 1 -> 2 FT
      // GW2: free hit - FT unchanged (2), then +1 = 3 FT
      expect(result).toBe(3)
    })

    it('FT continues accumulating after free hit', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 0 }, // Free hit - FT unchanged (2), +1 = 3 FT
        { event: 3, event_transfers: 0 }, // 3 -> 4 FT
      ]
      const chips = [{ name: 'freehit', event: 2 }]

      const result = calculateFreeTransfers(history, chips, 4)

      // After GW3: 4 FT (accumulating towards max 5)
      expect(result).toBe(4)
    })
  })

  describe('other chips (bench boost, triple captain)', () => {
    it('bench boost does not affect FT calculation', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 1 }, // Use 1 of 2 -> 1 -> 2 FT
      ]
      const chips = [{ name: 'bboost', event: 2 }]

      const result = calculateFreeTransfers(history, chips, 3)

      // Bench boost doesn't affect FT
      // GW2: 2 - 1 = 1, +1 = 2 FT
      expect(result).toBe(2)
    })

    it('triple captain does not affect FT calculation', () => {
      const history = [
        { event: 1, event_transfers: 1 }, // Use 1 -> 0 -> 1 FT
        { event: 2, event_transfers: 0 }, // Bank -> 2 FT
      ]
      const chips = [{ name: '3xc', event: 2 }]

      const result = calculateFreeTransfers(history, chips, 3)

      // Triple captain doesn't affect FT
      expect(result).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('handles empty history', () => {
      const history: { event: number; event_transfers: number }[] = []
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 5)

      // No history data, default to 1 FT
      expect(result).toBe(1)
    })

    it('handles unsorted history', () => {
      const history = [
        { event: 3, event_transfers: 0 },
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 4)

      // Should sort and calculate correctly: 1 -> 2 -> 3 -> 4 FT
      expect(result).toBe(4)
    })

    it('ignores future gameweeks in history', () => {
      const history = [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
        { event: 5, event_transfers: 5 }, // Future GW - should be ignored
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 3)

      // Only GW1 and GW2 should count: 1 -> 2 -> 3 FT
      expect(result).toBe(3)
    })

    it('handles manager who joined mid-season', () => {
      // Manager started in GW5
      const history = [
        { event: 5, event_transfers: 0 },
        { event: 6, event_transfers: 0 },
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 7)

      // GW5: 1 -> 2 FT
      // GW6: 2 -> 3 FT
      expect(result).toBe(3)
    })
  })

  describe('deadline passed scenarios', () => {
    it('adds +1 FT when deadline has passed (current GW treated as complete)', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 1 }, // Use 1: 2 - 1 = 1 (current GW)
      ]
      const chips: { name: string; event: number }[] = []

      // Before deadline: 1 FT remaining in GW2
      const beforeDeadline = calculateFreeTransfers(history, chips, 2, false)
      expect(beforeDeadline).toBe(1)

      // After deadline: +1 FT for next GW
      const afterDeadline = calculateFreeTransfers(history, chips, 2, true)
      expect(afterDeadline).toBe(2)
    })

    it('ensures 1 FT minimum after deadline even with heavy transfers', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 5 }, // Use 5: 2 - 5 = 0 -> +1 = 1 FT
      ]
      const chips: { name: string; event: number }[] = []

      // After deadline: 0 + 1 = 1 FT for next GW
      const afterDeadline = calculateFreeTransfers(history, chips, 2, true)
      expect(afterDeadline).toBe(1)
    })

    it('shows 0 FT before deadline if all FT used this GW', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2 FT
        { event: 2, event_transfers: 2 }, // Use all 2 FT
      ]
      const chips: { name: string; event: number }[] = []

      // Before deadline: 0 FT remaining
      const beforeDeadline = calculateFreeTransfers(history, chips, 2, false)
      expect(beforeDeadline).toBe(0)

      // After deadline: 0 + 1 = 1 FT for next GW
      const afterDeadline = calculateFreeTransfers(history, chips, 2, true)
      expect(afterDeadline).toBe(1)
    })

    it('caps at 5 FT even after deadline', () => {
      const history = [
        { event: 1, event_transfers: 0 },
        { event: 2, event_transfers: 0 },
        { event: 3, event_transfers: 0 },
        { event: 4, event_transfers: 0 },
        { event: 5, event_transfers: 0 }, // Have 5 FT, current GW
      ]
      const chips: { name: string; event: number }[] = []

      // After deadline: still capped at 5
      const afterDeadline = calculateFreeTransfers(history, chips, 5, true)
      expect(afterDeadline).toBe(5)
    })
  })

  describe('realistic scenarios', () => {
    it('typical season start: conservative manager', () => {
      // Manager banks transfers early, uses 2 in GW3
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2
        { event: 2, event_transfers: 0 }, // 2 -> 3
        { event: 3, event_transfers: 2 }, // 3 - 2 = 1 -> 2
        { event: 4, event_transfers: 1 }, // 2 - 1 = 1 -> 2
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 5)

      expect(result).toBe(2)
    })

    it('typical season start: aggressive manager takes hits', () => {
      const history = [
        { event: 1, event_transfers: 3 }, // 1 - 3 = 0 -> 1 (2 hits)
        { event: 2, event_transfers: 2 }, // 1 - 2 = 0 -> 1 (1 hit)
        { event: 3, event_transfers: 1 }, // 1 - 1 = 0 -> 1
      ]
      const chips: { name: string; event: number }[] = []

      const result = calculateFreeTransfers(history, chips, 4)

      expect(result).toBe(1)
    })

    it('manager uses wildcard mid-season then banks', () => {
      const history = [
        { event: 1, event_transfers: 0 }, // 1 -> 2
        { event: 2, event_transfers: 0 }, // 2 -> 3
        { event: 3, event_transfers: 0 }, // 3 -> 4
        { event: 4, event_transfers: 8 }, // Wildcard -> 1 -> 2
        { event: 5, event_transfers: 0 }, // 2 -> 3
        { event: 6, event_transfers: 0 }, // 3 -> 4
      ]
      const chips = [{ name: 'wildcard', event: 4 }]

      const result = calculateFreeTransfers(history, chips, 7)

      expect(result).toBe(4)
    })
  })
})
