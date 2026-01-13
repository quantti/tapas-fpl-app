import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BackendApiError, backendApi } from 'services/backendApi';

import { useLeagueDashboard } from './useLeagueDashboard';

import type { ReactNode } from 'react';

// Mock the backendApi module
vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return {
    ...actual,
    backendApi: {
      getLeagueDashboard: vi.fn(),
    },
  };
});

const mockGetLeagueDashboard = vi.mocked(backendApi.getLeagueDashboard);

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

// Sample mock data matching backend response format
const createMockResponse = (overrides = {}) => ({
  league_id: 242017,
  gameweek: 21,
  season_id: 1,
  managers: [
    {
      entry_id: 123,
      manager_name: 'John Doe',
      team_name: 'FC Test',
      total_points: 1250,
      gw_points: 65,
      rank: 1,
      last_rank: 2,
      overall_rank: 50000,
      last_overall_rank: null,
      bank: 0.5,
      team_value: 102.3,
      transfers_made: 1,
      transfer_cost: 0,
      chip_active: null,
      picks: [
        {
          position: 1,
          player_id: 427,
          player_name: 'Salah',
          team_id: 11,
          team_short_name: 'LIV',
          element_type: 3,
          is_captain: true,
          is_vice_captain: false,
          multiplier: 2,
          now_cost: 130,
          form: 8.5,
          points_per_game: 7.2,
          selected_by_percent: 45.3,
        },
        {
          position: 2,
          player_id: 351,
          player_name: 'Haaland',
          team_id: 13,
          team_short_name: 'MCI',
          element_type: 4,
          is_captain: false,
          is_vice_captain: true,
          multiplier: 1,
          now_cost: 145,
          form: 9.0,
          points_per_game: 8.1,
          selected_by_percent: 85.2,
        },
      ],
      chips_used: ['wildcard_1', 'bboost_2'],
      transfers: [
        {
          player_in_id: 427,
          player_in_name: 'Salah',
          player_out_id: 100,
          player_out_name: 'Some Player',
        },
      ],
    },
    {
      entry_id: 456,
      manager_name: 'Jane Smith',
      team_name: 'Another Team',
      total_points: 1200,
      gw_points: 55,
      rank: 2,
      last_rank: 1,
      overall_rank: 60000,
      last_overall_rank: null,
      bank: 1.0,
      team_value: 101.5,
      transfers_made: 0,
      transfer_cost: 0,
      chip_active: '3xc',
      picks: [],
      chips_used: [],
      transfers: [],
    },
  ],
  ...overrides,
});

describe('useLeagueDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('successful data fetching', () => {
    it('returns managers with transformed camelCase keys', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.managers).toHaveLength(2);
      expect(result.current.gameweek).toBe(21);
      expect(result.current.leagueId).toBe(242017);
      expect(result.current.error).toBeNull();
    });

    it('transforms manager fields to camelCase', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const manager = result.current.managers[0];
      expect(manager.entryId).toBe(123);
      expect(manager.managerName).toBe('John Doe');
      expect(manager.teamName).toBe('FC Test');
      expect(manager.totalPoints).toBe(1250);
      expect(manager.gwPoints).toBe(65);
      expect(manager.lastRank).toBe(2);
      expect(manager.overallRank).toBe(50000);
      expect(manager.teamValue).toBe(102.3);
      expect(manager.transfersMade).toBe(1);
      expect(manager.transferCost).toBe(0);
      expect(manager.chipActive).toBeNull();
    });

    it('transforms pick fields to camelCase', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const pick = result.current.managers[0].picks[0];
      expect(pick.playerId).toBe(427);
      expect(pick.playerName).toBe('Salah');
      expect(pick.teamId).toBe(11);
      expect(pick.teamShortName).toBe('LIV');
      expect(pick.elementType).toBe(3);
      expect(pick.isCaptain).toBe(true);
      expect(pick.isViceCaptain).toBe(false);
      expect(pick.nowCost).toBe(130);
      expect(pick.pointsPerGame).toBe(7.2);
      expect(pick.selectedByPercent).toBe(45.3);
    });

    it('transforms transfer fields to camelCase', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const transfer = result.current.managers[0].transfers[0];
      expect(transfer.playerInId).toBe(427);
      expect(transfer.playerInName).toBe('Salah');
      expect(transfer.playerOutId).toBe(100);
      expect(transfer.playerOutName).toBe('Some Player');
    });

    it('builds playersMap from all manager picks', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.playersMap.size).toBe(2);
      expect(result.current.playersMap.has(427)).toBe(true);
      expect(result.current.playersMap.has(351)).toBe(true);

      const salah = result.current.playersMap.get(427);
      expect(salah?.playerName).toBe('Salah');
      expect(salah?.teamShortName).toBe('LIV');
    });

    it('passes correct parameters to API', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      renderHook(() => useLeagueDashboard(242017, 21, { seasonId: 2 }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(mockGetLeagueDashboard).toHaveBeenCalled());

      expect(mockGetLeagueDashboard).toHaveBeenCalledWith(242017, 21, 2);
    });
  });

  describe('empty league', () => {
    it('returns empty managers array for league with no data', async () => {
      mockGetLeagueDashboard.mockResolvedValue({
        league_id: 999,
        gameweek: 21,
        season_id: 1,
        managers: [],
      });

      const { result } = renderHook(() => useLeagueDashboard(999, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.managers).toEqual([]);
      expect(result.current.playersMap.size).toBe(0);
      expect(result.current.error).toBeNull();
    });
  });

  describe('loading state', () => {
    it('returns isLoading true while fetching', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockGetLeagueDashboard.mockReturnValue(promise as never);

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.managers).toEqual([]);

      // Resolve to clean up
      resolvePromise!(createMockResponse());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  describe('error handling', () => {
    it('returns error message on API failure', async () => {
      mockGetLeagueDashboard.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false), {
        timeout: 5000,
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isBackendUnavailable).toBe(false);
    });

    it('detects backend unavailable (503)', async () => {
      mockGetLeagueDashboard.mockRejectedValue(
        new BackendApiError(503, 'Service Unavailable', 'Database not available')
      );

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
      expect(result.current.error).toBe('Database not available');
    });

    it('detects network error as backend unavailable', async () => {
      mockGetLeagueDashboard.mockRejectedValue(
        new BackendApiError(0, 'Network Error', 'Failed to fetch')
      );

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isBackendUnavailable).toBe(true);
    });
  });

  describe('query enablement', () => {
    it('does not fetch when disabled', async () => {
      const { result } = renderHook(() => useLeagueDashboard(242017, 21, { enabled: false }), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueDashboard).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('does not fetch when leagueId is 0', async () => {
      const { result } = renderHook(() => useLeagueDashboard(0, 21), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueDashboard).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });

    it('does not fetch when gameweek is 0', async () => {
      const { result } = renderHook(() => useLeagueDashboard(242017, 0), {
        wrapper: createWrapper(),
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetLeagueDashboard).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('isLive option', () => {
    it('accepts isLive option and fetches successfully', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21, { isLive: true }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.managers).toHaveLength(2);
      expect(mockGetLeagueDashboard).toHaveBeenCalled();
    });
  });

  describe('refetch functionality', () => {
    it('refetch triggers new API call', async () => {
      mockGetLeagueDashboard.mockResolvedValue(createMockResponse());

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(mockGetLeagueDashboard).toHaveBeenCalledTimes(1);

      result.current.refetch();

      await waitFor(() => expect(mockGetLeagueDashboard).toHaveBeenCalledTimes(2));
    });
  });

  describe('playersMap behavior', () => {
    it('keeps first occurrence when player owned by multiple managers', async () => {
      const response = createMockResponse();
      // Add same player (427) to second manager's picks with different captain status
      response.managers[1].picks = [
        {
          position: 1,
          player_id: 427,
          player_name: 'Salah',
          team_id: 11,
          team_short_name: 'LIV',
          element_type: 3,
          is_captain: false, // different from first manager
          is_vice_captain: true,
          multiplier: 1,
          now_cost: 130,
          form: 8.5,
          points_per_game: 7.2,
          selected_by_percent: 45.3,
        },
      ];
      mockGetLeagueDashboard.mockResolvedValue(response);

      const { result } = renderHook(() => useLeagueDashboard(242017, 21), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Should have player 427 only once with first manager's captain status
      const salah = result.current.playersMap.get(427);
      expect(salah?.isCaptain).toBe(true); // first manager's version
      expect(salah?.isViceCaptain).toBe(false); // first manager's version
    });
  });
});
