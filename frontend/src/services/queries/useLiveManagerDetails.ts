import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { LIVE_REFRESH_INTERVAL } from 'src/config';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import type { ManagerGameweekData, ManagerPick } from './useFplData';
import type { LeagueStandings, Player } from 'types/fpl';

interface UseLiveManagerDetailsOptions {
  /** Whether to enable fetching (should be true only when live) */
  enabled?: boolean;
}

interface UseLiveManagerDetailsReturn {
  /** Manager details with picks, captains, chips */
  managers: ManagerGameweekData[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any fetch failed */
  error: string | null;
  /** Refetch all manager data */
  refetch: () => void;
}

/**
 * Fetches live manager details directly from FPL API.
 *
 * Used during live gameweeks to get real-time picks, captains, and chips.
 * Makes parallel API calls for each manager in the league.
 *
 * @param standings - League standings (provides manager IDs and names)
 * @param gameweek - Current gameweek number
 * @param playersMap - Map of player IDs to Player objects (for captain lookup)
 * @param options - Query options
 */
export function useLiveManagerDetails(
  standings: LeagueStandings | null,
  gameweek: number,
  playersMap: Map<number, Player>,
  { enabled = true }: UseLiveManagerDetailsOptions = {}
): UseLiveManagerDetailsReturn {
  const managerIds = useMemo(
    () => standings?.standings.results.map((r) => r.entry) ?? [],
    [standings]
  );

  // Fetch picks for all managers in parallel
  const picksQueries = useQueries({
    queries: managerIds.map((managerId) => ({
      queryKey: queryKeys.entryPicks(managerId, gameweek),
      queryFn: () => fplApi.getEntryPicks(managerId, gameweek),
      enabled: enabled && gameweek > 0 && playersMap.size > 0,
      staleTime: 30_000,
      refetchInterval: LIVE_REFRESH_INTERVAL,
    })),
  });

  // Fetch history for all managers (for chips used)
  const historyQueries = useQueries({
    queries: managerIds.map((managerId) => ({
      queryKey: queryKeys.entryHistory(managerId),
      queryFn: () => fplApi.getEntryHistory(managerId),
      enabled: enabled && gameweek > 0,
      staleTime: 60_000, // History changes less frequently
    })),
  });

  // Fetch transfers for all managers
  const transfersQueries = useQueries({
    queries: managerIds.map((managerId) => ({
      queryKey: queryKeys.entryTransfers(managerId),
      queryFn: () => fplApi.getEntryTransfers(managerId),
      enabled: enabled && gameweek > 0,
      staleTime: 60_000,
    })),
  });

  // Transform API responses to ManagerGameweekData format
  const managers = useMemo(() => {
    if (!standings || playersMap.size === 0) return [];

    return standings.standings.results
      .map((entry, index) => {
        const picksData = picksQueries[index]?.data;
        const historyData = historyQueries[index]?.data;
        const transfersData = transfersQueries[index]?.data;

        if (!picksData) return null;

        // Transform picks to ManagerPick format
        const picks: ManagerPick[] = picksData.picks.map((p) => ({
          playerId: p.element,
          position: p.position,
          multiplier: p.multiplier,
          isCaptain: p.is_captain,
          isViceCaptain: p.is_vice_captain,
        }));

        // Find captain and vice-captain
        const captainPick = picksData.picks.find((p) => p.is_captain);
        const viceCaptainPick = picksData.picks.find((p) => p.is_vice_captain);
        const captain = captainPick ? (playersMap.get(captainPick.element) ?? null) : null;
        const viceCaptain = viceCaptainPick
          ? (playersMap.get(viceCaptainPick.element) ?? null)
          : null;

        // Get transfers for this gameweek
        const gwTransfers = transfersData?.filter((t) => t.event === gameweek) ?? [];
        const transfersIn = gwTransfers
          .map((t) => playersMap.get(t.element_in))
          .filter((p): p is Player => p !== undefined);
        const transfersOut = gwTransfers
          .map((t) => playersMap.get(t.element_out))
          .filter((p): p is Player => p !== undefined);

        // Get chips used from history
        const chipsUsed =
          historyData?.chips.map((c) => ({
            name: c.name,
            event: c.event,
          })) ?? [];

        // Get previous gameweek's overall rank for arrows
        const previousGwHistory = historyData?.current.find((h) => h.event === gameweek - 1);
        const lastOverallRank = previousGwHistory?.overall_rank ?? 0;

        // Calculate total hits cost from history
        const totalHitsCost =
          historyData?.current
            .filter((h) => h.event <= gameweek)
            .reduce((sum, h) => sum + h.event_transfers_cost, 0) ?? 0;

        return {
          managerId: entry.entry,
          managerName: entry.player_name,
          teamName: entry.entry_name,
          rank: entry.rank,
          lastRank: entry.last_rank,
          gameweekPoints: picksData.entry_history.points,
          totalPoints: picksData.entry_history.total_points,
          overallRank: picksData.entry_history.overall_rank,
          lastOverallRank,
          picks,
          captain,
          viceCaptain,
          activeChip: picksData.active_chip,
          transfersIn,
          transfersOut,
          transfersCost: picksData.entry_history.event_transfers_cost,
          totalHitsCost,
          teamValue: picksData.entry_history.value / 10, // Convert from 0.1M
          bank: picksData.entry_history.bank / 10,
          chipsUsed,
        } satisfies ManagerGameweekData;
      })
      .filter((m): m is ManagerGameweekData => m !== null);
  }, [standings, picksQueries, historyQueries, transfersQueries, gameweek, playersMap]);

  // Compute loading state - loading if any picks query is still loading
  const isLoading = picksQueries.some((q) => q.isLoading);

  // Compute error - return first error encountered
  const error = useMemo(() => {
    const failedQuery = picksQueries.find((q) => q.error);
    if (failedQuery?.error) {
      return failedQuery.error instanceof Error
        ? failedQuery.error.message
        : String(failedQuery.error);
    }
    return null;
  }, [picksQueries]);

  const refetch = () => {
    for (const query of picksQueries) {
      query.refetch();
    }
    for (const query of historyQueries) {
      query.refetch();
    }
    for (const query of transfersQueries) {
      query.refetch();
    }
  };

  return {
    managers,
    isLoading,
    error,
    refetch,
  };
}
