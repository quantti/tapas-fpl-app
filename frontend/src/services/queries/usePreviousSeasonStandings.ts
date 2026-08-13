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

interface UseReturn {
  standings: PreviousSeasonEntry[];
  isLoading: boolean;
  error: string | null;
}

export function usePreviousSeasonStandings(
  leagueId: number,
  {
    seasonId = CURRENT_SEASON_ID - 1,
    enabled = true,
  }: { seasonId?: number; enabled?: boolean } = {}
): UseReturn {
  const query = useQuery({
    ...backendQueryDefaults,
    staleTime: Number.POSITIVE_INFINITY,
    queryKey: queryKeys.leagueHistory(leagueId, seasonId),
    queryFn: () => backendApi.getLeagueHistory(leagueId, seasonId),
    enabled: enabled && leagueId > 0 && seasonId > 0,
  });

  const standings = useMemo(() => {
    const managers = query.data?.managers ?? [];
    return managers
      .map((m) => {
        if (m.history.length === 0) return null;
        const last = m.history.reduce((a, b) => (b.gameweek > a.gameweek ? b : a));
        return {
          managerId: m.manager_id,
          managerName: m.name,
          teamName: m.team_name,
          totalPoints: last.total_points,
        };
      })
      .filter((e): e is PreviousSeasonEntry => e !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [query.data]);

  return {
    standings,
    isLoading: query.isLoading,
    error:
      query.error instanceof BackendApiError && query.error.isServiceUnavailable
        ? null
        : (query.error?.message ?? null),
  };
}
