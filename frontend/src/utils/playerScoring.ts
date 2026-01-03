/**
 * Player scoring utilities for recommendations.
 *
 * Pure functions for calculating player scores, percentiles, and fixture difficulty.
 * Extracted from useRecommendedPlayers.ts for better testability and reuse.
 */

import { POSITION_TYPES } from 'constants/positions';

import { parseNumericString } from './playerStats';

import type { Player, Fixture } from 'types/fpl';

// ============================================================================
// Types
// ============================================================================

/**
 * Position-specific scoring weights
 * - DEF: clean sheets & low xGC matter most
 * - MID: balanced xG + xA
 * - FWD: xG matters more than xA
 */
export interface PositionWeights {
  xG: number;
  xA: number;
  xGC: number;
  cs: number;
  form: number;
  fix: number;
}

export interface PlayerStats {
  xG90: number;
  xA90: number;
  xGC90: number;
  cs90: number;
  form: number;
}

export interface PlayerPercentiles {
  xG90Pct: number;
  xA90Pct: number;
  xGC90Pct: number;
  cs90Pct: number;
  formPct: number;
}

export interface PercentilesData {
  xG90: number[];
  xA90: number[];
  xGC90: number[];
  cs90: number[];
  form: number[];
}

// ============================================================================
// Weight Configurations
// ============================================================================

/** Weights for punts - low ownership differential picks */
export const PUNT_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.1, xA: 0.1, xGC: 0.2, cs: 0.15, form: 0.25, fix: 0.2 }, // DEF
  3: { xG: 0.2, xA: 0.2, xGC: 0, cs: 0, form: 0.25, fix: 0.15 }, // MID
  4: { xG: 0.35, xA: 0.1, xGC: 0, cs: 0, form: 0.3, fix: 0.15 }, // FWD
};

/** Weights for defensive options - template players, more form-focused */
export const DEFENSIVE_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.35, fix: 0.25 }, // DEF
  3: { xG: 0.1, xA: 0.1, xGC: 0, cs: 0, form: 0.45, fix: 0.25 }, // MID
  4: { xG: 0.2, xA: 0.05, xGC: 0, cs: 0, form: 0.5, fix: 0.25 }, // FWD
};

/**
 * Weights for "to sell" - players to get rid of, primarily POOR FORM
 * Form is the dominant factor - we want players who've been bad recently
 * Fixtures are minor - good form players with tough fixtures shouldn't be sold
 */
export const SELL_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.55, fix: 0.05 }, // DEF
  3: { xG: 0.15, xA: 0.15, xGC: 0, cs: 0, form: 0.65, fix: 0.05 }, // MID
  4: { xG: 0.2, xA: 0.1, xGC: 0, cs: 0, form: 0.65, fix: 0.05 }, // FWD
};

/** Fixture weights: nearer gameweeks matter more */
export const FIXTURE_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];

// ============================================================================
// Pure Functions
// ============================================================================

/**
 * Check if player is eligible for recommendations.
 * Requires: outfield player, available status, minimum 450 minutes.
 */
export function isEligibleOutfieldPlayer(player: Player): boolean {
  return (
    player.element_type !== POSITION_TYPES.GOALKEEPER &&
    player.status === 'a' &&
    player.minutes >= 450
  );
}

/**
 * Calculate per-90 stats for a player.
 */
export function calculatePlayerStats(player: Player): PlayerStats {
  const minutes90 = player.minutes / 90;
  return {
    xG90: minutes90 > 0 ? parseNumericString(player.expected_goals) / minutes90 : 0,
    xA90: minutes90 > 0 ? parseNumericString(player.expected_assists) / minutes90 : 0,
    xGC90: minutes90 > 0 ? parseNumericString(player.expected_goals_conceded) / minutes90 : 0,
    cs90: minutes90 > 0 ? player.clean_sheets / minutes90 : 0,
    form: parseNumericString(player.form),
  };
}

/**
 * Calculate percentile ranking for a value within an array.
 * Returns 0.5 for empty array, 0-1 otherwise.
 */
export function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0.5;
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v < value).length;
  return rank / sorted.length;
}

/**
 * Calculate percentiles for player stats against distribution.
 * @param invertXGC - If true, lower xGC is better (high percentile)
 */
export function calculatePlayerPercentiles(
  stats: PlayerStats,
  percentiles: PercentilesData,
  invertXGC: boolean
): PlayerPercentiles {
  return {
    xG90Pct: getPercentile(stats.xG90, percentiles.xG90),
    xA90Pct: getPercentile(stats.xA90, percentiles.xA90),
    xGC90Pct: invertXGC
      ? 1 - getPercentile(stats.xGC90, percentiles.xGC90)
      : getPercentile(stats.xGC90, percentiles.xGC90),
    cs90Pct: getPercentile(stats.cs90, percentiles.cs90),
    formPct: getPercentile(stats.form, percentiles.form),
  };
}

/**
 * Calculate "buy" score for punts and defensive options.
 * Higher score = better player to buy.
 */
export function calculateBuyScore(
  pct: PlayerPercentiles,
  weights: PositionWeights,
  fixtureScore: number
): number {
  return (
    pct.xG90Pct * weights.xG +
    pct.xA90Pct * weights.xA +
    pct.xGC90Pct * weights.xGC +
    pct.cs90Pct * weights.cs +
    pct.formPct * weights.form +
    fixtureScore * weights.fix
  );
}

/**
 * Calculate "sell" score - higher = worse player (should sell).
 * Inverts stats so bad performance = high score.
 */
export function calculateSellScore(
  pct: PlayerPercentiles,
  weights: PositionWeights,
  fixtureScore: number
): number {
  return (
    (1 - pct.xG90Pct) * weights.xG +
    (1 - pct.xA90Pct) * weights.xA +
    pct.xGC90Pct * weights.xGC + // High xGC is bad (not inverted in pct)
    (1 - pct.cs90Pct) * weights.cs +
    (1 - pct.formPct) * weights.form +
    (1 - fixtureScore) * weights.fix
  );
}

/**
 * Calculate fixture difficulty score for a team's next 5 fixtures.
 * Returns 0-1 where 1 = easiest fixtures.
 */
export function calculateFixtureScore(
  teamId: number,
  fixtures: Fixture[],
  currentGW: number
): number {
  const upcoming = fixtures
    .filter((f) => f.event !== null && f.event > currentGW && f.event <= currentGW + 5)
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0));

  if (upcoming.length === 0) return 0.5;

  return upcoming.reduce((sum, f, i) => {
    const isHome = f.team_h === teamId;
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty;
    // Convert 1-5 difficulty to 0-1 ease score (5 = hardest = 0, 1 = easiest = 1)
    const easeScore = (5 - difficulty) / 4;
    return sum + easeScore * (FIXTURE_WEIGHTS[i] ?? 0);
  }, 0);
}

/**
 * Calculate league ownership percentage for all players.
 * @returns Map of playerId -> ownership (0-1)
 */
export function calculateLeagueOwnership(
  players: Player[],
  managerDetails: { picks: { playerId: number }[] }[]
): Map<number, number> {
  const ownershipMap = new Map<number, number>();

  if (managerDetails.length === 0) {
    return ownershipMap;
  }

  const counts = new Map<number, number>();
  for (const manager of managerDetails) {
    for (const pick of manager.picks) {
      counts.set(pick.playerId, (counts.get(pick.playerId) ?? 0) + 1);
    }
  }

  const managerCount = managerDetails.length;
  for (const player of players) {
    const count = counts.get(player.id) ?? 0;
    ownershipMap.set(player.id, count / managerCount);
  }

  return ownershipMap;
}
