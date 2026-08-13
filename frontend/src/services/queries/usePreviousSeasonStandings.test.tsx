import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BackendApiError, backendApi } from 'services/backendApi';

import { usePreviousSeasonStandings } from './usePreviousSeasonStandings';

import type { ReactNode } from 'react';
import type { LeagueHistoryResponse } from 'services/backendApi';

// Mock the backendApi module
vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return {
    ...actual,
    backendApi: {
      getLeagueHistory: vi.fn(),
    },
  };
});

const mockGetLeagueHistory = vi.mocked(backendApi.getLeagueHistory);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeManager(
  managerId: number,
  name: string,
  teamName: string,
  gwPoints: [number, number][] // [gameweek, totalPoints]
): LeagueHistoryResponse['managers'][number] {
  return {
    manager_id: managerId,
    name,
    team_name: teamName,
    history: gwPoints.map(([gameweek, totalPoints]) => ({
      gameweek,
      gameweek_points: 50,
      total_points: totalPoints,
      overall_rank: 1000,
      transfers_made: 1,
      transfers_cost: 0,
      points_on_bench: 5,
      bank: 0,
      team_value: 1000,
      active_chip: null,
    })),
    chips: [],
  };
}

const mockResponse: LeagueHistoryResponse = {
  league_id: 123,
  season_id: 1,
  current_gameweek: 38,
  managers: [
    makeManager(1, 'Manager A', 'Team A', [
      [37, 2100],
      [38, 2150],
    ]),
    makeManager(2, 'Manager B', 'Team B', [[38, 2300]]),
    makeManager(3, 'Manager C', 'Team C', [[38, 1900]]),
  ],
};

describe('usePreviousSeasonStandings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns final standings sorted by total points descending', async () => {
    mockGetLeagueHistory.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.standings).toEqual([
      { managerId: 2, managerName: 'Manager B', teamName: 'Team B', totalPoints: 2300 },
      { managerId: 1, managerName: 'Manager A', teamName: 'Team A', totalPoints: 2150 },
      { managerId: 3, managerName: 'Manager C', teamName: 'Team C', totalPoints: 1900 },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('uses the last gameweek total points, not an intermediate one', async () => {
    mockGetLeagueHistory.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Manager A had 2100 at GW37 and 2150 at GW38 - final should be 2150
    expect(result.current.standings[1].totalPoints).toBe(2150);
  });

  it('filters out managers with no history', async () => {
    mockGetLeagueHistory.mockResolvedValue({
      ...mockResponse,
      managers: [...mockResponse.managers, makeManager(4, 'Late Joiner', 'Team D', [])],
    });

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.standings).toHaveLength(3);
  });

  it('calls backend API with correct leagueId and seasonId', async () => {
    mockGetLeagueHistory.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetLeagueHistory).toHaveBeenCalledWith(123, 1);
  });

  it('returns error message on API failure', async () => {
    mockGetLeagueHistory.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    // Wait for error to appear (query may retry before settling)
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 5000 });

    expect(result.current.error).toBe('Network error');
    expect(result.current.standings).toEqual([]);
  });

  it('flags backend unavailable on 503', async () => {
    mockGetLeagueHistory.mockRejectedValue(
      new BackendApiError(503, 'Service Unavailable', 'Database not available')
    );

    const { result } = renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.isBackendUnavailable).toBe(true);
  });

  it('does not fetch when disabled', () => {
    mockGetLeagueHistory.mockResolvedValue(mockResponse);

    renderHook(() => usePreviousSeasonStandings(123, { seasonId: 1, enabled: false }), {
      wrapper: createWrapper(),
    });

    expect(mockGetLeagueHistory).not.toHaveBeenCalled();
  });
});
