import { POSITION_TYPES } from '../constants/positions'

/**
 * Format a numeric delta value with explicit sign (+/-)
 * @param value - The delta value to format
 * @param precision - Number of decimal places (default: 1)
 * @returns Formatted string with sign prefix (e.g., "+1.5", "-2.0")
 */
export function formatDelta(value: number, precision = 1): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(precision)}`
}

/**
 * Get CSS class name for delta styling based on value
 * @param value - The delta value
 * @param invertedLogic - If true, negative is good (e.g., goals conceded)
 * @returns 'positive' or 'negative' CSS class name
 */
export function getDeltaClass(value: number, invertedLogic = false): 'positive' | 'negative' {
  // For inverted logic (e.g., goals conceded), only strictly positive is bad
  // Zero means "as expected" which is neutral/good in both cases
  if (invertedLogic) {
    return value > 0 ? 'negative' : 'positive'
  }
  return value >= 0 ? 'positive' : 'negative'
}

/**
 * Get legend text explaining goals vs xG delta
 * @param delta - Goals scored minus xG
 */
export function getGoalsDeltaLegend(delta: number): string {
  if (delta === 0) return 'scoring as expected'
  const abs = Math.abs(delta).toFixed(1)
  return delta > 0 ? `scored ${abs} more than xG` : `scored ${abs} fewer than xG`
}

/**
 * Get legend text explaining assists vs xA delta
 * @param delta - Assists minus xA
 */
export function getAssistsDeltaLegend(delta: number): string {
  if (delta === 0) return 'assisting as expected'
  const abs = Math.abs(delta).toFixed(1)
  return delta > 0 ? `${abs} more assists than xA` : `${abs} fewer assists than xA`
}

/**
 * Get legend text explaining goals conceded vs xGC delta
 * @param delta - Goals conceded minus xGC (positive = worse)
 */
export function getGoalsConcededDeltaLegend(delta: number): string {
  if (delta === 0) return 'conceding as expected'
  const abs = Math.abs(delta).toFixed(1)
  return delta > 0 ? `conceded ${abs} more than expected` : `conceded ${abs} fewer than expected`
}

/**
 * Get legend text explaining goal involvements (G+A) vs expected
 * @param delta - Goal involvements minus xGI
 */
export function getGoalInvolvementsDeltaLegend(delta: number): string {
  if (delta === 0) return 'G+A as expected'
  const abs = Math.abs(delta).toFixed(1)
  return delta > 0 ? `${abs} more G+A than expected` : `${abs} fewer G+A than expected`
}

interface SeasonStats {
  goals_scored: number
  assists: number
  clean_sheets: number
}

/**
 * Get position-appropriate season summary string
 * @param positionType - Player position (1=GK, 2=DEF, 3=MID, 4=FWD)
 * @param stats - Season stats object
 */
export function getSeasonSummary(positionType: number, stats: SeasonStats): string {
  const { goals_scored, assists, clean_sheets } = stats

  if (positionType === POSITION_TYPES.GOALKEEPER) {
    return `${clean_sheets} CS`
  }

  if (positionType === POSITION_TYPES.DEFENDER) {
    const goalInvolvements = goals_scored + assists
    return `${clean_sheets} CS · ${goalInvolvements} G+A`
  }

  // Midfielder and Forward show goals and assists
  return `${goals_scored}G ${assists}A`
}
