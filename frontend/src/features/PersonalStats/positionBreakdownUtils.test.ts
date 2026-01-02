import { describe, expect, it } from 'vitest'

import {
  aggregatePositionPoints,
  calculateGameweekPositionPoints,
  getEffectiveMultiplier,
  toPositionBreakdown,
  wasInFinalTeam,
} from './positionBreakdownUtils'

import type { EntryPicksResponse, LiveGameweek, Player } from 'types/fpl'

describe('wasInFinalTeam', () => {
  it('returns true for starter not subbed out', () => {
    const pick = { element: 1, multiplier: 1 }
    const subbedOut = new Set<number>()
    const subbedIn = new Set<number>()

    expect(wasInFinalTeam(pick, subbedOut, subbedIn)).toBe(true)
  })

  it('returns false for starter subbed out', () => {
    const pick = { element: 1, multiplier: 1 }
    const subbedOut = new Set([1])
    const subbedIn = new Set<number>()

    expect(wasInFinalTeam(pick, subbedOut, subbedIn)).toBe(false)
  })

  it('returns false for bench player not subbed in', () => {
    const pick = { element: 1, multiplier: 0 }
    const subbedOut = new Set<number>()
    const subbedIn = new Set<number>()

    expect(wasInFinalTeam(pick, subbedOut, subbedIn)).toBe(false)
  })

  it('returns true for bench player subbed in', () => {
    const pick = { element: 1, multiplier: 0 }
    const subbedOut = new Set<number>()
    const subbedIn = new Set([1])

    expect(wasInFinalTeam(pick, subbedOut, subbedIn)).toBe(true)
  })

  it('returns true for captain not subbed out', () => {
    const pick = { element: 1, multiplier: 2 }
    const subbedOut = new Set<number>()
    const subbedIn = new Set<number>()

    expect(wasInFinalTeam(pick, subbedOut, subbedIn)).toBe(true)
  })
})

describe('getEffectiveMultiplier', () => {
  it('returns original multiplier for non-subbed-in player', () => {
    const pick = { element: 1, multiplier: 2 }
    const subbedIn = new Set<number>()

    expect(getEffectiveMultiplier(pick, subbedIn)).toBe(2)
  })

  it('returns 1 for subbed-in player regardless of original multiplier', () => {
    const pick = { element: 1, multiplier: 0 }
    const subbedIn = new Set([1])

    expect(getEffectiveMultiplier(pick, subbedIn)).toBe(1)
  })
})

describe('calculateGameweekPositionPoints', () => {
  const createMockPicksData = (
    picks: Array<{ element: number; multiplier: number; position: number }>,
    autoSubs: Array<{ element_in: number; element_out: number }> = []
  ): EntryPicksResponse =>
    ({
      picks: picks.map((p) => ({
        element: p.element,
        multiplier: p.multiplier,
        position: p.position,
        is_captain: p.multiplier === 2,
        is_vice_captain: false,
      })),
      automatic_subs: autoSubs,
    }) as EntryPicksResponse

  const createMockLiveData = (
    elements: Array<{ id: number; total_points: number }>
  ): LiveGameweek =>
    ({
      elements: elements.map((e) => ({
        id: e.id,
        stats: { total_points: e.total_points },
      })),
    }) as LiveGameweek

  const createPlayersMap = (
    players: Array<{ id: number; element_type: number }>
  ): Map<number, Player> =>
    new Map(players.map((p) => [p.id, { id: p.id, element_type: p.element_type } as Player]))

  it('calculates points by position for simple lineup', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 1, position: 1 }, // GK
      { element: 2, multiplier: 1, position: 2 }, // DEF
      { element: 3, multiplier: 1, position: 3 }, // MID
      { element: 4, multiplier: 2, position: 4 }, // FWD (C)
    ])

    const liveData = createMockLiveData([
      { id: 1, total_points: 3 },
      { id: 2, total_points: 6 },
      { id: 3, total_points: 8 },
      { id: 4, total_points: 10 },
    ])

    const playersMap = createPlayersMap([
      { id: 1, element_type: 1 }, // GK
      { id: 2, element_type: 2 }, // DEF
      { id: 3, element_type: 3 }, // MID
      { id: 4, element_type: 4 }, // FWD
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result).toEqual({
      1: 3, // GK: 3 * 1
      2: 6, // DEF: 6 * 1
      3: 8, // MID: 8 * 1
      4: 20, // FWD: 10 * 2 (captain)
    })
  })

  it('excludes bench players not subbed in', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 1, position: 1 }, // GK - starter
      { element: 2, multiplier: 0, position: 12 }, // GK - bench
    ])

    const liveData = createMockLiveData([
      { id: 1, total_points: 3 },
      { id: 2, total_points: 8 },
    ])

    const playersMap = createPlayersMap([
      { id: 1, element_type: 1 },
      { id: 2, element_type: 1 },
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[1]).toBe(3) // Only starter counts
  })

  it('handles auto subs correctly', () => {
    const picksData = createMockPicksData(
      [
        { element: 1, multiplier: 1, position: 1 }, // Starter - subbed out
        { element: 2, multiplier: 0, position: 12 }, // Bench - subbed in
      ],
      [{ element_in: 2, element_out: 1 }]
    )

    const liveData = createMockLiveData([
      { id: 1, total_points: 0 },
      { id: 2, total_points: 8 },
    ])

    const playersMap = createPlayersMap([
      { id: 1, element_type: 3 },
      { id: 2, element_type: 3 },
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[3]).toBe(8) // Only subbed-in player counts with 1x
  })

  it('skips player not found in playersMap', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 1, position: 1 },
      { element: 999, multiplier: 1, position: 2 }, // Not in playersMap
    ])

    const liveData = createMockLiveData([
      { id: 1, total_points: 5 },
      { id: 999, total_points: 10 },
    ])

    const playersMap = createPlayersMap([{ id: 1, element_type: 3 }]) // Missing player 999

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[3]).toBe(5) // Only player 1 counted
    expect(result[1]).toBe(0)
    expect(result[2]).toBe(0)
    expect(result[4]).toBe(0)
  })

  it('skips player not found in liveData', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 1, position: 1 },
      { element: 2, multiplier: 1, position: 2 },
    ])

    const liveData = createMockLiveData([{ id: 1, total_points: 5 }]) // Missing player 2

    const playersMap = createPlayersMap([
      { id: 1, element_type: 3 },
      { id: 2, element_type: 2 },
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[3]).toBe(5) // Only player 1 counted
    expect(result[2]).toBe(0) // Player 2 skipped - not in liveData
  })

  it('handles triple captain (3x multiplier)', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 3, position: 1 }, // Triple captain
      { element: 2, multiplier: 1, position: 2 },
    ])

    const liveData = createMockLiveData([
      { id: 1, total_points: 10 },
      { id: 2, total_points: 5 },
    ])

    const playersMap = createPlayersMap([
      { id: 1, element_type: 4 }, // FWD
      { id: 2, element_type: 3 }, // MID
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[4]).toBe(30) // FWD: 10 * 3 (triple captain)
    expect(result[3]).toBe(5) // MID: 5 * 1
  })

  it('handles negative points correctly', () => {
    const picksData = createMockPicksData([
      { element: 1, multiplier: 2, position: 1 }, // Captain with negative points
      { element: 2, multiplier: 1, position: 2 },
    ])

    const liveData = createMockLiveData([
      { id: 1, total_points: -2 }, // Red card, own goal, etc.
      { id: 2, total_points: 6 },
    ])

    const playersMap = createPlayersMap([
      { id: 1, element_type: 2 }, // DEF
      { id: 2, element_type: 3 }, // MID
    ])

    const result = calculateGameweekPositionPoints(picksData, liveData, playersMap)

    expect(result[2]).toBe(-4) // DEF: -2 * 2 (captain)
    expect(result[3]).toBe(6) // MID: 6 * 1
  })
})

describe('aggregatePositionPoints', () => {
  it('sums points across multiple gameweeks', () => {
    const gameweekPoints = [
      { 1: 3, 2: 10, 3: 15, 4: 8 },
      { 1: 5, 2: 12, 3: 20, 4: 6 },
      { 1: 2, 2: 8, 3: 18, 4: 10 },
    ]

    const result = aggregatePositionPoints(gameweekPoints)

    expect(result).toEqual({
      1: 10, // 3 + 5 + 2
      2: 30, // 10 + 12 + 8
      3: 53, // 15 + 20 + 18
      4: 24, // 8 + 6 + 10
    })
  })

  it('returns zeros for empty array', () => {
    const result = aggregatePositionPoints([])

    expect(result).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 })
  })
})

describe('toPositionBreakdown', () => {
  it('converts points to breakdown with percentages', () => {
    const pointsByPosition = { 1: 10, 2: 30, 3: 40, 4: 20 }

    const result = toPositionBreakdown(pointsByPosition)

    expect(result).toEqual([
      { position: 'GKP', points: 10, percentage: 10 },
      { position: 'DEF', points: 30, percentage: 30 },
      { position: 'MID', points: 40, percentage: 40 },
      { position: 'FWD', points: 20, percentage: 20 },
    ])
  })

  it('handles all zeros gracefully', () => {
    const pointsByPosition = { 1: 0, 2: 0, 3: 0, 4: 0 }

    const result = toPositionBreakdown(pointsByPosition)

    expect(result).toEqual([
      { position: 'GKP', points: 0, percentage: 0 },
      { position: 'DEF', points: 0, percentage: 0 },
      { position: 'MID', points: 0, percentage: 0 },
      { position: 'FWD', points: 0, percentage: 0 },
    ])
  })

  it('rounds percentages to whole numbers', () => {
    const pointsByPosition = { 1: 1, 2: 1, 3: 1, 4: 0 }

    const result = toPositionBreakdown(pointsByPosition)

    // 1/3 ≈ 33.33% -> rounds to 33%
    expect(result[0].percentage).toBe(33)
    expect(result[1].percentage).toBe(33)
    expect(result[2].percentage).toBe(33)
  })
})
