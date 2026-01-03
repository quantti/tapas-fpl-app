import { useQuery } from '@tanstack/react-query';

import { parseNumericString } from 'utils/playerStats';

import { CACHE_TIMES } from '../../config';
import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import type { ElementSummary, Player, Team } from 'types/fpl';

/**
 * Processed player details with computed fields for display
 */
export interface PlayerDetails {
  // Basic info
  player: Player;
  team: Team;
  positionName: string;

  // Price formatting
  price: string; // e.g., "£13.2m"
  priceChange: number; // season price change in £0.1m units (e.g., 5 = +£0.5m)
  priceChangeFormatted: string; // e.g., "+£0.5m" or "-£0.2m"

  // xG analysis (season totals)
  xgDelta: number; // goals_scored - expected_goals
  xaDelta: number; // assists - expected_assists

  // Per 90 minutes stats
  xG90: number; // expected_goals per 90 minutes
  xA90: number; // expected_assists per 90 minutes
  xGI90: number; // expected_goal_involvements per 90 minutes
  xGC90: number; // expected_goals_conceded per 90 minutes (for GK/DEF)
  pts90: number; // points per 90 minutes

  // Form analysis
  formVsAvg: 'above' | 'below' | 'same'; // form vs points_per_game
  formDiff: number; // form - points_per_game

  // Element summary data (async loaded)
  summary: ElementSummary | null;
  isLoadingSummary: boolean;
}

interface UsePlayerDetailsOptions {
  player: Player | null;
  teams: Team[];
  elementTypes: { id: number; singular_name: string }[];
  enabled?: boolean;
}

/**
 * Hook to get detailed player information including element-summary data.
 * Fetches element-summary on demand when a player is selected.
 */
export function usePlayerDetails({
  player,
  teams,
  elementTypes,
  enabled = true,
}: UsePlayerDetailsOptions): PlayerDetails | null {
  const { data: summary, isLoading: isLoadingSummary } = useQuery({
    queryKey: queryKeys.playerSummary(player?.id),
    queryFn: () => fplApi.getPlayerSummary(player!.id),
    enabled: enabled && player !== null,
    staleTime: CACHE_TIMES.FIVE_MINUTES,
  });

  if (!player) return null;

  const team = teams.find((t) => t.id === player.team);
  const elementType = elementTypes.find((et) => et.id === player.element_type);

  // Calculate price (now_cost is in 0.1m units, e.g., 132 = £13.2m)
  const price = `£${(player.now_cost / 10).toFixed(1)}m`;

  // Price change: current price minus season start price
  // Use first gameweek from history array (sorted by round) to get season start value
  const firstGameweek =
    summary?.history && summary.history.length > 0
      ? [...summary.history].sort((a, b) => a.round - b.round)[0]
      : null;
  const seasonStartPrice = firstGameweek?.value ?? player.now_cost;
  const priceChange = player.now_cost - seasonStartPrice;
  const priceChangeSign = priceChange > 0 ? '+' : '';
  const priceChangeFormatted =
    priceChange === 0 ? '' : `${priceChangeSign}£${(priceChange / 10).toFixed(1)}m`;

  // xG deltas (positive = overperforming)
  const xgDelta = player.goals_scored - parseNumericString(player.expected_goals);
  const xaDelta = player.assists - parseNumericString(player.expected_assists);

  // Per 90 calculations
  const minutes = player.minutes || 0;
  const per90Factor = minutes > 0 ? 90 / minutes : 0;
  const xG90 = parseNumericString(player.expected_goals) * per90Factor;
  const xA90 = parseNumericString(player.expected_assists) * per90Factor;
  const xGI90 = parseNumericString(player.expected_goal_involvements) * per90Factor;
  const xGC90 = parseNumericString(player.expected_goals_conceded) * per90Factor;
  const pts90 = player.total_points * per90Factor;

  // Form vs average
  const form = parseNumericString(player.form);
  const ppg = parseNumericString(player.points_per_game);
  const formDiff = form - ppg;
  const getFormVsAvg = (): 'above' | 'below' | 'same' => {
    if (formDiff > 0.5) return 'above';
    if (formDiff < -0.5) return 'below';
    return 'same';
  };
  const formVsAvg = getFormVsAvg();

  return {
    player,
    team: team!,
    positionName: elementType?.singular_name || 'Unknown',
    price,
    priceChange,
    priceChangeFormatted,
    xgDelta,
    xaDelta,
    xG90,
    xA90,
    xGI90,
    xGC90,
    pts90,
    formVsAvg,
    formDiff,
    summary: summary ?? null,
    isLoadingSummary,
  };
}

/**
 * Format FDR (Fixture Difficulty Rating) to color class
 */
export function getFdrColor(difficulty: number): 'easy' | 'medium' | 'hard' {
  if (difficulty <= 2) return 'easy';
  if (difficulty === 3) return 'medium';
  return 'hard';
}

/**
 * Get player's upcoming fixtures from element-summary
 */
export function getUpcomingFixtures(
  summary: ElementSummary | null,
  count = 5
): ElementSummary['fixtures'] {
  if (!summary) return [];
  return summary.fixtures.slice(0, count);
}

/**
 * Get player's recent history from element-summary
 * Filters out unplayed fixtures (0 minutes AND 0 points)
 */
export function getRecentHistory(
  summary: ElementSummary | null,
  count = 5
): ElementSummary['history'] {
  if (!summary) return [];
  // Filter out unplayed fixtures, reverse (newest first), take N
  return [...summary.history]
    .filter((gw) => gw.minutes > 0 || gw.total_points > 0)
    .reverse()
    .slice(0, count);
}

/**
 * Get player photo URL from FPL CDN
 * @param photo - The photo filename from Player.photo (e.g., "154561.jpg")
 * @param size - Image size: '40x40' | '110x140' | '250x250' (default: '110x140')
 */
export function getPlayerPhotoUrl(
  photo: string,
  size: '40x40' | '110x140' | '250x250' = '110x140'
): string {
  return `https://resources.premierleague.com/premierleague/photos/players/${size}/${photo}`;
}
