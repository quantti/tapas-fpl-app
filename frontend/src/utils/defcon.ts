import type { PlayerHistory } from '../types/fpl';

// FPL position element_types: 1=GK, 2=DEF, 3=MID, 4=FWD
export type OutfieldPosition = 2 | 3 | 4;

/**
 * DefCon thresholds by position (FPL 2025/26 rules)
 * Defenders: 10+ CBIT (Clearances, Blocks, Interceptions, Tackles)
 * Midfielders/Forwards: 12+ CBITr (includes ball Recoveries)
 */
export const DEFCON_THRESHOLDS: Record<OutfieldPosition, number> = {
  2: 10, // Defenders: 10+ CBIT
  3: 12, // Midfielders: 12+ CBITr
  4: 12, // Forwards: 12+ CBITr
};

/** DefCon awards 2 bonus points when threshold is met */
export const DEFCON_BONUS_POINTS = 2;

/**
 * Type guard to check if a position is an outfield position (DEF/MID/FWD)
 * Goalkeepers (element_type=1) cannot earn DefCon points
 */
export function isOutfieldPosition(elementType: number): elementType is OutfieldPosition {
  return elementType === 2 || elementType === 3 || elementType === 4;
}

/**
 * Get the DefCon threshold for a given position
 * Returns null for goalkeepers (who cannot earn DefCon)
 */
export function getDefConThreshold(elementType: number): number | null {
  if (!isOutfieldPosition(elementType)) return null;
  return DEFCON_THRESHOLDS[elementType];
}

/**
 * Check if a player met the DefCon threshold for a single game
 */
export function metDefConThreshold(defensiveContribution: number, elementType: number): boolean {
  const threshold = getDefConThreshold(elementType);
  if (threshold === null) return false;
  return defensiveContribution >= threshold;
}

/**
 * Calculate a player's total DefCon points from their season history
 * Returns: { total: number, games: number, perGame: number }
 */
export function calculatePlayerSeasonDefCon(
  history: PlayerHistory[],
  elementType: number
): { total: number; games: number; perGame: number } {
  const threshold = getDefConThreshold(elementType);

  // GK or invalid position - no DefCon
  if (threshold === null) {
    return { total: 0, games: 0, perGame: 0 };
  }

  const defConGames = history.filter((gw) => (gw.defensive_contribution ?? 0) >= threshold).length;

  const total = defConGames * DEFCON_BONUS_POINTS;
  const totalGames = history.length;
  const perGame = totalGames > 0 ? total / totalGames : 0;

  return { total, games: defConGames, perGame };
}
