import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CURRENT_SEASON_ID } from 'src/config';

import {
  BackendApiError,
  backendApi,
  type DashboardManager,
  type DashboardPick,
  type DashboardTransfer,
} from 'services/backendApi';
import { backendQueryDefaults } from 'services/queries/backendQueryConfig';
import { queryKeys } from 'services/queryKeys';

import { type CamelCaseKeys, transformKeys } from 'utils/caseTransform';

/** Dashboard pick with camelCase keys */
export type DashboardPickCamel = CamelCaseKeys<DashboardPick>;
/** Dashboard transfer with camelCase keys */
export type DashboardTransferCamel = CamelCaseKeys<DashboardTransfer>;
/** Dashboard manager with camelCase keys */
export type DashboardManagerCamel = CamelCaseKeys<DashboardManager>;

interface UseLeagueDashboardReturn {
  /** All managers with their picks, chips, transfers */
  managers: DashboardManagerCamel[];
  /** Current gameweek from response */
  gameweek: number;
  /** League ID from response */
  leagueId: number;
  /** Map of player ID to player data (built from picks) */
  playersMap: Map<number, DashboardPickCamel>;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
  /** Refetch function */
  refetch: () => void;
}

interface UseLeagueDashboardOptions {
  /** Season ID (default: current season) */
  seasonId?: number;
  /** Whether the query should run */
  enabled?: boolean;
  /** Whether to use shorter stale time for live updates */
  isLive?: boolean;
}

/**
 * Hook to fetch consolidated dashboard data for a league.
 *
 * Returns all manager data (picks, chips, transfers, standings) in a single call.
 * This replaces ~64 individual FPL API calls with one backend request.
 *
 * Data is fetched from the Python backend (Fly.io) which queries
 * pre-stored data from PostgreSQL using parallel queries.
 *
 * @param leagueId - FPL league ID
 * @param gameweek - Gameweek number (1-38)
 * @param options - Query options
 */
export function useLeagueDashboard(
  leagueId: number,
  gameweek: number,
  { seasonId = CURRENT_SEASON_ID, enabled = true, isLive = false }: UseLeagueDashboardOptions = {}
): UseLeagueDashboardReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    // Override stale time for live updates
    staleTime: isLive ? 30_000 : backendQueryDefaults.staleTime,
    refetchInterval: isLive ? 60_000 : false,
    queryKey: queryKeys.leagueDashboard(leagueId, gameweek, seasonId),
    queryFn: () => backendApi.getLeagueDashboard(leagueId, gameweek, seasonId),
    enabled: enabled && leagueId > 0 && gameweek > 0,
  });

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  // Transform managers to camelCase
  const managers = useMemo(() => transformKeys(query.data?.managers ?? []), [query.data?.managers]);

  // Build players map from picks for components that need quick player lookup
  const playersMap = useMemo(() => {
    const map = new Map<number, DashboardPickCamel>();
    for (const manager of managers) {
      for (const pick of manager.picks) {
        if (!map.has(pick.playerId)) {
          map.set(pick.playerId, pick);
        }
      }
    }
    return map;
  }, [managers]);

  return {
    managers,
    gameweek: query.data?.gameweek ?? gameweek,
    leagueId: query.data?.league_id ?? leagueId,
    playersMap,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
    refetch: query.refetch,
  };
}
