import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

interface ManagerFreeTransfers {
  managerId: number;
  teamName: string;
  freeTransfers: number;
}

interface UseFreeTransfersReturn {
  freeTransfers: ManagerFreeTransfers[];
  loading: boolean;
  error: string | null;
}

/**
 * Calculates remaining free transfers for each manager.
 *
 * FPL Free Transfer Rules:
 * - Start with 1 FT at beginning of season
 * - Gain +1 FT per gameweek (max 2 can be banked)
 * - Wildcard resets FT to 1
 * - Free Hit doesn't consume FT (transfers don't count that GW)
 * - Transfers beyond available FT cost -4 points each
 *
 * @param managerIds Array of manager IDs and team names
 * @param currentGameweek Current gameweek number
 * @returns Free transfers per manager, loading state, and error
 */
export function useFreeTransfers(
  managerIds: { id: number; teamName: string }[],
  currentGameweek: number,
  deadlinePassed = false
): UseFreeTransfersReturn {
  // Fetch history for all managers in parallel
  // Uses same query key pattern as useFplData, so TanStack Query will cache/dedupe
  const historyQueries = useQueries({
    queries: managerIds.map((manager) => ({
      queryKey: queryKeys.entryHistory(manager.id),
      queryFn: () => fplApi.getEntryHistory(manager.id),
      staleTime: 60 * 1000, // Fresh for 1 minute
      enabled: managerIds.length > 0 && currentGameweek > 0,
    })),
  });

  // Calculate free transfers from history data
  const freeTransfers = useMemo(() => {
    if (managerIds.length === 0 || currentGameweek === 0) {
      return [];
    }

    return managerIds.map((manager, index) => {
      const historyQuery = historyQueries[index];

      // Default to 1 FT if no data
      if (!historyQuery.data) {
        return {
          managerId: manager.id,
          teamName: manager.teamName,
          freeTransfers: 1,
        };
      }

      const ft = calculateFreeTransfers(
        historyQuery.data.current,
        historyQuery.data.chips,
        currentGameweek,
        deadlinePassed
      );

      return {
        managerId: manager.id,
        teamName: manager.teamName,
        freeTransfers: ft,
      };
    });
  }, [managerIds, currentGameweek, deadlinePassed, historyQueries]);

  const loading = historyQueries.some((q) => q.isLoading);
  const error = historyQueries.find((q) => q.error)?.error?.message ?? null;

  return { freeTransfers, loading, error };
}

/**
 * Calculates available free transfers.
 *
 * Iterates through gameweek history to track FT accumulation:
 * - After each completed GW: FT = min(5, previous_FT - transfers_made + 1)
 * - Current GW before deadline: FT = previous_FT - transfers_made
 * - Current GW after deadline: FT = min(5, previous_FT - transfers_made + 1)
 *   (because transfers now apply to next GW, and +1 FT is granted)
 * - Wildcard resets FT to 1
 * - Free Hit skips the GW (FT carries over unchanged)
 *
 * Note: 2024/25 season allows banking up to 5 FT (increased from 2)
 */
export function calculateFreeTransfers(
  history: { event: number; event_transfers: number }[],
  chips: { name: string; event: number }[],
  currentGameweek: number,
  deadlinePassed = false
): number {
  // Build chip usage maps for O(1) lookup
  const wildcardGws = new Set(chips.filter((c) => c.name === 'wildcard').map((c) => c.event));
  const freeHitGws = new Set(chips.filter((c) => c.name === 'freehit').map((c) => c.event));

  // Start with 1 FT
  let ft = 1;

  // Sort history by gameweek (ascending)
  const sortedHistory = [...history].sort((a, b) => a.event - b.event);

  // Max FT that can be banked (5 in 2024/25 season)
  const maxFt = 5;

  for (const gw of sortedHistory) {
    // Stop after current GW - we want remaining FT NOW
    if (gw.event > currentGameweek) break;

    const isCurrentGw = gw.event === currentGameweek;
    // Treat current GW as "completed" if deadline has passed (transfers apply to next GW)
    const gwComplete = !isCurrentGw || deadlinePassed;

    // Wildcard resets to 1 FT (transfers don't consume FT)
    if (wildcardGws.has(gw.event)) {
      ft = 1;
      // Gain +1 FT after GW completes
      if (gwComplete) {
        ft = Math.min(maxFt, ft + 1);
      }
      continue;
    }

    // Free Hit - transfers don't consume FT
    if (freeHitGws.has(gw.event)) {
      // Gain +1 FT after GW completes
      if (gwComplete) {
        ft = Math.min(maxFt, ft + 1);
      }
      continue;
    }

    // Normal gameweek: consume FT for transfers made
    const transfersMade = gw.event_transfers;
    ft = Math.max(0, ft - transfersMade);

    // Gain +1 FT after GW completes
    if (gwComplete) {
      ft = Math.min(maxFt, ft + 1);
    }
  }

  return ft;
}
