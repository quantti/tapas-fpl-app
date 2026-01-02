/**
 * Comparison utilities for head-to-head stats display.
 */

export type CompareResult = 'better' | 'worse' | 'neutral';

/**
 * Determines which value is better for comparison styling.
 * @param valueA - First value
 * @param valueB - Second value
 * @param inverted - If true, lower is better (e.g., rank, hits)
 */
export function getComparisonClass(
  valueA: number,
  valueB: number,
  inverted = false
): CompareResult {
  if (valueA === valueB) return 'neutral';
  const isABetter = inverted ? valueA < valueB : valueA > valueB;
  return isABetter ? 'better' : 'worse';
}

/**
 * Format large numbers with K/M suffix for display.
 * @param rank - The rank number to format
 */
export function formatRank(rank: number): string {
  if (rank >= 1_000_000) {
    return `${(rank / 1_000_000).toFixed(1)}M`;
  }
  if (rank >= 1_000) {
    return `${(rank / 1_000).toFixed(0)}K`;
  }
  return rank.toString();
}
