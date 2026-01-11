import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { backendApi } from 'services/backendApi';

import { getPlaystyleLabel, useHeadToHeadComparison } from './useHeadToHeadComparison';

import type { ReactNode } from 'react';

// Mock the backendApi module
vi.mock('services/backendApi', async () => {
  const actual = await vi.importActual('services/backendApi');
  return {
    ...actual,
    backendApi: {
      getManagerComparison: vi.fn(),
    },
  };
});

const mockGetManagerComparison = vi.mocked(backendApi.getManagerComparison);

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

describe('getPlaystyleLabel', () => {
  describe('Template playstyle (9-11 matches)', () => {
    it('returns Template for 11 matches (perfect template)', () => {
      expect(getPlaystyleLabel(11)).toBe('Template');
    });

    it('returns Template for 10 matches', () => {
      expect(getPlaystyleLabel(10)).toBe('Template');
    });

    it('returns Template for 9 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(9)).toBe('Template');
    });
  });

  describe('Balanced playstyle (6-8 matches)', () => {
    it('returns Balanced for 8 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(8)).toBe('Balanced');
    });

    it('returns Balanced for 7 matches', () => {
      expect(getPlaystyleLabel(7)).toBe('Balanced');
    });

    it('returns Balanced for 6 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(6)).toBe('Balanced');
    });
  });

  describe('Differential playstyle (3-5 matches)', () => {
    it('returns Differential for 5 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(5)).toBe('Differential');
    });

    it('returns Differential for 4 matches', () => {
      expect(getPlaystyleLabel(4)).toBe('Differential');
    });

    it('returns Differential for 3 matches (lower threshold)', () => {
      expect(getPlaystyleLabel(3)).toBe('Differential');
    });
  });

  describe('Maverick playstyle (0-2 matches)', () => {
    it('returns Maverick for 2 matches (upper threshold)', () => {
      expect(getPlaystyleLabel(2)).toBe('Maverick');
    });

    it('returns Maverick for 1 match', () => {
      expect(getPlaystyleLabel(1)).toBe('Maverick');
    });

    it('returns Maverick for 0 matches (completely differential)', () => {
      expect(getPlaystyleLabel(0)).toBe('Maverick');
    });
  });

  describe('edge cases', () => {
    it('handles negative numbers as Maverick', () => {
      expect(getPlaystyleLabel(-1)).toBe('Maverick');
    });

    it('handles numbers above 11 as Template', () => {
      expect(getPlaystyleLabel(15)).toBe('Template');
    });
  });
});

describe('useHeadToHeadComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Factory for creating mock backend manager stats
  function createMockManagerStats(overrides = {}) {
    return {
      manager_id: 1,
      name: 'Manager One',
      team_name: 'Team One FC',
      total_points: 500,
      overall_rank: 100000,
      league_rank: 1,
      total_transfers: 10,
      total_hits: 2,
      hits_cost: -8,
      remaining_transfers: 2,
      captain_points: 200,
      differential_captains: 3,
      chips_used: ['wildcard'],
      chips_remaining: ['freehit', 'bboost'],
      best_gameweek: { gw: 5, points: 80 },
      worst_gameweek: { gw: 3, points: 30 },
      starting_xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      league_template_overlap: {
        match_count: 7,
        match_percentage: 63.6,
        matching_player_ids: [1, 2, 3, 4, 5, 6, 7],
        differential_player_ids: [8, 9, 10, 11],
        playstyle_label: 'Balanced',
      },
      world_template_overlap: null,
      // Tier 1
      consistency_score: 12.5,
      bench_waste_rate: 5.2,
      hit_frequency: 20.0,
      last_5_average: 55.4,
      // Tier 2
      form_momentum: 'improving',
      recovery_rate: 62.3,
      // Tier 3
      luck_index: 15.3,
      captain_xp_delta: 8.5,
      squad_xp: 42.7,
      ...overrides,
    };
  }

  function createMockResponse(managerAOverrides = {}, managerBOverrides = {}) {
    return {
      season_id: 1,
      manager_a: createMockManagerStats({
        manager_id: 1,
        ...managerAOverrides,
      }),
      manager_b: createMockManagerStats({
        manager_id: 2,
        name: 'Manager Two',
        ...managerBOverrides,
      }),
      common_players: [1, 2, 3],
      head_to_head: { wins_a: 5, wins_b: 3, draws: 2 },
    };
  }

  describe('Tier 3 analytics transformation', () => {
    it('transforms Tier 3 xG-based metrics from snake_case to camelCase', async () => {
      mockGetManagerComparison.mockResolvedValue(
        createMockResponse(
          { luck_index: 25.5, captain_xp_delta: 12.3, squad_xp: 50.0 },
          { luck_index: -10.2, captain_xp_delta: -5.0, squad_xp: 35.8 }
        )
      );

      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: 1,
            managerBId: 2,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Manager A - positive values
      expect(result.current.managerA?.luckIndex).toBe(25.5);
      expect(result.current.managerA?.captainXpDelta).toBe(12.3);
      expect(result.current.managerA?.squadXp).toBe(50.0);

      // Manager B - negative luck, negative captain delta
      expect(result.current.managerB?.luckIndex).toBe(-10.2);
      expect(result.current.managerB?.captainXpDelta).toBe(-5.0);
      expect(result.current.managerB?.squadXp).toBe(35.8);
    });

    it('handles null Tier 3 values when xG data unavailable', async () => {
      mockGetManagerComparison.mockResolvedValue(
        createMockResponse(
          { luck_index: null, captain_xp_delta: null, squad_xp: null },
          { luck_index: null, captain_xp_delta: null, squad_xp: null }
        )
      );

      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: 1,
            managerBId: 2,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.managerA?.luckIndex).toBeNull();
      expect(result.current.managerA?.captainXpDelta).toBeNull();
      expect(result.current.managerA?.squadXp).toBeNull();
    });

    it('handles undefined Tier 3 fields (backwards compatibility)', async () => {
      // Simulate old backend that doesn't return Tier 3 fields at all
      const responseWithMissingFields = createMockResponse();
      // Delete the Tier 3 fields to simulate them being undefined
      // @ts-expect-error - testing undefined fields for backwards compatibility
      delete responseWithMissingFields.manager_a.luck_index;
      // @ts-expect-error - testing undefined fields for backwards compatibility
      delete responseWithMissingFields.manager_a.captain_xp_delta;
      // @ts-expect-error - testing undefined fields for backwards compatibility
      delete responseWithMissingFields.manager_a.squad_xp;

      mockGetManagerComparison.mockResolvedValue(responseWithMissingFields);

      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: 1,
            managerBId: 2,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // undefined fields should be coerced to null
      expect(result.current.managerA?.luckIndex).toBeNull();
      expect(result.current.managerA?.captainXpDelta).toBeNull();
      expect(result.current.managerA?.squadXp).toBeNull();
    });

    it('handles mixed null and non-null Tier 3 values', async () => {
      // Manager A has xG data, Manager B does not
      mockGetManagerComparison.mockResolvedValue(
        createMockResponse(
          { luck_index: 10.0, captain_xp_delta: 5.0, squad_xp: 40.0 },
          { luck_index: null, captain_xp_delta: null, squad_xp: null }
        )
      );

      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: 1,
            managerBId: 2,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.managerA?.luckIndex).toBe(10.0);
      expect(result.current.managerB?.luckIndex).toBeNull();
    });
  });

  describe('query enablement', () => {
    it('does not fetch when managers are the same', async () => {
      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: 1,
            managerBId: 1,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetManagerComparison).not.toHaveBeenCalled();
      expect(result.current.managerA).toBeNull();
    });

    it('does not fetch when managerAId is null', async () => {
      const { result } = renderHook(
        () =>
          useHeadToHeadComparison({
            managerAId: null,
            managerBId: 2,
            leagueId: 123,
          }),
        { wrapper: createWrapper() }
      );

      await new Promise((r) => setTimeout(r, 50));

      expect(mockGetManagerComparison).not.toHaveBeenCalled();
      expect(result.current.managerA).toBeNull();
    });
  });
});
