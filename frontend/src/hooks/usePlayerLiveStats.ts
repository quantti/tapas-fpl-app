import { useMemo } from 'react';

import { isOutfieldPosition, DEFCON_THRESHOLDS } from 'utils/defcon';
import {
  shouldShowProvisionalBonus,
  calculateProvisionalBonus,
  isFixtureLive,
  type BpsScore,
} from 'utils/liveScoring';

import type { LiveContext } from 'features/PlayerDetails/PlayerDetails';
import type { Fixture, LivePlayer } from 'types/fpl';

/** Point breakdown stat from the explain array */
export interface ExplainStat {
  identifier: string;
  points: number;
  value: number;
}

/** Return type of the usePlayerLiveStats hook */
export interface PlayerLiveStats {
  /** Player is in an active or finished match this gameweek */
  isLive: boolean;
  /** The player's current fixture (if found) */
  fixture: Fixture | null;
  /** Fixture is currently in progress (not finished) */
  isInProgress: boolean;
  /** Minutes played */
  minutes: number;
  /** Current live points (total_points from API) */
  totalPoints: number;
  /** Goals scored in this match */
  goals: number;
  /** Assists in this match */
  assists: number;
  /** Yellow cards (0 or 1) */
  yellowCards: number;
  /** Red cards (0 or 1) */
  redCards: number;
  /** BPS score (Bonus Point System) */
  bps: number;
  /** Official bonus if awarded (0 until confirmed) */
  officialBonus: number;
  /** Provisional bonus (0-3), calculated from BPS ranking */
  provisionalBonus: number;
  /** True if >= 60 minutes or fixture finished */
  showProvisionalBonus: boolean;
  /** Raw defensive contribution (CBIT/CBITr value) */
  defensiveContribution: number;
  /** True if player met DefCon threshold for their position */
  metDefCon: boolean;
  /** Point breakdown by scoring category */
  explain: ExplainStat[];
}

const DEFAULT_STATS: PlayerLiveStats = {
  isLive: false,
  fixture: null,
  isInProgress: false,
  minutes: 0,
  totalPoints: 0,
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  bps: 0,
  officialBonus: 0,
  provisionalBonus: 0,
  showProvisionalBonus: false,
  defensiveContribution: 0,
  metDefCon: false,
  explain: [],
};

/**
 * Find a player's fixture by checking which fixture their team is playing in
 */
function findPlayerFixture(teamId: number, fixtures: Fixture[], gameweek: number): Fixture | null {
  return (
    fixtures.find((f) => f.event === gameweek && (f.team_h === teamId || f.team_a === teamId)) ??
    null
  );
}

/**
 * Get player's defensive contribution from fixture stats
 */
function getDefensiveContribution(playerId: number, fixture: Fixture): number {
  if (!fixture.stats || !Array.isArray(fixture.stats)) return 0;

  const dcStat = fixture.stats.find((s) => s.identifier === 'defensive_contribution');
  if (!dcStat) return 0;

  // Check both home and away arrays
  const entry = [...dcStat.h, ...dcStat.a].find((e) => e.element === playerId);
  return entry?.value ?? 0;
}

/**
 * Calculate provisional bonus for a specific player in their fixture
 */
function calculatePlayerProvisionalBonus(
  playerId: number,
  fixture: Fixture,
  liveElements: LivePlayer[]
): number {
  // Get all players in this fixture by checking their explain array
  const playersInFixture = liveElements.filter((p) =>
    p.explain.some((e) => e.fixture === fixture.id)
  );

  if (playersInFixture.length === 0) return 0;

  // Build BPS scores array
  const bpsScores: BpsScore[] = playersInFixture.map((p) => ({
    playerId: p.id,
    bps: p.stats.bps,
  }));

  // Calculate provisional bonus map
  const bonusMap = calculateProvisionalBonus(bpsScores);

  return bonusMap.get(playerId) ?? 0;
}

/**
 * Flatten the explain array into a simple list of stats
 */
function flattenExplain(livePlayer: LivePlayer): ExplainStat[] {
  const stats: ExplainStat[] = [];

  for (const explain of livePlayer.explain) {
    for (const stat of explain.stats) {
      stats.push({
        identifier: stat.identifier,
        points: stat.points,
        value: stat.value,
      });
    }
  }

  return stats;
}

/**
 * Hook to extract live match statistics for a player.
 *
 * Computes all live stats from the provided context, keeping the
 * presentation component (LiveMatchSection) simple and testable.
 *
 * @param playerId - The player's FPL ID
 * @param elementType - The player's position (1=GK, 2=DEF, 3=MID, 4=FWD)
 * @param teamId - The player's team ID (to find their fixture)
 * @param liveContext - Optional live context from ManagerModal
 */
export function usePlayerLiveStats(
  playerId: number | null,
  elementType: number,
  teamId: number,
  liveContext: LiveContext | undefined
): PlayerLiveStats {
  return useMemo(() => {
    // No live context or no player - return defaults
    if (!liveContext || !playerId) {
      return DEFAULT_STATS;
    }

    const { gameweek, liveData, fixtures } = liveContext;

    // No live data available
    if (!liveData) {
      return DEFAULT_STATS;
    }

    // Find player's fixture for this gameweek
    const fixture = findPlayerFixture(teamId, fixtures, gameweek);
    if (!fixture) {
      return DEFAULT_STATS;
    }

    // Fixture hasn't started yet
    if (!fixture.started) {
      return {
        ...DEFAULT_STATS,
        fixture,
      };
    }

    // Find player in live data
    const livePlayer = liveData.elements.find((p) => p.id === playerId);
    if (!livePlayer) {
      return {
        ...DEFAULT_STATS,
        fixture,
        isLive: fixture.started,
        isInProgress: isFixtureLive(fixture),
      };
    }

    const { stats } = livePlayer;

    // Get defensive contribution from fixture stats (not livePlayer)
    const defensiveContribution = getDefensiveContribution(playerId, fixture);

    // Check if player met DefCon threshold
    const metDefCon =
      isOutfieldPosition(elementType) && defensiveContribution >= DEFCON_THRESHOLDS[elementType];

    // Calculate provisional bonus
    const showProvisionalBonus = shouldShowProvisionalBonus(fixture);
    const provisionalBonus = showProvisionalBonus
      ? calculatePlayerProvisionalBonus(playerId, fixture, liveData.elements)
      : 0;

    return {
      isLive: true,
      fixture,
      isInProgress: isFixtureLive(fixture),
      minutes: stats.minutes,
      totalPoints: stats.total_points,
      goals: stats.goals_scored,
      assists: stats.assists,
      yellowCards: stats.yellow_cards,
      redCards: stats.red_cards,
      bps: stats.bps,
      officialBonus: stats.bonus,
      provisionalBonus,
      showProvisionalBonus,
      defensiveContribution,
      metDefCon,
      explain: flattenExplain(livePlayer),
    };
  }, [playerId, elementType, teamId, liveContext]);
}
