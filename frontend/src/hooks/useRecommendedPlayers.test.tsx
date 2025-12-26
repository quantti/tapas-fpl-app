import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  getPercentile,
  calculateFixtureScore,
  calculateLeagueOwnership,
  useRecommendedPlayers,
} from './useRecommendedPlayers'
import { fplApi } from '../services/api'
import type { Player, Fixture, Team } from '../types/fpl'
import type { ManagerGameweekData } from './useFplData'

// Mock API
vi.mock('../services/api', () => ({
  fplApi: {
    getFixtures: vi.fn(),
  },
}))

// ============================================================================
// Unit Tests: getPercentile
// ============================================================================
describe('getPercentile', () => {
  it('returns 0.5 for empty array', () => {
    expect(getPercentile(5, [])).toBe(0.5)
  })

  it('returns 0 for value at minimum', () => {
    expect(getPercentile(1, [1, 2, 3, 4, 5])).toBe(0)
  })

  it('returns correct percentile for value in middle', () => {
    // 3 is greater than 2 values (1, 2) out of 5 = 0.4
    expect(getPercentile(3, [1, 2, 3, 4, 5])).toBe(0.4)
  })

  it('returns high percentile for value at maximum', () => {
    // 5 is greater than 4 values out of 5 = 0.8
    expect(getPercentile(5, [1, 2, 3, 4, 5])).toBe(0.8)
  })

  it('handles duplicate values', () => {
    // 3 is greater than 2 values (1, 2) out of 5 = 0.4
    expect(getPercentile(3, [1, 2, 3, 3, 5])).toBe(0.4)
  })

  it('returns 0 for value below all values', () => {
    expect(getPercentile(0, [1, 2, 3, 4, 5])).toBe(0)
  })

  it('returns correct percentile for value above all values', () => {
    // 10 is greater than 5 values out of 5 = 1.0
    expect(getPercentile(10, [1, 2, 3, 4, 5])).toBe(1)
  })

  it('handles single value array', () => {
    // 5 equals value, so 0 values below = 0
    expect(getPercentile(5, [5])).toBe(0)
    // 10 > 5, so 1 value below = 1.0
    expect(getPercentile(10, [5])).toBe(1)
  })

  it('handles negative values', () => {
    // -1 is greater than 1 value (-2) out of 3 = 0.333...
    expect(getPercentile(-1, [-2, -1, 0])).toBeCloseTo(0.333, 2)
  })

  it('handles unsorted input array', () => {
    // Should sort internally: [1, 2, 3, 4, 5]
    // 3 is greater than 2 values = 0.4
    expect(getPercentile(3, [5, 1, 3, 2, 4])).toBe(0.4)
  })
})

// ============================================================================
// Unit Tests: calculateFixtureScore
// ============================================================================
describe('calculateFixtureScore', () => {
  const makeFixture = (
    event: number | null,
    teamH: number,
    teamA: number,
    teamHDiff: number,
    teamADiff: number
  ): Fixture =>
    ({
      id: Math.random(),
      event,
      team_h: teamH,
      team_a: teamA,
      team_h_difficulty: teamHDiff,
      team_a_difficulty: teamADiff,
      started: false,
      finished: false,
      finished_provisional: false,
      kickoff_time: '2025-01-01T15:00:00Z',
    }) as Fixture

  it('returns 0.5 when no upcoming fixtures', () => {
    expect(calculateFixtureScore(1, [], 17)).toBe(0.5)
  })

  it('returns 0.5 when all fixtures are in past', () => {
    const fixtures = [
      makeFixture(15, 1, 2, 3, 3),
      makeFixture(16, 3, 1, 3, 3),
    ]
    expect(calculateFixtureScore(1, fixtures, 17)).toBe(0.5)
  })

  it('calculates score for home fixture', () => {
    // Team 1 at home, difficulty 1 (easiest) = ease score 1.0
    // Weight for GW+1 is 0.35
    const fixtures = [makeFixture(18, 1, 2, 1, 5)]
    const score = calculateFixtureScore(1, fixtures, 17)
    expect(score).toBeCloseTo(0.35, 2) // 1.0 * 0.35
  })

  it('calculates score for away fixture', () => {
    // Team 1 away, difficulty 5 (hardest) = ease score 0.0
    // Weight for GW+1 is 0.35
    const fixtures = [makeFixture(18, 2, 1, 1, 5)]
    const score = calculateFixtureScore(1, fixtures, 17)
    expect(score).toBeCloseTo(0, 2) // 0.0 * 0.35
  })

  it('weighs nearer fixtures more heavily', () => {
    // GW18: difficulty 5 (hard) = ease 0.0, weight index 0 = 0.35
    // GW22: difficulty 1 (easy) = ease 1.0, weight index 1 = 0.25
    // Weights are assigned by sorted position, not by GW number
    const fixtures = [
      makeFixture(18, 1, 2, 5, 1), // home, hard
      makeFixture(22, 1, 3, 1, 5), // home, easy
    ]
    const score = calculateFixtureScore(1, fixtures, 17)
    // (0 * 0.35) + (1.0 * 0.25) = 0.25
    expect(score).toBeCloseTo(0.25, 2)
  })

  it('ignores fixtures beyond 5 gameweeks', () => {
    // GW23 is beyond currentGW(17) + 5 = 22
    const fixtures = [
      makeFixture(18, 1, 2, 1, 5), // included, easy
      makeFixture(23, 1, 3, 5, 1), // excluded
    ]
    const score = calculateFixtureScore(1, fixtures, 17)
    // Only first fixture: (1.0 * 0.35) = 0.35
    expect(score).toBeCloseTo(0.35, 2)
  })

  it('handles null event values', () => {
    const fixtures = [
      makeFixture(null, 1, 2, 3, 3),
      makeFixture(18, 1, 3, 1, 5), // valid
    ]
    const score = calculateFixtureScore(1, fixtures, 17)
    expect(score).toBeCloseTo(0.35, 2)
  })

  it('calculates full 5-fixture run correctly', () => {
    // All fixtures difficulty 3 (middle) = ease 0.5
    // Weights: 0.35 + 0.25 + 0.2 + 0.12 + 0.08 = 1.0
    const fixtures = [
      makeFixture(18, 1, 2, 3, 3),
      makeFixture(19, 1, 3, 3, 3),
      makeFixture(20, 1, 4, 3, 3),
      makeFixture(21, 1, 5, 3, 3),
      makeFixture(22, 1, 6, 3, 3),
    ]
    const score = calculateFixtureScore(1, fixtures, 17)
    // 0.5 * (0.35 + 0.25 + 0.2 + 0.12 + 0.08) = 0.5 * 1.0 = 0.5
    expect(score).toBeCloseTo(0.5, 2)
  })
})

// ============================================================================
// Unit Tests: calculateLeagueOwnership
// ============================================================================
describe('calculateLeagueOwnership', () => {
  const makePlayer = (id: number): Player =>
    ({
      id,
      web_name: `Player${id}`,
      team: 1,
      element_type: 3,
      status: 'a',
      minutes: 900,
      form: '5.0',
      expected_goals: '2.0',
      expected_assists: '1.5',
      expected_goals_conceded: '0.5',
      clean_sheets: 5,
    }) as Player

  const makeManager = (id: number, playerIds: number[]): ManagerGameweekData =>
    ({
      entry: id,
      picks: playerIds.map((pid) => ({ playerId: pid, position: 1, multiplier: 1, is_captain: false, is_vice_captain: false })),
    }) as ManagerGameweekData

  it('returns empty map for empty managers', () => {
    const players = [makePlayer(1), makePlayer(2)]
    const result = calculateLeagueOwnership(players, [])
    expect(result.size).toBe(0)
  })

  it('returns 1.0 for player owned by all managers', () => {
    const players = [makePlayer(1)]
    const managers = [makeManager(1, [1]), makeManager(2, [1]), makeManager(3, [1])]
    const result = calculateLeagueOwnership(players, managers)
    expect(result.get(1)).toBe(1)
  })

  it('returns 0 for player owned by no managers', () => {
    const players = [makePlayer(1), makePlayer(2)]
    const managers = [makeManager(1, [1]), makeManager(2, [1])]
    const result = calculateLeagueOwnership(players, managers)
    expect(result.get(2)).toBe(0)
  })

  it('calculates fractional ownership correctly', () => {
    const players = [makePlayer(1)]
    const managers = [
      makeManager(1, [1]),
      makeManager(2, [1]),
      makeManager(3, [2]), // doesn't own player 1
      makeManager(4, [2]),
    ]
    const result = calculateLeagueOwnership(players, managers)
    expect(result.get(1)).toBe(0.5) // 2 of 4 managers
  })

  it('handles single manager', () => {
    const players = [makePlayer(1), makePlayer(2)]
    const managers = [makeManager(1, [1])]
    const result = calculateLeagueOwnership(players, managers)
    expect(result.get(1)).toBe(1)
    expect(result.get(2)).toBe(0)
  })

  it('handles multiple players per manager', () => {
    const players = [makePlayer(1), makePlayer(2), makePlayer(3)]
    const managers = [
      makeManager(1, [1, 2, 3]),
      makeManager(2, [1, 2]),
    ]
    const result = calculateLeagueOwnership(players, managers)
    expect(result.get(1)).toBe(1) // 2/2
    expect(result.get(2)).toBe(1) // 2/2
    expect(result.get(3)).toBe(0.5) // 1/2
  })
})

// ============================================================================
// Characterization Tests: useRecommendedPlayers hook
// ============================================================================
describe('useRecommendedPlayers', () => {
  let queryClient: QueryClient

  const createWrapper = () => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
  }

  const makePlayer = (
    id: number,
    elementType: number,
    overrides: Partial<Player> = {}
  ): Player =>
    ({
      id,
      web_name: `Player${id}`,
      team: 1,
      element_type: elementType,
      status: 'a',
      minutes: 900,
      form: '5.0',
      expected_goals: '2.0',
      expected_assists: '1.5',
      expected_goals_conceded: '0.5',
      clean_sheets: 5,
      now_cost: 60,
      ...overrides,
    }) as Player

  const makeTeam = (id: number): Team =>
    ({
      id,
      name: `Team ${id}`,
      short_name: `T${id}`,
    }) as Team

  const makeManager = (id: number, playerIds: number[]): ManagerGameweekData =>
    ({
      entry: id,
      picks: playerIds.map((pid) => ({
        playerId: pid,
        position: 1,
        multiplier: 1,
        is_captain: false,
        is_vice_captain: false,
      })),
    }) as ManagerGameweekData

  const mockFixtures: Fixture[] = [
    {
      id: 1,
      event: 18,
      team_h: 1,
      team_a: 2,
      team_h_difficulty: 2,
      team_a_difficulty: 3,
      started: false,
      finished: false,
      finished_provisional: false,
      kickoff_time: '2025-01-01T15:00:00Z',
    } as Fixture,
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.mocked(fplApi.getFixtures).mockResolvedValue(mockFixtures)
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('returns empty arrays when players is empty', async () => {
    const teamsMap = new Map([[1, makeTeam(1)]])
    const { result } = renderHook(
      () => useRecommendedPlayers([], [], teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.punts).toEqual([])
    expect(result.current.defensive).toEqual([])
    expect(result.current.toSell).toEqual([])
  })

  it('excludes goalkeepers from all lists', async () => {
    const players = [
      makePlayer(1, 1), // GK
      makePlayer(2, 3), // MID
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [makeManager(1, [1, 2])]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // No goalkeeper in any list
    const allPlayers = [
      ...result.current.punts,
      ...result.current.defensive,
      ...result.current.toSell,
    ]
    expect(allPlayers.every((p) => p.player.element_type !== 1)).toBe(true)
  })

  it('excludes unavailable players', async () => {
    const players = [
      makePlayer(1, 3, { status: 'i' }), // injured
      makePlayer(2, 3, { status: 'a' }), // available
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [makeManager(1, [1, 2])]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    const allPlayers = [
      ...result.current.punts,
      ...result.current.defensive,
      ...result.current.toSell,
    ]
    expect(allPlayers.every((p) => p.player.status === 'a')).toBe(true)
  })

  it('excludes players with less than 450 minutes', async () => {
    const players = [
      makePlayer(1, 3, { minutes: 400 }), // below threshold
      makePlayer(2, 3, { minutes: 450 }), // at threshold
      makePlayer(3, 3, { minutes: 900 }), // above threshold
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers: ManagerGameweekData[] = []

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Only players 2 and 3 should be eligible for punts (low ownership)
    const puntIds = result.current.punts.map((p) => p.player.id)
    expect(puntIds).not.toContain(1)
  })

  it('punts filters for ownership < 40%', async () => {
    const players = [
      makePlayer(1, 3), // will have 100% ownership
      makePlayer(2, 3), // will have 50% ownership
      makePlayer(3, 3), // will have 0% ownership
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [
      makeManager(1, [1, 2]),
      makeManager(2, [1]),
    ]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Punts should only have player 3 (0% ownership)
    const puntIds = result.current.punts.map((p) => p.player.id)
    expect(puntIds).toContain(3)
    expect(puntIds).not.toContain(1) // 100% >= 40%
    expect(puntIds).not.toContain(2) // 50% >= 40%
  })

  it('defensive filters for 40% < ownership < 100%', async () => {
    const players = [
      makePlayer(1, 3), // will have 100% ownership (excluded)
      makePlayer(2, 3), // will have 50% ownership (included)
      makePlayer(3, 3), // will have 25% ownership (excluded - too low)
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [
      makeManager(1, [1, 2]),
      makeManager(2, [1, 2]),
      makeManager(3, [1, 3]),
      makeManager(4, [1]),
    ]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    const defIds = result.current.defensive.map((p) => p.player.id)
    expect(defIds).toContain(2) // 50% - in range
    expect(defIds).not.toContain(1) // 100% - too high
    expect(defIds).not.toContain(3) // 25% - too low
  })

  it('toSell filters for ownership > 0', async () => {
    const players = [
      makePlayer(1, 3, { form: '0.5' }), // owned, bad form
      makePlayer(2, 3, { form: '0.5' }), // not owned
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [makeManager(1, [1])]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    const sellIds = result.current.toSell.map((p) => p.player.id)
    expect(sellIds).not.toContain(2) // 0% ownership - excluded
  })

  it('returns loading true while fixtures are fetching', async () => {
    vi.mocked(fplApi.getFixtures).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )

    const players = [makePlayer(1, 3)]
    const teamsMap = new Map([[1, makeTeam(1)]])

    const { result } = renderHook(
      () => useRecommendedPlayers(players, [], teamsMap, 17),
      { wrapper: createWrapper() }
    )

    expect(result.current.loading).toBe(true)
  })

  it('limits punts to top 20', async () => {
    // Create 25 eligible players
    const players = Array.from({ length: 25 }, (_, i) =>
      makePlayer(i + 1, 3, { form: String(5 - i * 0.1) })
    )
    const teamsMap = new Map([[1, makeTeam(1)]])

    const { result } = renderHook(
      () => useRecommendedPlayers(players, [], teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.punts.length).toBeLessThanOrEqual(20)
  })

  it('limits defensive to top 10', async () => {
    // Create 15 eligible players with 50% ownership
    const players = Array.from({ length: 15 }, (_, i) =>
      makePlayer(i + 1, 3)
    )
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [
      makeManager(1, players.slice(0, 8).map((p) => p.id)),
      makeManager(2, players.slice(7, 15).map((p) => p.id)),
    ]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.defensive.length).toBeLessThanOrEqual(10)
  })

  it('limits toSell to top 10', async () => {
    // Create 15 bad players owned by managers
    const players = Array.from({ length: 15 }, (_, i) =>
      makePlayer(i + 1, 3, { form: '0.1' }) // very bad form
    )
    const teamsMap = new Map([[1, makeTeam(1)]])
    const managers = [makeManager(1, players.map((p) => p.id))]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.toSell.length).toBeLessThanOrEqual(10)
  })

  it('sorts punts by score descending', async () => {
    const players = [
      makePlayer(1, 3, { form: '1.0' }), // low score
      makePlayer(2, 3, { form: '8.0' }), // high score
      makePlayer(3, 3, { form: '5.0' }), // medium score
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])

    const { result } = renderHook(
      () => useRecommendedPlayers(players, [], teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    const scores = result.current.punts.map((p) => p.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })

  it('returns error when fixtures API fails', async () => {
    vi.mocked(fplApi.getFixtures).mockRejectedValue(new Error('Network error'))

    const players = [makePlayer(1, 3)]
    const teamsMap = new Map([[1, makeTeam(1)]])

    const { result } = renderHook(
      () => useRecommendedPlayers(players, [], teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Error is captured
    expect(result.current.error).toBe('Network error')
    // Hook gracefully degrades - uses default fixture scores (0.5)
    // Lists are still populated based on available data
  })

  it('toSell excludes players with score <= 0.5', async () => {
    // Create players across the spectrum so percentiles work correctly
    // Player 1: excellent form (should NOT be in toSell)
    // Player 2: poor form (should be in toSell)
    const players = [
      makePlayer(1, 3, { form: '8.0', expected_goals: '5.0', expected_assists: '3.0' }), // great
      makePlayer(2, 3, { form: '1.0', expected_goals: '0.5', expected_assists: '0.2' }), // poor
      makePlayer(3, 3, { form: '5.0', expected_goals: '2.0', expected_assists: '1.0' }), // avg
      makePlayer(4, 3, { form: '6.0', expected_goals: '3.0', expected_assists: '2.0' }), // good
      makePlayer(5, 3, { form: '3.0', expected_goals: '1.0', expected_assists: '0.5' }), // below avg
    ]
    const teamsMap = new Map([[1, makeTeam(1)]])
    // All managers own player 1 (great player) - should NOT be in toSell
    const managers = [makeManager(1, [1]), makeManager(2, [1])]

    const { result } = renderHook(
      () => useRecommendedPlayers(players, managers, teamsMap, 17),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Player 1 (great form) should NOT be in toSell even though owned
    const sellIds = result.current.toSell.map((p) => p.player.id)
    expect(sellIds).not.toContain(1)
  })
})
