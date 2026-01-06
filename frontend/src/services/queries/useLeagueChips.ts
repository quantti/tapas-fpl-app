import { useQuery } from '@tanstack/react-query';

import { CACHE_TIMES, CURRENT_SEASON_ID } from 'src/config';

import { BackendApiError, backendApi, type ManagerChipsData } from 'services/backendApi';
import { queryKeys } from 'services/queryKeys';

interface UseLeagueChipsReturn {
  /** Chip usage data for all managers in the league */
  managers: ManagerChipsData[];
  /** Current gameweek */
  currentGameweek: number;
  /** Which half of the season (1 = GW1-19, 2 = GW20-38) */
  currentHalf: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

interface UseLeagueChipsOptions {
  /** Season ID (default: current season) */
  seasonId?: number;
  /** Whether to sync fresh data from FPL API (default: false) */
  sync?: boolean;
  /** Whether the query should run */
  enabled?: boolean;
}

/**
 * Hook to fetch chip usage data for all managers in a league.
 *
 * This replaces the per-manager FPL API calls with a single backend call
 * that returns pre-calculated chip data for all league members.
 *
 * Data is fetched from the Python backend (Fly.io) which:
 * - Caches league membership data
 * - Syncs chip usage from FPL API when sync=true
 * - Pre-calculates chips_remaining for each half
 *
 * @param leagueId - FPL league ID
 * @param currentGameweek - Current gameweek (1-38)
 * @param options - Query options
 */
export function useLeagueChips(
  leagueId: number,
  currentGameweek: number,
  { seasonId = CURRENT_SEASON_ID, sync = false, enabled = true }: UseLeagueChipsOptions = {}
): UseLeagueChipsReturn {
  const query = useQuery({
    queryKey: queryKeys.leagueChips(leagueId, currentGameweek, seasonId),
    queryFn: () => backendApi.getLeagueChips(leagueId, currentGameweek, { seasonId, sync }),
    staleTime: CACHE_TIMES.TEN_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
    enabled: enabled && leagueId > 0 && currentGameweek > 0,
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
    managers: query.data?.managers ?? [],
    currentGameweek: query.data?.current_gameweek ?? currentGameweek,
    currentHalf: query.data?.current_half ?? (currentGameweek >= 20 ? 2 : 1),
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
