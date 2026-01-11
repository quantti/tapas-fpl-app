import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { calculateProvisionalBonus, shouldShowProvisionalBonus } from 'utils/liveScoring';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import type { LiveGameweek, Fixture, LivePlayer, PickForPoints } from 'types/fpl';

interface UseLiveScoringReturn {
  liveData: LiveGameweek | null;
  fixtures: Fixture[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  getPlayerLivePoints: (playerId: number) => number;
  getProvisionalBonus: (playerId: number, fixtureId: number) => number;
  calculateTeamPoints: (picks: PickForPoints[]) => number;
  refresh: () => Promise<void>;
}

const DEFAULT_POLL_INTERVAL = 60000; // 60 seconds

export function useLiveScoring(
  gameweek: number,
  isLive: boolean,
  pollInterval: number = DEFAULT_POLL_INTERVAL
): UseLiveScoringReturn {
  // Fetch live gameweek data with automatic polling when live
  const {
    data: liveData,
    error: liveError,
    isLoading: liveLoading,
    dataUpdatedAt: liveUpdatedAt,
    refetch: refetchLive,
  } = useQuery({
    queryKey: queryKeys.liveGameweek(gameweek),
    queryFn: () => fplApi.getLiveGameweek(gameweek),
    enabled: gameweek > 0,
    refetchInterval: isLive ? pollInterval : false,
    staleTime: isLive ? 0 : 5 * 60 * 1000, // Always fresh when live, 5min when not
  });

  // Fetch fixtures with same polling behavior
  const {
    data: fixtures,
    error: fixturesError,
    isLoading: fixturesLoading,
    refetch: refetchFixtures,
  } = useQuery({
    queryKey: queryKeys.fixtures(gameweek),
    queryFn: () => fplApi.getFixtures(gameweek),
    enabled: gameweek > 0,
    refetchInterval: isLive ? pollInterval : false,
    staleTime: isLive ? 0 : 5 * 60 * 1000,
  });

  // Memoized Map for O(1) player lookups instead of O(n) array.find()
  const livePlayersMap = useMemo<Map<number, LivePlayer>>(
    () => (liveData ? new Map(liveData.elements.map((p) => [p.id, p])) : new Map()),
    [liveData]
  );

  const getPlayerLivePoints = useCallback(
    (playerId: number): number => {
      const player = livePlayersMap.get(playerId);
      return player?.stats.total_points ?? 0;
    },
    [livePlayersMap]
  );

  const getProvisionalBonus = useCallback(
    (playerId: number, fixtureId: number): number => {
      if (!liveData || !fixtures?.length) return 0;

      const fixture = fixtures.find((f) => f.id === fixtureId);
      if (!fixture || !shouldShowProvisionalBonus(fixture)) {
        return 0;
      }

      // Get BPS scores for players in this fixture
      const playersInFixture = liveData.elements.filter((p) =>
        p.explain.some((e) => e.fixture === fixtureId)
      );

      const bpsScores = playersInFixture.map((p) => ({
        playerId: p.id,
        bps: p.stats.bps,
      }));

      const bonusMap = calculateProvisionalBonus(bpsScores);
      return bonusMap.get(playerId) ?? 0;
    },
    [liveData, fixtures]
  );

  const calculateTeamPoints = useCallback(
    (picks: PickForPoints[]): number => {
      return picks.reduce((total, pick) => {
        const player = livePlayersMap.get(pick.element);
        const basePoints = player?.stats.total_points ?? 0;
        return total + pick.multiplier * basePoints;
      }, 0);
    },
    [livePlayersMap]
  );

  const refresh = useCallback(async () => {
    await Promise.all([refetchLive(), refetchFixtures()]);
  }, [refetchLive, refetchFixtures]);

  // Combine errors
  const error = liveError || fixturesError;
  const getErrorMessage = (): string | null => {
    if (!error) return null;
    if (error instanceof Error) return error.message;
    return String(error);
  };
  const errorMessage = getErrorMessage();

  return {
    liveData: liveData ?? null,
    fixtures: fixtures ?? [],
    loading: liveLoading || fixturesLoading,
    error: errorMessage,
    lastUpdated: liveUpdatedAt ? new Date(liveUpdatedAt) : null,
    getPlayerLivePoints,
    getProvisionalBonus,
    calculateTeamPoints,
    refresh,
  };
}
