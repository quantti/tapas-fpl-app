import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CURRENT_SEASON_ID } from 'src/config';

import { BackendApiError, backendApi, type SetAndForgetManager } from 'services/backendApi';
import { backendQueryDefaults } from 'services/queries/backendQueryConfig';
import { queryKeys } from 'services/queryKeys';

import { type CamelCaseKeys, transformKeys } from 'utils/caseTransform';

/** Set and Forget manager stat with camelCase keys */
export type SetAndForgetManagerCamel = CamelCaseKeys<SetAndForgetManager>;

interface UseSetAndForgetReturn {
  /** Set and Forget stats for all managers (sorted by difference descending) */
  managers: SetAndForgetManagerCamel[];
  /** Current gameweek from response */
  currentGameweek: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

interface UseSetAndForgetOptions {
  /** Season ID (default: current season) */
  seasonId?: number;
  /** Whether the query should run */
  enabled?: boolean;
}

/**
 * Hook to fetch Set and Forget points comparison for all managers in a league.
 *
 * Set and Forget calculates hypothetical points if each manager kept their GW1
 * squad all season without making any transfers.
 *
 * Data is fetched from the Python backend (Fly.io) which calculates these
 * statistics from stored historical data.
 *
 * @param leagueId - FPL league ID
 * @param currentGameweek - Current gameweek (1-38)
 * @param options - Query options
 */
export function useSetAndForget(
  leagueId: number,
  currentGameweek: number,
  { seasonId = CURRENT_SEASON_ID, enabled = true }: UseSetAndForgetOptions = {}
): UseSetAndForgetReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    queryKey: queryKeys.leagueSetAndForget(leagueId, currentGameweek, seasonId),
    queryFn: () => backendApi.getLeagueSetAndForget(leagueId, currentGameweek, seasonId),
    enabled: enabled && leagueId > 0 && currentGameweek > 0,
  });

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  const managers = useMemo(() => transformKeys(query.data?.managers ?? []), [query.data?.managers]);

  return {
    managers,
    currentGameweek: query.data?.current_gameweek ?? currentGameweek,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
