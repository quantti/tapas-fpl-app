/**
 * Chip utilities for 2025/26 season rules.
 * All 4 chips (WC, FH, BB, TC) reset at GW20.
 */

export interface ChipUsage {
  name: string;
  event: number;
}

// Chips available in each half of the season
export const AVAILABLE_CHIPS = ['bboost', '3xc', 'freehit', 'wildcard'] as const;

export const CHIP_LABELS: Record<string, string> = {
  bboost: 'BB',
  '3xc': 'TC',
  freehit: 'FH',
  wildcard: 'WC',
};

export const CHIP_DISPLAY_NAMES: Record<string, string> = {
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  freehit: 'Free Hit',
  wildcard: 'Wildcard',
};

/**
 * Get remaining chips for the current half of the season.
 * @param chipsUsed - All chips used by the manager (from history.chips)
 * @param isSecondHalf - Whether we're in the second half (GW20+)
 * @returns Array of remaining chip internal names (e.g., 'bboost', 'wildcard')
 */
export function getRemainingChips(chipsUsed: ChipUsage[], isSecondHalf: boolean): string[] {
  const remaining = [...AVAILABLE_CHIPS] as string[];

  // Filter chips by which half they were used in
  const relevantChips = chipsUsed.filter((chip) => {
    const usedInFirstHalf = chip.event < 20;
    return isSecondHalf ? !usedInFirstHalf : usedInFirstHalf;
  });

  for (const used of relevantChips) {
    const normalizedUsed = used.name.toLowerCase();
    const index = remaining.indexOf(normalizedUsed);
    if (index !== -1) {
      remaining.splice(index, 1);
    }
  }

  return remaining;
}

/**
 * Get used chips for the current half of the season.
 * @param chipsUsed - All chips used by the manager (from history.chips)
 * @param isSecondHalf - Whether we're in the second half (GW20+)
 * @returns Array of used chip internal names (e.g., 'bboost', 'wildcard')
 */
export function getUsedChips(chipsUsed: ChipUsage[], isSecondHalf: boolean): string[] {
  return chipsUsed
    .filter((chip) => {
      const usedInFirstHalf = chip.event < 20;
      return isSecondHalf ? !usedInFirstHalf : usedInFirstHalf;
    })
    .map((chip) => chip.name.toLowerCase());
}

/**
 * Get chip display label from internal name (short: BB, TC, FH, WC).
 */
export function getChipLabel(name: string): string {
  return CHIP_LABELS[name.toLowerCase()] ?? name.toUpperCase();
}

/**
 * Get chip full display name from internal name (e.g., "Bench Boost").
 */
export function getChipDisplayName(name: string): string {
  return CHIP_DISPLAY_NAMES[name.toLowerCase()] ?? name;
}

/**
 * Format array of chip internal names to display names.
 */
export function formatChipNames(chips: string[]): string {
  if (chips.length === 0) return '—';
  return chips.map(getChipDisplayName).join(', ');
}

/**
 * Get both used and remaining chips with display labels for the current half.
 */
export function getChipsForCurrentHalf(
  chipsUsed: ChipUsage[],
  currentGameweek: number,
  deadlineTime?: string
): { used: string[]; remaining: string[] } {
  // Second half starts at GW20, or after GW19 deadline passes
  let isSecondHalf = currentGameweek >= 20;
  if (currentGameweek === 19 && deadlineTime) {
    isSecondHalf = new Date() > new Date(deadlineTime);
  }

  const usedChips = getUsedChips(chipsUsed, isSecondHalf);
  const remainingChips = getRemainingChips(chipsUsed, isSecondHalf);

  return {
    used: usedChips.map(getChipLabel),
    remaining: remainingChips.map(getChipLabel),
  };
}
