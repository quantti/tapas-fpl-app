import { useQuery } from '@tanstack/react-query';

import { CACHE_TIMES, CURRENT_SEASON_ID } from 'src/config';

import {
  BackendApiError,
  backendApi,
  type GameweekPosition,
  type ManagerMetadata,
} from 'services/backendApi';
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
    queryKey: queryKeys.leaguePositions(leagueId, seasonId),
    queryFn: () => backendApi.getLeaguePositions(leagueId, seasonId),
    staleTime: CACHE_TIMES.FIVE_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
    enabled: enabled && leagueId > 0,
    retry: (failureCount, error) => {
      // Don't retry on service unavailable (503 or network error) - it won't help
      if (error instanceof BackendApiError && error.isServiceUnavailable) {
        return false;
      }
      return failureCount < 2;
    },
    // Exponential backoff for Fly.io cold starts (2-3s typical)
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
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
