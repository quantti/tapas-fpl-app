import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { POSITION_TYPES } from 'constants/positions';

import { fplApi } from '../api';

import { useRecommendedPlayers } from './useRecommendedPlayers';

import type { ManagerGameweekData } from './useFplData';
import type { ReactNode } from 'react';
import type { Player, Fixture, Team } from 'types/fpl';

// Note: Pure function tests (getPercentile, calculateFixtureScore, calculateLeagueOwnership)
// are in src/utils/playerScoring.test.ts with comprehensive coverage (51 tests)

// Mock API
vi.mock('../api', () => ({
  fplApi: {
    getFixtures: vi.fn(),
  },
}));

// Shared test helpers
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
  }) as ManagerGameweekData;

// ============================================================================
// Integration Tests: useRecommendedPlayers hook
// ============================================================================
describe('useRecommendedPlayers', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  };

  const makePlayer = (id: number, elementType: number, overrides: Partial<Player> = {}): Player =>
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
    }) as Player;

  const makeTeam = (id: number): Team =>
    ({
      id,
      name: `Team ${id}`,
      short_name: `T${id}`,
    }) as Team;

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
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.mocked(fplApi.getFixtures).mockResolvedValue(mockFixtures);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns empty arrays when players is empty', async () => {
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const { result } = renderHook(() => useRecommendedPlayers([], [], teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.punts).toEqual([]);
    expect(result.current.defensive).toEqual([]);
    expect(result.current.toSell).toEqual([]);
  });

  it('excludes goalkeepers from all lists', async () => {
    const players = [
      makePlayer(1, 1), // GK
      makePlayer(2, 3), // MID
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [makeManager(1, [1, 2])];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // No goalkeeper in any list
    const allPlayers = [
      ...result.current.punts,
      ...result.current.defensive,
      ...result.current.toSell,
    ];
    expect(allPlayers.every((p) => p.player.element_type !== POSITION_TYPES.GOALKEEPER)).toBe(true);
  });

  it('excludes unavailable players', async () => {
    const players = [
      makePlayer(1, 3, { status: 'i' }), // injured
      makePlayer(2, 3, { status: 'a' }), // available
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [makeManager(1, [1, 2])];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const allPlayers = [
      ...result.current.punts,
      ...result.current.defensive,
      ...result.current.toSell,
    ];
    expect(allPlayers.every((p) => p.player.status === 'a')).toBe(true);
  });

  it('excludes players with less than 450 minutes', async () => {
    const players = [
      makePlayer(1, 3, { minutes: 400 }), // below threshold
      makePlayer(2, 3, { minutes: 450 }), // at threshold
      makePlayer(3, 3, { minutes: 900 }), // above threshold
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers: ManagerGameweekData[] = [];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only players 2 and 3 should be eligible for punts (low ownership)
    const puntIds = result.current.punts.map((p) => p.player.id);
    expect(puntIds).not.toContain(1);
  });

  it('punts filters for ownership < 40%', async () => {
    const players = [
      makePlayer(1, 3), // will have 100% ownership
      makePlayer(2, 3), // will have 50% ownership
      makePlayer(3, 3), // will have 0% ownership
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [makeManager(1, [1, 2]), makeManager(2, [1])];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Punts should only have player 3 (0% ownership)
    const puntIds = result.current.punts.map((p) => p.player.id);
    expect(puntIds).toContain(3);
    expect(puntIds).not.toContain(1); // 100% >= 40%
    expect(puntIds).not.toContain(2); // 50% >= 40%
  });

  it('defensive filters for 40% < ownership < 100%', async () => {
    const players = [
      makePlayer(1, 3), // will have 100% ownership (excluded)
      makePlayer(2, 3), // will have 50% ownership (included)
      makePlayer(3, 3), // will have 25% ownership (excluded - too low)
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [
      makeManager(1, [1, 2]),
      makeManager(2, [1, 2]),
      makeManager(3, [1, 3]),
      makeManager(4, [1]),
    ];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const defIds = result.current.defensive.map((p) => p.player.id);
    expect(defIds).toContain(2); // 50% - in range
    expect(defIds).not.toContain(1); // 100% - too high
    expect(defIds).not.toContain(3); // 25% - too low
  });

  it('toSell filters for ownership > 0', async () => {
    const players = [
      makePlayer(1, 3, { form: '0.5' }), // owned, bad form
      makePlayer(2, 3, { form: '0.5' }), // not owned
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [makeManager(1, [1])];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const sellIds = result.current.toSell.map((p) => p.player.id);
    expect(sellIds).not.toContain(2); // 0% ownership - excluded
  });

  it('returns loading true while fixtures are fetching', async () => {
    vi.mocked(fplApi.getFixtures).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    const players = [makePlayer(1, 3)];
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(players, [], teamsMap, 17), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
  });

  it('limits punts to top 20', async () => {
    // Create 25 eligible players
    const players = Array.from({ length: 25 }, (_, i) =>
      makePlayer(i + 1, 3, { form: String(5 - i * 0.1) })
    );
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(players, [], teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.punts.length).toBeLessThanOrEqual(20);
  });

  it('limits defensive to top 10', async () => {
    // Create 15 eligible players with 50% ownership
    const players = Array.from({ length: 15 }, (_, i) => makePlayer(i + 1, 3));
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [
      makeManager(
        1,
        players.slice(0, 8).map((p) => p.id)
      ),
      makeManager(
        2,
        players.slice(7, 15).map((p) => p.id)
      ),
    ];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.defensive.length).toBeLessThanOrEqual(10);
  });

  it('limits toSell to top 10', async () => {
    // Create 15 bad players owned by managers
    const players = Array.from(
      { length: 15 },
      (_, i) => makePlayer(i + 1, 3, { form: '0.1' }) // very bad form
    );
    const teamsMap = new Map([[1, makeTeam(1)]]);
    const managers = [
      makeManager(
        1,
        players.map((p) => p.id)
      ),
    ];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.toSell.length).toBeLessThanOrEqual(10);
  });

  it('sorts punts by score descending', async () => {
    const players = [
      makePlayer(1, 3, { form: '1.0' }), // low score
      makePlayer(2, 3, { form: '8.0' }), // high score
      makePlayer(3, 3, { form: '5.0' }), // medium score
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(players, [], teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const scores = result.current.punts.map((p) => p.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('returns error when fixtures API fails', async () => {
    vi.mocked(fplApi.getFixtures).mockRejectedValue(new Error('Network error'));

    const players = [makePlayer(1, 3)];
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(players, [], teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Error is captured
    expect(result.current.error).toBe('Network error');
    // Hook gracefully degrades - uses default fixture scores (0.5)
    // Lists are still populated based on available data
  });

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
    ];
    const teamsMap = new Map([[1, makeTeam(1)]]);
    // All managers own player 1 (great player) - should NOT be in toSell
    const managers = [makeManager(1, [1]), makeManager(2, [1])];

    const { result } = renderHook(() => useRecommendedPlayers(players, managers, teamsMap, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Player 1 (great form) should NOT be in toSell even though owned
    const sellIds = result.current.toSell.map((p) => p.player.id);
    expect(sellIds).not.toContain(1);
  });
});
