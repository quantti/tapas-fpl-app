import { useQueries } from '@tanstack/react-query';
import { CACHE_TIMES } from 'config';
import { useMemo } from 'react';

import { fplApi } from 'services/api';
import { queryKeys } from 'services/queryKeys';

import {
  aggregatePositionPoints,
  calculateGameweekPositionPoints,
  toPositionBreakdown,
} from './positionBreakdownUtils';

import type { LiveGameweek, Player } from 'types/fpl';

export type { PositionBreakdown } from './positionBreakdownUtils';

interface UsePositionBreakdownProps {
  managerId: number | null;
  playersMap: Map<number, Player>;
  completedGameweeks: number[];
  enabled: boolean;
}

export function usePositionBreakdown({
  managerId,
  playersMap,
  completedGameweeks,
  enabled,
}: UsePositionBreakdownProps) {
  // Fetch picks for each completed gameweek
  const picksQueries = useQueries({
    queries: completedGameweeks.map((gw) => ({
      queryKey: queryKeys.entryPicks(managerId ?? 0, gw),
      queryFn: () => fplApi.getEntryPicks(managerId!, gw),
      staleTime: Infinity, // Past picks never change
      gcTime: CACHE_TIMES.ONE_HOUR,
      enabled: enabled && managerId !== null,
    })),
  });

  // Fetch live data for each completed gameweek
  const liveQueries = useQueries({
    queries: completedGameweeks.map((gw) => ({
      queryKey: queryKeys.liveGameweek(gw),
      queryFn: () => fplApi.getLiveGameweek(gw),
      staleTime: Infinity, // Past GWs never change
      gcTime: CACHE_TIMES.ONE_HOUR,
      enabled: enabled && completedGameweeks.length > 0,
    })),
  });

  // Calculate position breakdown
  const breakdown = useMemo(() => {
    const allPicksLoaded = picksQueries.every((q) => q.data);
    const allLiveLoaded = liveQueries.every((q) => q.data);

    if (!allPicksLoaded || !allLiveLoaded || playersMap.size === 0) {
      return null;
    }

    // Build live data map by gameweek
    const liveByGw = new Map<number, LiveGameweek>();
    for (let i = 0; i < liveQueries.length; i++) {
      const q = liveQueries[i];
      if (q.data) {
        liveByGw.set(completedGameweeks[i], q.data);
      }
    }

    // Calculate points for each gameweek
    const gameweekPoints = picksQueries.map((query, i) => {
      const picksData = query.data;
      const liveData = liveByGw.get(completedGameweeks[i]);

      if (!picksData || !liveData) {
        return { 1: 0, 2: 0, 3: 0, 4: 0 };
      }

      return calculateGameweekPositionPoints(picksData, liveData, playersMap);
    });

    const aggregated = aggregatePositionPoints(gameweekPoints);
    return toPositionBreakdown(aggregated);
  }, [picksQueries, liveQueries, playersMap, completedGameweeks]);

  const isLoading = picksQueries.some((q) => q.isLoading) || liveQueries.some((q) => q.isLoading);
  const error = picksQueries.find((q) => q.error)?.error || liveQueries.find((q) => q.error)?.error;

  return {
    data: breakdown,
    isLoading,
    error: error?.message ?? null,
  };
}
