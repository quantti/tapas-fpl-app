import { useQuery } from '@tanstack/react-query';

import { CACHE_TIMES, CURRENT_SEASON_ID } from 'src/config';

import { BackendApiError, backendApi, type TeamPointsAgainst } from 'services/backendApi';
import { queryKeys } from 'services/queryKeys';

interface UsePointsAgainstReturn {
  /** Points against data for all teams, sorted by total (highest first) */
  teams: TeamPointsAgainst[];
  /** Season ID the data is for */
  seasonId: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

/**
 * Hook to fetch Points Against data for all teams.
 *
 * Points Against tracks how many total FPL fantasy points have been
 * scored against each Premier League team. Teams that concede more
 * FPL points are easier captain targets.
 *
 * Data is fetched from the Python backend (Fly.io) which aggregates
 * player points from FPL API into per-team totals.
 *
 * @param seasonId - Season to fetch data for (default: CURRENT_SEASON_ID)
 * @param enabled - Whether the query should run
 */
export function usePointsAgainst(
  seasonId = CURRENT_SEASON_ID,
  enabled = true
): UsePointsAgainstReturn {
  const query = useQuery({
    queryKey: queryKeys.pointsAgainst(seasonId),
    queryFn: () => backendApi.getPointsAgainst(seasonId),
    staleTime: CACHE_TIMES.TEN_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
    enabled,
    retry: (failureCount, error) => {
      // Don't retry on service unavailable (503 or network error) - it won't help
      if (error instanceof BackendApiError && error.isServiceUnavailable) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  return {
    teams: query.data?.teams ?? [],
    seasonId: query.data?.season_id ?? seasonId,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
