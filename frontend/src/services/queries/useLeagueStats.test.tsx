import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BackendApiError, backendApi } from 'services/backendApi';

import { useLeagueStats } from './useLeagueStats';

import type { ReactNode } from 'react';

// Mock the backendApi module
vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return {
    ...actual,
    backendApi: {
      getLeagueStats: vi.fn(),
    },
  };
});

const mockGetLeagueStats = vi.mocked(backendApi.getLeagueStats);

// Create a wrapper with QueryClient for each test
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

describe('useLeagueStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('successful data fetching', () => {
    it('returns bench points, free transfers, and captain differential', async () => {
      const mockResponse = {
        league_id: 123,
        season_id: 1,
        current_gameweek: 10,
        bench_points: [
          { manager_id: 1, name: 'Manager 1', bench_points: 50 },
          { manager_id: 2, name: 'Manager 2', bench_points: 30 },
        ],
        free_transfers: [
          { manager_id: 1, name: 'Manager 1', free_transfers: 2 },
          { manager_id: 2, name: 'Manager 2', free_transfers: 5 },
        ],
        captain_differential: [
          { manager_id: 1, name: 'Manager 1', differential_picks: 3, gain: 15 },
          { manager_id: 2, name: 'Manager 2', differential_picks: 1, gain: -5 },
        ],
      };

      mockGetLeagueStats.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.benchPoints).toHaveLength(2);
      // Hook transforms snake_case to camelCase
      expect(result.current.benchPoints[0].benchPoints).toBe(50);

      expect(result.current.freeTransfers).toHaveLength(2);
      expect(result.current.freeTransfers[1].freeTransfers).toBe(5);

      expect(result.current.captainDifferential).toHaveLength(2);
      expect(result.current.captainDifferential[0].gain).toBe(15);

      expect(result.current.currentGameweek).toBe(10);
      expect(result.current.error).toBeNull();
    });

    it('transforms nested captain differential details to camelCase', async () => {
      const mockResponse = {
        league_id: 123,
        season_id: 1,
        current_gameweek: 10,
        bench_points: [],
        free_transfers: [],
        captain_differential: [
          {
            manager_id: 1,
            name: 'Manager 1',
            differential_picks: 1,
            gain: 10,
            details: [
              {
                gameweek: 5,
                captain_id: 427,
                captain_name: 'Salah',
                captain_points: 12,
                template_id: 351,
                template_name: 'Haaland',
                template_points: 8,
                gain: 8,
                multiplier: 2,
              },
            ],
          },
        ],
      };

      mockGetLeagueStats.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Verify nested details are transformed to camelCase
      const detail = result.current.captainDifferential[0].details[0];
      expect(detail.captainId).toBe(427);
      expect(detail.captainName).toBe('Salah');
      expect(detail.captainPoints).toBe(12);
      expect(detail.templateId).toBe(351);
      expect(detail.templateName).toBe('Haaland');
      expect(detail.templatePoints).toBe(8);
    });

    it('passes correct parameters to API', async () => {
      mockGetLeagueStats.mockResolvedValue({
        league_id: 456,
        season_id: 2,
        current_gameweek: 15,
        bench_points: [],
        free_transfers: [],
        captain_differential: [],
      });

      renderHook(() => useLeagueStats(456, 15, { seasonId: 2 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(mockGetLeagueStats).toHaveBeenCalled());

      expect(mockGetLeagueStats).toHaveBeenCalledWith(456, 15, 2);
    });
  });

  describe('loading state', () => {
    it('returns isLoading true while fetching', async () => {
      // Create a promise that we control
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetLeagueStats.mockReturnValue(promise as never);

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.benchPoints).toEqual([]);
      expect(result.current.freeTransfers).toEqual([]);
      expect(result.current.captainDifferential).toEqual([]);

      // Resolve to clean up
      resolvePromise!({
        league_id: 123,
        season_id: 1,
        current_gameweek: 10,
        bench_points: [],
        free_transfers: [],
        captain_differential: [],
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  describe('error handling', () => {
    it('returns error message on API failure', async () => {
      mockGetLeagueStats.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      // Longer timeout needed because hook has its own retry config (2 retries with exponential backoff)
      await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isBackendUnavailable).toBe(false);
    });

    it('detects backend unavailable (503)', async () => {
      mockGetLeagueStats.mockRejectedValue(
        new BackendApiError(503, 'Service Unavailable', 'Database not available')
      );

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
      expect(result.current.error).toBe('Database not available');
    });

    it('detects network error as backend unavailable', async () => {
      mockGetLeagueStats.mockRejectedValue(
        new BackendApiError(0, 'Network Error', 'Failed to fetch')
      );

      const { result } = renderHook(() => useLeagueStats(123, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
    });
  });

  describe('query enablement', () => {
    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useLeagueStats(123, 10, { enabled: false }), {
        wrapper: createWrapper(),
      });

      // Wait a bit to ensure no fetch happens
      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueStats).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('does not fetch when leagueId is 0', async () => {
      const { result } = renderHook(() => useLeagueStats(0, 10), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueStats).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('does not fetch when currentGameweek is 0', async () => {
      const { result } = renderHook(() => useLeagueStats(123, 0), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueStats).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });
  });
});
