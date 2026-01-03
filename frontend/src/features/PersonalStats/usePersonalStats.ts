import { useQuery } from '@tanstack/react-query';
import { CACHE_TIMES } from 'config';
import { useMemo } from 'react';

import { fplApi } from 'services/api';
import { queryKeys } from 'services/queryKeys';

import type { ManagerGameweekData } from 'services/queries/useFplData';
import type { Gameweek } from 'types/fpl';

export interface WeeklyData {
  gameweek: number;
  userPoints: number;
  leagueAverage: number;
  worldAverage: number;
}

export interface PersonalStatsData {
  weeklyData: WeeklyData[];
  bestGameweek: { gw: number; points: number } | null;
  worstGameweek: { gw: number; points: number } | null;
  totalPoints: number;
  leagueAverageTotal: number;
  worldAverageTotal: number;
}

interface UsePersonalStatsProps {
  managerId: number | null;
  managerDetails: ManagerGameweekData[];
  gameweeks: Gameweek[];
  enabled: boolean;
}

export function usePersonalStats({
  managerId,
  managerDetails,
  gameweeks,
  enabled,
}: UsePersonalStatsProps) {
  // Fetch user's entry history
  const historyQuery = useQuery({
    queryKey: queryKeys.entryHistory(managerId ?? 0),
    queryFn: () => fplApi.getEntryHistory(managerId!),
    staleTime: CACHE_TIMES.FIVE_MINUTES,
    enabled: enabled && managerId !== null,
  });

  // Calculate league averages per gameweek from managerDetails
  // We need to fetch historical data for all managers to get their per-GW points
  const leagueManagerIds = useMemo(() => managerDetails.map((m) => m.managerId), [managerDetails]);

  // Fetch history for all league managers to calculate league average
  const leagueHistoriesQuery = useQuery({
    queryKey: ['leagueHistories', [...leagueManagerIds].sort((a, b) => a - b).join(',')],
    queryFn: async () => {
      const histories = await Promise.all(leagueManagerIds.map((id) => fplApi.getEntryHistory(id)));
      return histories;
    },
    staleTime: CACHE_TIMES.FIVE_MINUTES,
    enabled: enabled && leagueManagerIds.length > 0,
  });

  // Calculate stats
  const stats = useMemo((): PersonalStatsData | null => {
    if (!historyQuery.data || !leagueHistoriesQuery.data) return null;

    const userHistory = historyQuery.data.current;
    const leagueHistories = leagueHistoriesQuery.data;

    // Build weekly data - entry history API only returns completed gameweeks
    const completedGWs = userHistory;

    const weeklyData: WeeklyData[] = completedGWs.map((gw) => {
      // League average for this GW
      const leaguePointsThisGW = leagueHistories
        .map((h) => h.current.find((g) => g.event === gw.event)?.points ?? 0)
        .filter((p) => p > 0);
      const leagueAverage =
        leaguePointsThisGW.length > 0
          ? Math.round(leaguePointsThisGW.reduce((a, b) => a + b, 0) / leaguePointsThisGW.length)
          : 0;

      // World average from bootstrap gameweeks
      const gwData = gameweeks.find((g) => g.id === gw.event);
      const worldAverage = gwData?.average_entry_score ?? 0;

      return {
        gameweek: gw.event,
        userPoints: gw.points,
        leagueAverage,
        worldAverage,
      };
    });

    // Find best and worst gameweeks
    let bestGameweek: { gw: number; points: number } | null = null;
    let worstGameweek: { gw: number; points: number } | null = null;

    if (weeklyData.length > 0) {
      const sorted = [...weeklyData].sort((a, b) => b.userPoints - a.userPoints);
      bestGameweek = { gw: sorted[0].gameweek, points: sorted[0].userPoints };
      worstGameweek = {
        gw: sorted[sorted.length - 1].gameweek,
        points: sorted[sorted.length - 1].userPoints,
      };
    }

    // Calculate totals
    const totalPoints = weeklyData.reduce((sum, w) => sum + w.userPoints, 0);
    const leagueAverageTotal = weeklyData.reduce((sum, w) => sum + w.leagueAverage, 0);
    const worldAverageTotal = weeklyData.reduce((sum, w) => sum + w.worldAverage, 0);

    return {
      weeklyData,
      bestGameweek,
      worstGameweek,
      totalPoints,
      leagueAverageTotal,
      worldAverageTotal,
    };
  }, [historyQuery.data, leagueHistoriesQuery.data, gameweeks]);

  return {
    data: stats,
    isLoading: historyQuery.isLoading || leagueHistoriesQuery.isLoading,
    error: historyQuery.error?.message || leagueHistoriesQuery.error?.message || null,
  };
}
