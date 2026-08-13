import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CURRENT_SEASON_ID } from 'src/config';

import { BackendApiError, backendApi } from 'services/backendApi';
import { backendQueryDefaults } from 'services/queries/backendQueryConfig';
import { queryKeys } from 'services/queryKeys';

export interface PreviousSeasonEntry {
  managerId: number;
  managerName: string;
  teamName: string;
  totalPoints: number;
}

interface UsePreviousSeasonStandingsReturn {
  /** Final standings sorted by total points (descending) */
  standings: PreviousSeasonEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the backend database is unavailable (503) */
  isBackendUnavailable: boolean;
}

interface UsePreviousSeasonStandingsOptions {
  /** Season ID (default: previous season) */
  seasonId?: number;
  /** Whether the query should run */
  enabled?: boolean;
}

/**
 * Hook to fetch the previous season's final league standings.
 *
 * Uses the backend history endpoint (stored snapshots), so it also works
 * during the off-season when the FPL API has rolled over to the new season.
 * Historical data never changes, so the result is cached indefinitely.
 *
 * @param leagueId - FPL league ID
 * @param options - Query options
 */
export function usePreviousSeasonStandings(
  leagueId: number,
  { seasonId = CURRENT_SEASON_ID - 1, enabled = true }: UsePreviousSeasonStandingsOptions = {}
): UsePreviousSeasonStandingsReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    staleTime: Number.POSITIVE_INFINITY,
    queryKey: queryKeys.leagueHistory(leagueId, seasonId),
    queryFn: () => backendApi.getLeagueHistory(leagueId, seasonId),
    enabled: enabled && leagueId > 0 && seasonId > 0,
  });

  const standings = useMemo<PreviousSeasonEntry[]>(() => {
    const managers = query.data?.managers ?? [];
    return managers
      .map((m): PreviousSeasonEntry | null => {
        if (m.history.length === 0) return null;
        const lastGw = m.history.reduce((a, b) => (b.gameweek > a.gameweek ? b : a));
        return {
          managerId: m.manager_id,
          managerName: m.name,
          teamName: m.team_name,
          totalPoints: lastGw.total_points,
        };
      })
      .filter((e): e is PreviousSeasonEntry => e !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [query.data]);

  const isBackendUnavailable =
    query.error instanceof BackendApiError && query.error.isServiceUnavailable;

  return {
    standings,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    isBackendUnavailable,
  };
}
