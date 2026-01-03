import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CACHE_TIMES } from 'src/config';

import { POSITION_TYPES } from 'constants/positions';

import {
  isEligibleOutfieldPlayer,
  calculatePlayerStats,
  calculatePlayerPercentiles,
  calculateBuyScore,
  calculateSellScore,
  calculateFixtureScore,
  calculateLeagueOwnership,
  PUNT_WEIGHTS,
  DEFENSIVE_WEIGHTS,
  SELL_WEIGHTS,
  type PercentilesData,
} from 'utils/playerScoring';
import { parseNumericString } from 'utils/playerStats';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import type { ManagerGameweekData } from './useFplData';
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

export function useRecommendedPlayers(
  players: Player[],
  managerDetails: ManagerGameweekData[],
  teamsMap: Map<number, Team>,
  currentGameweek: number
): UseRecommendedPlayersReturn {
  // Fetch all fixtures for fixture difficulty calculation
  const fixturesQuery = useQuery({
    queryKey: queryKeys.fixturesAll,
    queryFn: () => fplApi.getFixtures(),
    staleTime: CACHE_TIMES.TEN_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
    enabled: players.length > 0 && currentGameweek > 0,
  });

  // Calculate league ownership
  const leagueOwnership = useMemo(
    () => calculateLeagueOwnership(players, managerDetails),
    [players, managerDetails]
  );

  // Calculate fixture scores for all teams
  const teamFixtureScores = useMemo(() => {
    const fixtures = fixturesQuery.data ?? [];
    const scores = new Map<number, number>();
    for (const [teamId] of teamsMap) {
      scores.set(teamId, calculateFixtureScore(teamId, fixtures, currentGameweek));
    }
    return scores;
  }, [teamsMap, fixturesQuery.data, currentGameweek]);

  // Build percentile arrays for outfield players only
  const percentiles = useMemo((): PercentilesData => {
    const outfieldPlayers = players.filter(
      (p) => p.element_type !== POSITION_TYPES.GOALKEEPER && p.minutes >= 450 && p.status === 'a'
    );
    const defenders = outfieldPlayers.filter((p) => p.element_type === POSITION_TYPES.DEFENDER);

    const xG90: number[] = [];
    const xA90: number[] = [];
    const xGC90: number[] = []; // For defenders
    const cs90: number[] = []; // Clean sheets per 90 for defenders
    const form: number[] = [];

    for (const player of outfieldPlayers) {
      const minutes90 = player.minutes / 90;
      if (minutes90 > 0) {
        xG90.push(parseNumericString(player.expected_goals) / minutes90);
        xA90.push(parseNumericString(player.expected_assists) / minutes90);
      }
      form.push(parseNumericString(player.form));
    }

    // Defender-specific stats
    for (const player of defenders) {
      const minutes90 = player.minutes / 90;
      if (minutes90 > 0) {
        xGC90.push(parseNumericString(player.expected_goals_conceded) / minutes90);
        cs90.push(player.clean_sheets / minutes90);
      }
    }

    return { xG90, xA90, xGC90, cs90, form };
  }, [players]);

  // Calculate PUNTS - low ownership differential picks
  const punts = useMemo(() => {
    const candidates: RecommendedPlayer[] = [];

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue;

      const ownership = leagueOwnership.get(player.id) ?? 0;
      if (ownership >= 0.4) continue;

      const team = teamsMap.get(player.team);
      if (!team) continue;

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5;
      const stats = calculatePlayerStats(player);
      const pct = calculatePlayerPercentiles(stats, percentiles, true);
      const weights = PUNT_WEIGHTS[player.element_type] ?? PUNT_WEIGHTS[3];
      const score = calculateBuyScore(pct, weights, fixtureScore);

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles]);

  // Calculate DEFENSIVE OPTIONS - template picks with moderate ownership
  const defensive = useMemo(() => {
    const candidates: RecommendedPlayer[] = [];

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue;

      const ownership = leagueOwnership.get(player.id) ?? 0;
      if (ownership <= 0.4 || ownership >= 1) continue;

      const team = teamsMap.get(player.team);
      if (!team) continue;

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5;
      const stats = calculatePlayerStats(player);
      const pct = calculatePlayerPercentiles(stats, percentiles, true);
      const weights = DEFENSIVE_WEIGHTS[player.element_type] ?? DEFENSIVE_WEIGHTS[3];
      const score = calculateBuyScore(pct, weights, fixtureScore);

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles]);

  // Calculate TO SELL - underperforming owned players
  const toSell = useMemo(() => {
    const candidates: RecommendedPlayer[] = [];

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue;

      const ownership = leagueOwnership.get(player.id) ?? 0;
      if (ownership === 0) continue;

      const team = teamsMap.get(player.team);
      if (!team) continue;

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5;
      const stats = calculatePlayerStats(player);
      // For sell: don't invert xGC (high xGC = bad = higher sell score)
      const pct = calculatePlayerPercentiles(stats, percentiles, false);
      const weights = SELL_WEIGHTS[player.element_type] ?? SELL_WEIGHTS[3];
      const score = calculateSellScore(pct, weights, fixtureScore);

      // Only include if genuinely bad (score > 0.5 = worse than average)
      if (score <= 0.5) continue;

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership });
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles]);

  return {
    punts,
    defensive,
    toSell,
    loading: fixturesQuery.isLoading,
    error: fixturesQuery.error?.message ?? null,
  };
}
