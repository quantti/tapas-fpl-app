import { describe, it, expect } from 'vitest'
import { getCaptainBadge } from './picks'

describe('getCaptainBadge', () => {
  it('returns "C" for captain', () => {
    expect(getCaptainBadge({ is_captain: true, is_vice_captain: false })).toBe('C')
  })

  it('returns "V" for vice captain', () => {
    expect(getCaptainBadge({ is_captain: false, is_vice_captain: true })).toBe('V')
  })

  it('returns undefined for regular player', () => {
    expect(getCaptainBadge({ is_captain: false, is_vice_captain: false })).toBeUndefined()
  })

  it('returns "C" when both captain and vice captain are true (captain takes precedence)', () => {
    // Edge case: shouldn't happen in real data, but captain should take precedence
    expect(getCaptainBadge({ is_captain: true, is_vice_captain: true })).toBe('C')
  })
})
