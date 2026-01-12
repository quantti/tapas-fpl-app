import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { backendApi, BackendApiError } from '../backendApi';

import { useRecommendedPlayers } from './useRecommendedPlayers';

import type { ReactNode } from 'react';
import type { Player, Team } from 'types/fpl';
import type { LeagueRecommendationsResponse } from '../backendApi';

// Mock backendApi
vi.mock('../backendApi', async () => {
  const actual = await vi.importActual<typeof import('../backendApi')>('../backendApi');
  return {
    ...actual,
    backendApi: {
      ...actual.backendApi,
      getLeagueRecommendations: vi.fn(),
    },
  };
});

// ============================================================================
// Test Helpers
// ============================================================================

const makePlayer = (id: number, overrides: Partial<Player> = {}): Player =>
  ({
    id,
    web_name: `Player${id}`,
    team: 1,
    element_type: 3, // MID
    status: 'a',
    ...overrides,
  }) as Player;

const makeTeam = (id: number): Team =>
  ({
    id,
    name: `Team ${id}`,
    short_name: `T${id}`,
  }) as Team;

const mockApiResponse: LeagueRecommendationsResponse = {
  league_id: 12345,
  season_id: 1,
  punts: [
    {
      id: 1,
      name: 'Player1',
      team: 1,
      position: 3,
      price: 60,
      ownership: 15,
      score: 0.85,
      xg90: 0.5,
      xa90: 0.3,
      form: 7.5,
    },
    {
      id: 2,
      name: 'Player2',
      team: 2,
      position: 4,
      price: 75,
      ownership: 25,
      score: 0.72,
      xg90: 0.4,
      xa90: 0.2,
      form: 6.0,
    },
  ],
  defensive: [
    {
      id: 3,
      name: 'Player3',
      team: 1,
      position: 3,
      price: 100,
      ownership: 65,
      score: 0.9,
      xg90: 0.6,
      xa90: 0.4,
      form: 8.5,
    },
  ],
  time_to_sell: [
    {
      id: 4,
      name: 'Player4',
      team: 3,
      position: 2,
      price: 55,
      ownership: 40,
      score: 0.3,
      sell_score: 0.75,
      xg90: 0.1,
      xa90: 0.0,
      form: 2.0,
    },
  ],
};

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

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns empty arrays when playersMap is empty', async () => {
    const playersMap = new Map<number, Player>();
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    // Query should be disabled when playersMap is empty
    expect(result.current.loading).toBe(false);
    expect(result.current.punts).toEqual([]);
    expect(result.current.defensive).toEqual([]);
    expect(result.current.toSell).toEqual([]);
  });

  it('calls backend API with correct leagueId', async () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockResolvedValue(mockApiResponse);

    const playersMap = new Map([
      [1, makePlayer(1)],
      [2, makePlayer(2)],
      [3, makePlayer(3)],
      [4, makePlayer(4)],
    ]);
    const teamsMap = new Map([
      [1, makeTeam(1)],
      [2, makeTeam(2)],
      [3, makeTeam(3)],
    ]);

    renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(backendApi.getLeagueRecommendations).toHaveBeenCalledWith(12345, {
        seasonId: 1,
        limit: 20,
      });
    });
  });

  it('transforms backend response to RecommendedPlayer format', async () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockResolvedValue(mockApiResponse);

    const playersMap = new Map([
      [1, makePlayer(1, { element_type: 3 })],
      [2, makePlayer(2, { element_type: 4 })],
      [3, makePlayer(3, { element_type: 3 })],
      [4, makePlayer(4, { element_type: 2 })],
    ]);
    const teamsMap = new Map([
      [1, makeTeam(1)],
      [2, makeTeam(2)],
      [3, makeTeam(3)],
    ]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Punts should have players from punts array
    expect(result.current.punts).toHaveLength(2);
    expect(result.current.punts[0]).toEqual({
      player: playersMap.get(1),
      team: teamsMap.get(1),
      score: 0.85,
      fixtureScore: 0,
      leagueOwnership: 0.15, // Backend returns 0-100, we convert to 0-1
    });

    // Defensive should have players from defensive array
    expect(result.current.defensive).toHaveLength(1);
    expect(result.current.defensive[0].player).toBe(playersMap.get(3));

    // ToSell should use sell_score if available
    expect(result.current.toSell).toHaveLength(1);
    expect(result.current.toSell[0].score).toBe(0.75); // sell_score used
  });

  it('filters out players not in playersMap', async () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockResolvedValue(mockApiResponse);

    // Only include player 1, not 2
    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([
      [1, makeTeam(1)],
      [2, makeTeam(2)],
    ]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only player 1 should be in punts (player 2 filtered out)
    expect(result.current.punts).toHaveLength(1);
    expect(result.current.punts[0].player.id).toBe(1);
  });

  it('filters out players with missing team', async () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockResolvedValue(mockApiResponse);

    const playersMap = new Map([
      [1, makePlayer(1)],
      [2, makePlayer(2)],
    ]);
    // Only include team 1, not team 2
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only player 1 should be in punts (player 2's team missing)
    expect(result.current.punts).toHaveLength(1);
    expect(result.current.punts[0].player.id).toBe(1);
  });

  it('returns loading true while fetching', () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
  });

  it('returns error message on API failure', async () => {
    vi.mocked(backendApi.getLeagueRecommendations).mockRejectedValue(new Error('Network error'));

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    // Wait for error to appear (query may retry before settling)
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });

    expect(result.current.error).toBe('Failed to load recommendations.');
    expect(result.current.punts).toEqual([]);
  });

  it('returns specific error for rate limiting (429)', async () => {
    // BackendApiError(status, statusText, detail)
    const rateLimitError = new BackendApiError(429, 'Too Many Requests', 'Rate limited');
    vi.mocked(backendApi.getLeagueRecommendations).mockRejectedValue(rateLimitError);

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });

    expect(result.current.error).toBe('Rate limited. Please try again later.');
  });

  it('returns specific error for service unavailable (503)', async () => {
    // BackendApiError(status, statusText, detail)
    const unavailableError = new BackendApiError(503, 'Service Unavailable', 'Backend down');
    vi.mocked(backendApi.getLeagueRecommendations).mockRejectedValue(unavailableError);

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    // Service unavailable doesn't retry, so error appears quickly
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBe('Recommendations service temporarily unavailable.');
  });

  it('does not retry on service unavailable errors', async () => {
    const unavailableError = new BackendApiError(503, 'Service Unavailable', 'Backend down');
    vi.mocked(backendApi.getLeagueRecommendations).mockRejectedValue(unavailableError);

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      // Should only be called once (no retries)
      expect(backendApi.getLeagueRecommendations).toHaveBeenCalledTimes(1);
    });
  });

  it('respects enabled option', async () => {
    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap, { enabled: false }), {
      wrapper: createWrapper(),
    });

    // API should not be called when disabled
    expect(backendApi.getLeagueRecommendations).not.toHaveBeenCalled();
  });

  it('converts ownership from 0-100 to 0-1 range', async () => {
    const response: LeagueRecommendationsResponse = {
      ...mockApiResponse,
      punts: [
        {
          id: 1,
          name: 'Player1',
          team: 1,
          position: 3,
          price: 60,
          ownership: 50, // 50% in backend format
          score: 0.8,
          xg90: 0.5,
          xa90: 0.3,
          form: 7.0,
        },
      ],
    };
    vi.mocked(backendApi.getLeagueRecommendations).mockResolvedValue(response);

    const playersMap = new Map([[1, makePlayer(1)]]);
    const teamsMap = new Map([[1, makeTeam(1)]]);

    const { result } = renderHook(() => useRecommendedPlayers(12345, playersMap, teamsMap), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Ownership should be converted: 50 → 0.5
    expect(result.current.punts[0].leagueOwnership).toBe(0.5);
  });
});
