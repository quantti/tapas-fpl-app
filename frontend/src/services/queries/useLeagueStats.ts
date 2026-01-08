import { useQuery } from '@tanstack/react-query';

import { CURRENT_SEASON_ID } from 'src/config';

import {
  BackendApiError,
  backendApi,
  type BenchPointsStat,
  type CaptainDifferentialStat,
  type FreeTransferStat,
} from 'services/backendApi';
import { backendQueryDefaults } from 'services/queries/backendQueryConfig';
import { queryKeys } from 'services/queryKeys';

import { type CamelCaseKeys, transformKeys } from 'utils/caseTransform';

/** Bench points stat with camelCase keys */
export type BenchPointsStatCamel = CamelCaseKeys<BenchPointsStat>;
/** Free transfers stat with camelCase keys */
export type FreeTransferStatCamel = CamelCaseKeys<FreeTransferStat>;
/** Captain differential stat with camelCase keys */
export type CaptainDifferentialStatCamel = CamelCaseKeys<CaptainDifferentialStat>;

interface UseLeagueStatsReturn {
  /** Bench points for all managers (camelCase keys) */
  benchPoints: BenchPointsStatCamel[];
  /** Free transfers remaining for all managers (camelCase keys) */
  freeTransfers: FreeTransferStatCamel[];
  /** Captain differential stats for all managers (camelCase keys) */
  captainDifferential: CaptainDifferentialStatCamel[];
  /** Current gameweek from response */
  currentGameweek: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

interface UseLeagueStatsOptions {
  /** Season ID (default: current season) */
  seasonId?: number;
  /** Whether the query should run */
  enabled?: boolean;
}

/**
 * Hook to fetch aggregated statistics for all managers in a league.
 *
 * Returns bench points, free transfers, and captain differentials in a single call.
 * This replaces ~100+ individual FPL API calls with one backend request.
 *
 * Data is fetched from the Python backend (Fly.io) which pre-computes
 * these statistics from stored historical data.
 *
 * @param leagueId - FPL league ID
 * @param currentGameweek - Current gameweek (1-38)
 * @param options - Query options
 */
export function useLeagueStats(
  leagueId: number,
  currentGameweek: number,
  { seasonId = CURRENT_SEASON_ID, enabled = true }: UseLeagueStatsOptions = {}
): UseLeagueStatsReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    queryKey: queryKeys.leagueStats(leagueId, currentGameweek, seasonId),
    queryFn: () => backendApi.getLeagueStats(leagueId, currentGameweek, seasonId),
    enabled: enabled && leagueId > 0 && currentGameweek > 0,
  });

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  return {
    benchPoints: transformKeys(query.data?.bench_points ?? []),
    freeTransfers: transformKeys(query.data?.free_transfers ?? []),
    captainDifferential: transformKeys(query.data?.captain_differential ?? []),
    currentGameweek: query.data?.current_gameweek ?? currentGameweek,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
