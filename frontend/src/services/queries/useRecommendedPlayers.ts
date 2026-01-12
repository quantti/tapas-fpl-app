import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CACHE_TIMES, CURRENT_SEASON_ID } from 'src/config';

import { backendApi, BackendApiError } from '../backendApi';
import { queryKeys } from '../queryKeys';

import type { Player, Team } from 'types/fpl';

export interface RecommendedPlayer {
  player: Player;
  team: Team;
  score: number;
  fixtureScore: number;
  leagueOwnership: number;
}

interface UseRecommendedPlayersReturn {
  punts: RecommendedPlayer[];
  defensive: RecommendedPlayer[];
  toSell: RecommendedPlayer[];
  loading: boolean;
  error: string | null;
}

interface UseRecommendedPlayersOptions {
  seasonId?: number;
  enabled?: boolean;
}

export function useRecommendedPlayers(
  leagueId: number,
  playersMap: Map<number, Player>,
  teamsMap: Map<number, Team>,
  { seasonId = CURRENT_SEASON_ID, enabled = true }: UseRecommendedPlayersOptions = {}
): UseRecommendedPlayersReturn {
  const query = useQuery({
    queryKey: queryKeys.leagueRecommendations(leagueId, seasonId),
    queryFn: () => backendApi.getLeagueRecommendations(leagueId, { seasonId, limit: 20 }),
    staleTime: CACHE_TIMES.TEN_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
    enabled: enabled && leagueId > 0 && playersMap.size > 0,
    retry: (failureCount, error) => {
      if (error instanceof BackendApiError && error.isServiceUnavailable) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Transform backend response to RecommendedPlayer[]
  const { data } = query;

  const punts = useMemo((): RecommendedPlayer[] => {
    if (!data?.punts) return [];

    return data.punts
      .map((p) => {
        const player = playersMap.get(p.id);
        const team = teamsMap.get(p.team);
        if (!player || !team) return null;

        return {
          player,
          team,
          score: p.score,
          fixtureScore: 0, // Not provided by backend, but component doesn't use it
          leagueOwnership: p.ownership / 100, // Backend returns 0-100, frontend uses 0-1
        };
      })
      .filter((p): p is RecommendedPlayer => p !== null);
  }, [data, playersMap, teamsMap]);

  const defensive = useMemo((): RecommendedPlayer[] => {
    if (!data?.defensive) return [];

    return data.defensive
      .map((p) => {
        const player = playersMap.get(p.id);
        const team = teamsMap.get(p.team);
        if (!player || !team) return null;

        return {
          player,
          team,
          score: p.score,
          fixtureScore: 0,
          leagueOwnership: p.ownership / 100,
        };
      })
      .filter((p): p is RecommendedPlayer => p !== null);
  }, [data, playersMap, teamsMap]);

  const toSell = useMemo((): RecommendedPlayer[] => {
    if (!data?.time_to_sell) return [];

    return data.time_to_sell
      .map((p) => {
        const player = playersMap.get(p.id);
        const team = teamsMap.get(p.team);
        if (!player || !team) return null;

        return {
          player,
          team,
          score: p.sell_score ?? p.score, // Use sell_score if available
          fixtureScore: 0,
          leagueOwnership: p.ownership / 100,
        };
      })
      .filter((p): p is RecommendedPlayer => p !== null);
  }, [data, playersMap, teamsMap]);

  // Build error message
  let errorMessage: string | null = null;
  if (query.error) {
    if (query.error instanceof BackendApiError) {
      if (query.error.status === 429) {
        errorMessage = 'Rate limited. Please try again later.';
      } else if (query.error.isServiceUnavailable) {
        errorMessage = 'Recommendations service temporarily unavailable.';
      } else {
        errorMessage = query.error.message;
      }
    } else {
      errorMessage = 'Failed to load recommendations.';
    }
  }

  return {
    punts,
    defensive,
    toSell,
    loading: query.isLoading,
    error: errorMessage,
  };
}
