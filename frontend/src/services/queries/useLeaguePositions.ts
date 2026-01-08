import { useQuery } from '@tanstack/react-query';

import { CURRENT_SEASON_ID } from 'src/config';

import {
  BackendApiError,
  backendApi,
  type GameweekPosition,
  type ManagerMetadata,
} from 'services/backendApi';
import { backendQueryDefaults } from 'services/queries/backendQueryConfig';
import { queryKeys } from 'services/queryKeys';

interface UseLeaguePositionsReturn {
  /** Position data per gameweek (pivoted format for charts) */
  positions: GameweekPosition[];
  /** Manager metadata with colors for chart rendering */
  managers: ManagerMetadata[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

interface UseLeaguePositionsOptions {
  /** Season ID (default: current season) */
  seasonId?: number;
  /** Whether the query should run */
  enabled?: boolean;
}

/**
 * Hook to fetch league position history for bump chart visualization.
 *
 * Returns positions for each manager at each gameweek, pre-formatted
 * for Recharts consumption. This replaces N individual FPL API calls
 * with one backend request.
 *
 * Data is fetched from the Python backend (Fly.io) which pre-computes
 * positions from stored historical data and assigns consistent colors.
 *
 * @param leagueId - FPL league ID
 * @param options - Query options
 */
export function useLeaguePositions(
  leagueId: number,
  { seasonId = CURRENT_SEASON_ID, enabled = true }: UseLeaguePositionsOptions = {}
): UseLeaguePositionsReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    queryKey: queryKeys.leaguePositions(leagueId, seasonId),
    queryFn: () => backendApi.getLeaguePositions(leagueId, seasonId),
    enabled: enabled && leagueId > 0,
  });

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  return {
    positions: query.data?.positions ?? [],
    managers: query.data?.managers ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
