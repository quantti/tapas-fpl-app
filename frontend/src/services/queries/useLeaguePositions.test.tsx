import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BackendApiError, backendApi } from 'services/backendApi';

import { useLeaguePositions } from './useLeaguePositions';

import type { ReactNode } from 'react';

// Mock the backendApi module
vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return {
    ...actual,
    backendApi: {
      getLeaguePositions: vi.fn(),
    },
  };
});

const mockGetLeaguePositions = vi.mocked(backendApi.getLeaguePositions);

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

describe('useLeaguePositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('successful data fetching', () => {
    it('returns positions and managers for chart rendering', async () => {
      const mockResponse = {
        league_id: 123,
        season_id: 1,
        positions: [
          { gameweek: 1, '1001': 1, '1002': 2 },
          { gameweek: 2, '1001': 2, '1002': 1 },
          { gameweek: 3, '1001': 1, '1002': 2 },
        ],
        managers: [
          { id: 1001, name: 'Manager A', color: '#3b82f6' },
          { id: 1002, name: 'Manager B', color: '#ef4444' },
        ],
      };

      mockGetLeaguePositions.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.positions).toHaveLength(3);
      expect(result.current.positions[0].gameweek).toBe(1);
      expect(result.current.positions[0]['1001']).toBe(1);

      expect(result.current.managers).toHaveLength(2);
      expect(result.current.managers[0].name).toBe('Manager A');
      expect(result.current.managers[0].color).toBe('#3b82f6');

      expect(result.current.error).toBeNull();
    });

    it('passes correct parameters to API', async () => {
      mockGetLeaguePositions.mockResolvedValue({
        league_id: 456,
        season_id: 2,
        positions: [],
        managers: [],
      });

      renderHook(() => useLeaguePositions(456, { seasonId: 2 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(mockGetLeaguePositions).toHaveBeenCalled());

      expect(mockGetLeaguePositions).toHaveBeenCalledWith(456, 2);
    });

    it('handles empty positions gracefully', async () => {
      mockGetLeaguePositions.mockResolvedValue({
        league_id: 123,
        season_id: 1,
        positions: [],
        managers: [],
      });

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.positions).toEqual([]);
      expect(result.current.managers).toEqual([]);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('returns isLoading true while fetching', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetLeaguePositions.mockReturnValue(promise as never);

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.positions).toEqual([]);
      expect(result.current.managers).toEqual([]);

      // Resolve to clean up
      resolvePromise!({
        league_id: 123,
        season_id: 1,
        positions: [],
        managers: [],
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  describe('error handling', () => {
    it('returns error message on API failure', async () => {
      mockGetLeaguePositions.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      // Longer timeout needed because hook has its own retry config (2 retries with exponential backoff)
      await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isBackendUnavailable).toBe(false);
    });

    it('detects backend unavailable (503)', async () => {
      mockGetLeaguePositions.mockRejectedValue(
        new BackendApiError(503, 'Service Unavailable', 'Database not available')
      );

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
      expect(result.current.error).toBe('Database not available');
    });

    it('detects network error as backend unavailable', async () => {
      mockGetLeaguePositions.mockRejectedValue(
        new BackendApiError(0, 'Network Error', 'Failed to fetch')
      );

      const { result } = renderHook(() => useLeaguePositions(123), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
    });
  });

  describe('query enablement', () => {
    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useLeaguePositions(123, { enabled: false }), {
        wrapper: createWrapper(),
      });

      // Wait a bit to ensure no fetch happens
      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeaguePositions).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('does not fetch when leagueId is 0', async () => {
      const { result } = renderHook(() => useLeaguePositions(0), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeaguePositions).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });
  });
});
