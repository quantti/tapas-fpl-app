/**
 * Utilities for FPL pick data
 */

interface PickBadgeInput {
  is_captain: boolean;
  is_vice_captain: boolean;
}

/**
 * Returns the captain badge for a pick.
 * - 'C' for captain
 * - 'V' for vice captain
 * - undefined for regular player
 */
export function getCaptainBadge(pick: PickBadgeInput): 'C' | 'V' | undefined {
  if (pick.is_captain) {
    return 'C';
  }
  if (pick.is_vice_captain) {
    return 'V';
  }
  return undefined;
}
