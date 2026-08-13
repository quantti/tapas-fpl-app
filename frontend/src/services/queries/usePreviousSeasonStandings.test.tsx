import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BackendApiError, backendApi } from 'services/backendApi';
import { usePreviousSeasonStandings } from './usePreviousSeasonStandings';

import type { LeagueHistoryResponse } from 'services/backendApi';
import type { ReactNode } from 'react';

vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return { ...actual, backendApi: { getLeagueHistory: vi.fn() } };
});

const mockGet = vi.mocked(backendApi.getLeagueHistory);

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockResp: LeagueHistoryResponse = {
  league_id: 1,
  season_id: 1,
  current_gameweek: 38,
  managers: [
    {
      manager_id: 1,
      name: 'A',
      team_name: 'T1',
      history: [
        {
          gameweek: 38,
          gameweek_points: 50,
          total_points: 2300,
          overall_rank: 1,
          transfers_made: 0,
          transfers_cost: 0,
          points_on_bench: 0,
          bank: 0,
          team_value: 1000,
          active_chip: null,
        },
      ],
      chips: [],
    },
    {
      manager_id: 2,
      name: 'B',
      team_name: 'T2',
      history: [
        {
          gameweek: 38,
          gameweek_points: 40,
          total_points: 2100,
          overall_rank: 2,
          transfers_made: 0,
          transfers_cost: 0,
          points_on_bench: 0,
          bank: 0,
          team_value: 1000,
          active_chip: null,
        },
      ],
      chips: [],
    },
  ],
};

describe('usePreviousSeasonStandings', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.resetAllMocks());

  it('sorts by totalPoints descending', async () => {
    mockGet.mockResolvedValue(mockResp);
    const { result } = renderHook(() => usePreviousSeasonStandings(1, { seasonId: 1 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.standings).toEqual([
      { managerId: 1, managerName: 'A', teamName: 'T1', totalPoints: 2300 },
      { managerId: 2, managerName: 'B', teamName: 'T2', totalPoints: 2100 },
    ]);
  });

  it('handles backend 503 gracefully', async () => {
    mockGet.mockRejectedValue(new BackendApiError(503, 'Unavailable'));
    const { result } = renderHook(() => usePreviousSeasonStandings(1, { seasonId: 1 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.standings).toEqual([]);
  });

  it('filters managers with no history', async () => {
    mockGet.mockResolvedValue({
      ...mockResp,
      managers: [
        ...mockResp.managers,
        { manager_id: 3, name: 'C', team_name: 'T3', history: [], chips: [] },
      ],
    });
    const { result } = renderHook(() => usePreviousSeasonStandings(1, { seasonId: 1 }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.standings).toHaveLength(2);
  });
});
